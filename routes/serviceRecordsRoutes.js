import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import ServiceRecord from '../models/ServiceRecord.js';
import ServiceBooking from '../models/ServiceBooking.js';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import Employee from '../models/Employee.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, getAccessibleEmployeeIds, requirePermission, validateRequest } from '../middleware/auth.js';
import { nextSequenceId, runInTransaction } from '../utils/sequence.js';
import {
  buildDateRangeFilter,
  createNotification,
  escapeRegex,
  findOrCreateCustomer,
  logActivity,
  parsePagination,
  stripImmutableFields
} from '../utils/crmHelpers.js';
import { filterAndPaginateMemory } from '../utils/memoryQuery.js';

const router = express.Router();

router.get('/', authMiddleware, requirePermission('serviceRecords:view'), async (req, res) => {
  try {
    const { paymentStatus, brand, technician, customerId, search, startDate, endDate } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['serviceDate', 'createdAt', 'serviceId', 'totalCharges', 'customerName'],
      'serviceDate'
    );

    if (isMongoConnected()) {
      const query = {};
      const perms = req.user?.permissions || [];
      if (!perms.includes('*') && !perms.includes('services.viewAll') && !perms.includes('serviceRecords:viewAll')) {
        const empIds = await getAccessibleEmployeeIds(req.user);
        query.technician = empIds.length ? { $in: empIds } : '__none__';
        if (!empIds.length) {
          return res.json({ success: true, data: [], pagination: { total: 0, page, limit, totalPages: 1 } });
        }
      }
      if (paymentStatus && paymentStatus !== 'All') query.paymentStatus = paymentStatus;
      if (brand && brand !== 'All') query.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
      if (technician && technician !== 'All' && mongoose.Types.ObjectId.isValid(technician)) {
        query.technician = technician;
      }
      if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
        query.customer = customerId;
      }
      const dateFilter = buildDateRangeFilter(startDate, endDate, 'serviceDate');
      if (dateFilter) Object.assign(query, dateFilter);

      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { serviceId: rx },
          { bookingId: rx },
          { customerName: rx },
          { phone: rx },
          { productName: rx },
          { brand: rx },
          { model: rx },
          { technicianName: rx }
        ];
      }

      const [data, total] = await Promise.all([
        ServiceRecord.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        ServiceRecord.countDocuments(query)
      ]);

      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const result = filterAndPaginateMemory(store.serviceRecords, {
      search,
      searchFields: ['serviceId', 'bookingId', 'customerName', 'phone', 'productName', 'brand', 'model', 'technicianName'],
      filters: { paymentStatus, brand, technician, customer: customerId },
      startDate,
      endDate,
      dateField: 'serviceDate',
      page,
      limit,
      sortBy,
      sortOrder
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/',
  authMiddleware,
  requirePermission('serviceRecords:create'),
  [
    body('workPerformed').trim().notEmpty().withMessage('Work performed description is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const parts = Array.isArray(req.body.partsReplaced) ? req.body.partsReplaced : [];
      const labourCharges = Number(req.body.labourCharges || 0);
      const calculatedParts = parts.reduce((sum, p) => sum + Number(p.quantity || 1) * Number(p.unitCost || 0), 0);
      const partsCharges = req.body.partsCharges !== undefined ? Number(req.body.partsCharges) : calculatedParts;
      const totalCharges = req.body.totalCharges !== undefined ? Number(req.body.totalCharges) : labourCharges + partsCharges;

      if (isMongoConnected()) {
        const record = await runInTransaction(async (session) => {
          let booking = null;
          if (req.body.booking && mongoose.Types.ObjectId.isValid(req.body.booking)) {
            booking = await ServiceBooking.findById(req.body.booking).session(session || null);
          }

          let customerRef = req.body.customer || booking?.customer || null;
          const customerName = (req.body.customerName || booking?.customerName || '').trim();
          const phone = (req.body.phone || booking?.phone || '').trim();
          if (!customerRef && customerName && phone) {
            const { customer } = await findOrCreateCustomer({ name: customerName, phone }, session);
            customerRef = customer._id;
          }

          let techId = req.body.technician || booking?.assignedTechnician || null;
          let techName = req.body.technicianName || booking?.assignedTechnicianName || '';
          if (techId && mongoose.Types.ObjectId.isValid(techId)) {
            const tech = await Employee.findById(techId).session(session || null);
            if (tech) techName = tech.name;
          } else {
            techId = null;
          }

          if (req.body.closeEnquiry) {
            if (!String(req.body.workPerformed || '').trim() || Number.isNaN(totalCharges)) {
              const err = new Error('Cannot close service without required completion information (Work Performed and Total Charges).');
              err.statusCode = 400;
              throw err;
            }
          }

          let linkedEnquiry = null;
          if (req.body.serviceEnquiry && mongoose.Types.ObjectId.isValid(req.body.serviceEnquiry)) {
            linkedEnquiry = await ServiceEnquiry.findById(req.body.serviceEnquiry).session(session || null);
          } else if (booking?.serviceEnquiry) {
            linkedEnquiry = await ServiceEnquiry.findById(booking.serviceEnquiry).session(session || null);
          }

          const serviceId = await nextSequenceId('TPS-REC', session);
          const [created] = await ServiceRecord.create(
            [
              {
                serviceId,
                booking: booking?._id || null,
                bookingId: req.body.bookingId || booking?.bookingId || '',
                serviceEnquiry: linkedEnquiry?._id || null,
                serviceEnquiryId: req.body.serviceEnquiryId || linkedEnquiry?.enquiryId || '',
                customer: customerRef,
                customerName: customerName || 'Customer',
                phone,
                productName: req.body.productName || booking?.product || linkedEnquiry?.productModel || '',
                brand: req.body.brand || booking?.brand || linkedEnquiry?.brand || '',
                model: req.body.model || booking?.productModel || linkedEnquiry?.productModel || '',
                serialNumber: req.body.serialNumber || linkedEnquiry?.serialNumber || '',
                technician: techId,
                technicianName: techName,
                serviceDate: req.body.serviceDate ? new Date(req.body.serviceDate) : new Date(),
                customerComplaint: req.body.customerComplaint || linkedEnquiry?.problemDescription || '',
                diagnosis: req.body.diagnosis || '',
                workPerformed: req.body.workPerformed,
                partsReplaced: parts,
                labourCharges,
                partsCharges,
                totalCharges,
                paymentStatus: req.body.paymentStatus || 'Paid',
                nextServiceDate: req.body.nextServiceDate ? new Date(req.body.nextServiceDate) : null,
                technicianRemarks: req.body.technicianRemarks || '',
                serviceReportUrl: req.body.serviceReportUrl || '',
                receiptNumber: req.body.receiptNumber || serviceId.replace('TPS-REC', 'TPS-RCPT'),
                receiptUrl: req.body.receiptUrl || '',
                isClosed: Boolean(req.body.closeEnquiry),
                closedAt: req.body.closeEnquiry ? new Date() : null,
                closedBy: req.body.closeEnquiry && req.user?.id && mongoose.Types.ObjectId.isValid(req.body.closeEnquiry ? req.user.id : '') ? req.user.id : null,
                closedByName: req.body.closeEnquiry ? req.user?.name || '' : ''
              }
            ],
            session ? { session } : {}
          );

          if (booking) {
            booking.status = 'Completed';
            await booking.save({ session: session || undefined });
          }
          if (linkedEnquiry && (req.body.closeEnquiry || booking)) {
            linkedEnquiry.status = 'Completed';
            if (req.body.receiptUrl) linkedEnquiry.receiptUrl = req.body.receiptUrl;
            await linkedEnquiry.save({ session: session || undefined });
          }

          await createNotification(
            {
              type: 'Service Completed',
              title: `Service Completed ${created.serviceId}`,
              message: `${created.customerName} — ${created.productName || created.brand} (₹${created.totalCharges})`,
              relatedModel: 'ServiceRecord',
              relatedId: created._id.toString(),
              link: '/admin/service-details',
              dedupeKey: `rec-${created._id.toString()}`
            },
            session
          );

          await logActivity(
            {
              entityType: 'ServiceRecord',
              entityId: created._id.toString(),
              entityRef: created.serviceId,
              action: 'CREATE',
              description: `Service completion record ${created.serviceId} saved (₹${created.totalCharges})`,
              user: req.user
            },
            session
          );

          return created;
        });

        return res.status(201).json({ success: true, data: record });
      }

      const booking = req.body.booking ? store.serviceBookings.find((b) => b.id === req.body.booking) : null;
      const tech = req.body.technician ? store.employees.find((e) => e.id === req.body.technician) : null;
      const serviceId = await nextSequenceId('TPS-REC');
      const created = {
        id: `rec-${Date.now()}`,
        serviceId,
        booking: booking?.id || null,
        bookingId: req.body.bookingId || booking?.bookingId || '',
        customer: req.body.customer || booking?.customer || null,
        customerName: req.body.customerName || booking?.customerName || 'Customer',
        phone: req.body.phone || booking?.phone || '',
        productName: req.body.productName || booking?.product || '',
        brand: req.body.brand || booking?.brand || '',
        model: req.body.model || booking?.productModel || '',
        serialNumber: req.body.serialNumber || '',
        technician: tech?.id || booking?.assignedTechnician || null,
        technicianName: tech?.name || booking?.assignedTechnicianName || '',
        serviceDate: req.body.serviceDate || new Date().toISOString(),
        customerComplaint: req.body.customerComplaint || '',
        diagnosis: req.body.diagnosis || '',
        workPerformed: req.body.workPerformed,
        partsReplaced: parts,
        labourCharges,
        partsCharges,
        totalCharges,
        paymentStatus: req.body.paymentStatus || 'Paid',
        nextServiceDate: req.body.nextServiceDate || null,
        technicianRemarks: req.body.technicianRemarks || '',
        createdAt: new Date().toISOString()
      };
      store.serviceRecords.unshift(created);
      if (booking) {
        booking.status = 'Completed';
        if (booking.serviceEnquiry) {
          const enq = store.serviceEnquiries.find((e) => e.id === booking.serviceEnquiry);
          if (enq) enq.status = 'Completed';
        }
      }
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/:id', authMiddleware, requirePermission('serviceRecords:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.labourCharges !== undefined || update.partsCharges !== undefined) {
      update.totalCharges = Number(update.labourCharges || 0) + Number(update.partsCharges || 0);
    }
    if (isMongoConnected()) {
      const existing = await ServiceRecord.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Service record not found' });
      const perms = req.user?.permissions || [];
      if (!perms.includes('*') && !perms.includes('services.viewAll') && !perms.includes('serviceRecords:viewAll')) {
        const empIds = (await getAccessibleEmployeeIds(req.user)).map((id) => id.toString());
        if (!existing.technician || !empIds.includes(existing.technician.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: service record is not assigned to you.' });
        }
      }
      const updated = await ServiceRecord.findByIdAndUpdate(req.params.id, update, { new: true });
      return res.json({ success: true, data: updated });
    }
    const idx = store.serviceRecords.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Service record not found' });
    store.serviceRecords[idx] = { ...store.serviceRecords[idx], ...update, updatedAt: new Date().toISOString() };
    res.json({ success: true, data: store.serviceRecords[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authMiddleware, requirePermission('serviceRecords:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await ServiceRecord.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Service record not found' });
      return res.json({ success: true, message: 'Service record deleted' });
    }
    const idx = store.serviceRecords.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Service record not found' });
    store.serviceRecords.splice(idx, 1);
    res.json({ success: true, message: 'Service record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
