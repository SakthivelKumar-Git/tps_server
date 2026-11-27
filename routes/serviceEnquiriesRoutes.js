import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import ServiceBooking from '../models/ServiceBooking.js';
import Employee from '../models/Employee.js';
import ActivityLog from '../models/ActivityLog.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, getAccessibleEmployeeIds, requirePermission, validateRequest } from '../middleware/auth.js';
import { uploadProductImage } from '../middleware/upload.js';
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

export const createServiceEnquiryHandler = async (req, res) => {
  try {
    const customerName = (req.body.customerName || '').trim();
    const phone = (req.body.phone || '').trim();
    const serviceType = (req.body.serviceType || req.body.serviceRequired || req.body.productCategory || '').trim();

    if (!customerName || !phone || !serviceType) {
      return res.status(400).json({
        success: false,
        message: 'Customer Name, Mobile Number, and Service Type are required.'
      });
    }

    const submissionToken = (req.body.submissionToken || '').trim() || undefined;
    const productImage = req.file ? `/uploads/${req.file.filename}` : (req.body.productImage || '');

    const payload = {
      customerName,
      phone,
      email: (req.body.email || '').trim().toLowerCase(),
      company: (req.body.company || '').trim(),
      altPhone: (req.body.altPhone || '').trim(),
      referral: (req.body.referral || req.body.referralName || '').trim(),
      referralType: req.body.referralType || 'None',
      referralName: (req.body.referralName || '').trim(),
      referralMobile: (req.body.referralMobile || '').trim(),
      serviceAddress: (req.body.serviceAddress || req.body.location || '').trim(),
      city: (req.body.city || 'Salem').trim(),
      pincode: (req.body.pincode || '').trim(),
      location: (req.body.location || `${req.body.serviceAddress ? req.body.serviceAddress + ', ' : ''}${req.body.city || 'Salem'}`).trim(),
      showPurchasedOnly: Boolean(req.body.showPurchasedOnly),
      brand: (req.body.brand || '').trim(),
      productCategory: (req.body.productCategory || serviceType).trim(),
      subcategory: (req.body.subcategory || '').trim(),
      productModel: (req.body.productModel || '').trim(),
      serialNumber: (req.body.serialNumber || '').trim(),
      selectedProducts: Array.isArray(req.body.selectedProducts) ? req.body.selectedProducts : [],
      serviceType,
      serviceDate: req.body.serviceDate ? new Date(req.body.serviceDate) : (req.body.preferredDate ? new Date(req.body.preferredDate) : null),
      problemDescription: (req.body.problemDescription || '').trim(),
      remarks: (req.body.remarks || '').trim(),
      specialInstructions: (req.body.specialInstructions || '').trim(),
      estimatedCost: Number(req.body.estimatedCost || 0),
      dealer: req.body.dealer && mongoose.Types.ObjectId.isValid(req.body.dealer) ? req.body.dealer : null,
      dealerName: (req.body.dealerName || '').trim(),
      preferredDate: req.body.preferredDate ? new Date(req.body.preferredDate) : (req.body.serviceDate ? new Date(req.body.serviceDate) : null),
      preferredTimeSlot: (req.body.preferredTimeSlot || '').trim(),
      productImage,
      additionalNotes: (req.body.additionalNotes || '').trim(),
      assignedTechnician: req.body.assignedTechnician && mongoose.Types.ObjectId.isValid(req.body.assignedTechnician) ? req.body.assignedTechnician : null,
      assignedTechnicianName: (req.body.assignedTechnicianName || '').trim(),
      createdBy: req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null,
      createdByName: req.user?.name || 'Website Visitor',
      priority: req.body.priority || 'Medium',
      status: req.body.status || (req.body.assignedTechnician ? 'Assigned' : 'New'),
      approvalStatus: req.body.approvalStatus || 'Pending',
      source: req.user ? 'Admin Entry' : 'Website'
    };

    if (isMongoConnected()) {
      // Idempotency guard against accidental double-clicks / retries
      if (submissionToken) {
        const existing = await ServiceEnquiry.findOne({ submissionToken });
        if (existing) {
          return res.status(200).json({
            success: true,
            duplicatePrevented: true,
            message: `Service enquiry ${existing.enquiryId} already registered.`,
            data: existing
          });
        }
      }

      const created = await runInTransaction(async (session) => {
        let linkedCustomerId =
          req.body.customerId && mongoose.Types.ObjectId.isValid(req.body.customerId) ? req.body.customerId : null;
        if (!linkedCustomerId) {
          const { customer } = await findOrCreateCustomer(
            {
              name: payload.customerName,
              phone: payload.phone,
              email: payload.email,
              company: payload.company,
              altPhone: payload.altPhone,
              serviceAddress: payload.serviceAddress,
              city: payload.city,
              pincode: payload.pincode,
              referralType: payload.referralType,
              referralName: payload.referralName,
              referralMobile: payload.referralMobile,
              createdBy: payload.createdBy,
              createdByName: payload.createdByName
            },
            session
          );
          linkedCustomerId = customer._id;
        }

        if (payload.assignedTechnician) {
          const tech = await Employee.findById(payload.assignedTechnician).session(session || null);
          if (tech) payload.assignedTechnicianName = tech.name;
        }

        const enquiryId = await nextSequenceId('TPS-SRV', session);
        const doc = {
          ...payload,
          enquiryId,
          customer: linkedCustomerId,
          ...(submissionToken ? { submissionToken } : {})
        };

        const [enquiry] = await ServiceEnquiry.create([doc], session ? { session } : {});

        await createNotification(
          {
            type: enquiry.assignedTechnician ? 'Service Assigned' : 'New Service Enquiry',
            title: enquiry.assignedTechnician
              ? `Service Assigned ${enquiry.enquiryId}`
              : `New Service Enquiry ${enquiry.enquiryId}`,
            message: `${enquiry.customerName} (${enquiry.phone}) requested ${enquiry.serviceType} (${enquiry.brand || 'Pump'})${enquiry.assignedTechnicianName ? ` — Assigned to ${enquiry.assignedTechnicianName}` : ''}`,
            relatedModel: 'ServiceEnquiry',
            relatedId: enquiry._id.toString(),
            link: enquiry.assignedTechnician ? '/employee/services' : `/admin/service-enquiries?id=${enquiry._id.toString()}`,
            recipientEmployee: enquiry.assignedTechnician || null,
            targetRoles: ['Super Admin', 'Admin'],
            metadata: {
              customerName: enquiry.customerName,
              customerPhone: enquiry.phone,
              serviceType: enquiry.serviceType,
              assignedEmployeeName: enquiry.assignedTechnicianName
            },
            dedupeKey: `srvenq-${enquiry._id.toString()}`
          },
          session
        );

        await logActivity(
          {
            entityType: 'ServiceEnquiry',
            entityId: enquiry._id.toString(),
            entityRef: enquiry.enquiryId,
            action: 'CREATE',
            description: `Service enquiry ${enquiry.enquiryId} created (${enquiry.serviceType})`,
            user: req.user,
            ipAddress: req.ip
          },
          session
        );

        return enquiry;
      });

      return res.status(201).json({
        success: true,
        message: `Service request ${created.enquiryId} registered successfully. Our certified technician will contact you.`,
        data: created
      });
    }

    // Fallback in-memory mode
    if (submissionToken) {
      const existing = store.serviceEnquiries.find((s) => s.submissionToken === submissionToken);
      if (existing) {
        return res.status(200).json({
          success: true,
          duplicatePrevented: true,
          message: `Service enquiry ${existing.enquiryId} already registered.`,
          data: existing
        });
      }
    }

    const { customer } = store.findOrCreateCustomer(payload);
    const enquiryId = await nextSequenceId('TPS-SRV');
    const created = {
      ...payload,
      id: `srvenq-${Date.now()}`,
      enquiryId,
      customer: customer.id,
      serviceRequired: payload.serviceType,
      notesList: [],
      submissionToken,
      createdAt: new Date().toISOString()
    };
    store.serviceEnquiries.unshift(created);
    store.addNotification({
      type: 'New Service Enquiry',
      title: `New Service Enquiry ${enquiryId}`,
      message: `${created.customerName} requested ${created.serviceType}`,
      relatedModel: 'ServiceEnquiry',
      relatedId: created.id,
      link: `/admin/service-enquiries?id=${created.id}`,
      dedupeKey: `srvenq-${created.id}`
    });
    store.addActivityLog({
      entityType: 'ServiceEnquiry',
      entityId: created.id,
      entityRef: enquiryId,
      action: 'CREATE',
      description: `Service enquiry ${enquiryId} created (${created.serviceType})`,
      performedByName: req.user?.name || 'Customer'
    });

    res.status(201).json({
      success: true,
      message: `Service request ${enquiryId} registered successfully. Our certified technician will contact you.`,
      data: created
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

router.post('/', uploadProductImage.single('productImage'), createServiceEnquiryHandler);

router.get('/', authMiddleware, requirePermission('serviceEnquiries:view'), async (req, res) => {
  try {
    const { status, approvalStatus, brand, serviceType, priority, technician, search, startDate, endDate } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['createdAt', 'preferredDate', 'enquiryId', 'customerName', 'status', 'priority'],
      'createdAt'
    );

    if (isMongoConnected()) {
      const query = {};
      const perms = req.user.permissions || [];
      if (!perms.includes('*') && !perms.includes('services.viewAll')) {
        const empIds = perms.includes('employees.viewTeam')
          ? await getAccessibleEmployeeIds(req.user)
          : req.user.employeeObjectId
          ? [req.user.employeeObjectId]
          : [];
        if (empIds.length === 0) {
          return res.json({ success: true, data: [], statusCounts: { new: 0, pending: 0, inProgress: 0, completed: 0 }, pagination: { total: 0, page, limit, totalPages: 1 } });
        }
        query.assignedTechnician = { $in: empIds };
      } else if (technician && technician !== 'All' && mongoose.Types.ObjectId.isValid(technician)) {
        query.assignedTechnician = technician;
      }
      if (status && status !== 'All' && status !== 'all') query.status = status;
      if (approvalStatus && approvalStatus !== 'All') query.approvalStatus = approvalStatus;
      if (brand && brand !== 'All') query.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
      if (serviceType && serviceType !== 'All') query.serviceType = new RegExp(escapeRegex(serviceType), 'i');
      if (priority && priority !== 'All') query.priority = priority;
      const dateFilter = buildDateRangeFilter(startDate, endDate, 'createdAt');
      if (dateFilter) Object.assign(query, dateFilter);

      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { enquiryId: rx },
          { customerName: rx },
          { phone: rx },
          { brand: rx },
          { productModel: rx },
          { serviceType: rx },
          { location: rx },
          { city: rx }
        ];
      }

      const [data, total, allCountsAgg] = await Promise.all([
        ServiceEnquiry.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        ServiceEnquiry.countDocuments(query),
        ServiceEnquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      ]);
      const statusMap = Object.fromEntries(allCountsAgg.map((c) => [c._id, c.count]));
      const statusCounts = {
        new: statusMap['New'] || 0,
        pending: (statusMap['Pending Review'] || 0) + (statusMap['Waiting for Parts'] || 0),
        inProgress: (statusMap['Appointment Scheduled'] || 0) + (statusMap['Assigned'] || 0) + (statusMap['In Progress'] || 0),
        completed: statusMap['Completed'] || 0
      };

      return res.json({
        success: true,
        data,
        statusCounts,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const result = filterAndPaginateMemory(store.serviceEnquiries, {
      search,
      searchFields: ['enquiryId', 'customerName', 'phone', 'brand', 'productModel', 'serviceType', 'location', 'city'],
      filters: { status, brand, serviceType, priority, assignedTechnician: technician },
      startDate,
      endDate,
      page,
      limit,
      sortBy,
      sortOrder
    });
    const statusCounts = {
      new: store.serviceEnquiries.filter((e) => e.status === 'New').length,
      pending: store.serviceEnquiries.filter((e) => ['Pending Review', 'Waiting for Parts'].includes(e.status)).length,
      inProgress: store.serviceEnquiries.filter((e) => ['Appointment Scheduled', 'Assigned', 'In Progress'].includes(e.status)).length,
      completed: store.serviceEnquiries.filter((e) => e.status === 'Completed').length
    };
    res.json({ success: true, statusCounts, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const assertEnquiryAccess = async (user, enquiry) => {
  const perms = user?.permissions || [];
  if (perms.includes('*') || perms.includes('services.viewAll')) return true;
  const empIds = perms.includes('employees.viewTeam')
    ? await getAccessibleEmployeeIds(user)
    : user.employeeObjectId
    ? [user.employeeObjectId]
    : [];
  const allowed = empIds.map((id) => id.toString());
  return Boolean(enquiry?.assignedTechnician && allowed.includes(enquiry.assignedTechnician.toString()));
};

router.get('/:id', authMiddleware, requirePermission('serviceEnquiries:view'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const cond = mongoose.Types.ObjectId.isValid(req.params.id)
        ? { $or: [{ _id: req.params.id }, { enquiryId: req.params.id }] }
        : { enquiryId: req.params.id };
      const enquiry = await ServiceEnquiry.findOne(cond).populate('customer');
      if (!enquiry) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
      if (!(await assertEnquiryAccess(req.user, enquiry))) {
        return res.status(403).json({ success: false, message: 'Access denied: service enquiry is not assigned to you.' });
      }

      const [bookings, timeline] = await Promise.all([
        ServiceBooking.find({ serviceEnquiry: enquiry._id }).sort({ createdAt: -1 }),
        ActivityLog.find({ entityType: 'ServiceEnquiry', entityId: enquiry._id.toString() }).sort({ createdAt: -1 })
      ]);
      return res.json({ success: true, data: { ...enquiry.toJSON(), bookings, timeline } });
    }

    const enquiry = store.serviceEnquiries.find((s) => s.id === req.params.id || s.enquiryId === req.params.id);
    if (!enquiry) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
    const bookings = store.serviceBookings.filter((b) => b.serviceEnquiry === enquiry.id || b.enquiryId === enquiry.enquiryId);
    const timeline = store.activityLogs.filter((a) => a.entityType === 'ServiceEnquiry' && a.entityId === enquiry.id);
    res.json({ success: true, data: { ...enquiry, bookings, timeline } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const updateEnquiryHandler = async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.status === 'Pending') update.status = 'Pending Review';

    if (isMongoConnected()) {
      const existing = await ServiceEnquiry.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
      if (!(await assertEnquiryAccess(req.user, existing))) {
        return res.status(403).json({ success: false, message: 'Access denied: service enquiry is not assigned to you.' });
      }
      if (update.assignedTechnician && mongoose.Types.ObjectId.isValid(update.assignedTechnician)) {
        const tech = await Employee.findById(update.assignedTechnician);
        if (tech) update.assignedTechnicianName = tech.name;
      } else if (update.assignedTechnician === '') {
        update.assignedTechnician = null;
        update.assignedTechnicianName = '';
      }

      const updated = await ServiceEnquiry.findByIdAndUpdate(req.params.id, update, { new: true });

      const newlyAssigned =
        update.assignedTechnician &&
        String(update.assignedTechnician) !== String(existing.assignedTechnician || '');
      if (newlyAssigned) {
        await createNotification({
          type: 'Service Assigned',
          title: `Service Assigned — ${updated.enquiryId}`,
          message: `${updated.customerName} (${updated.phone}) — ${updated.serviceType} assigned to ${updated.assignedTechnicianName || 'Technician'}.`,
          relatedModel: 'ServiceEnquiry',
          relatedId: updated._id.toString(),
          link: '/employee/services',
          recipientEmployee: updated.assignedTechnician,
          metadata: {
            customerName: updated.customerName,
            customerPhone: updated.phone,
            serviceType: updated.serviceType,
            assignedEmployeeName: updated.assignedTechnicianName
          },
          dedupeKey: `srvasn-${updated._id.toString()}-${updated.assignedTechnician}`
        });
      }

      await logActivity({
        entityType: 'ServiceEnquiry',
        entityId: updated._id.toString(),
        entityRef: updated.enquiryId,
        module: 'Services',
        action: newlyAssigned ? 'ASSIGN_TECHNICIAN' : 'UPDATE',
        description: `Updated enquiry ${updated.enquiryId}${update.status ? ` → ${update.status}` : ''}${update.assignedTechnicianName ? ` (Assigned: ${update.assignedTechnicianName})` : ''}`,
        previousValues: { status: existing.status, assignedTechnician: existing.assignedTechnicianName },
        newValues: { status: updated.status, assignedTechnician: updated.assignedTechnicianName },
        user: req.user
      });
      return res.json({ success: true, data: updated });
    }

    const idx = store.serviceEnquiries.findIndex((s) => s.id === req.params.id || s.enquiryId === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
    if (update.assignedTechnician) {
      const tech = store.employees.find((e) => e.id === update.assignedTechnician);
      if (tech) update.assignedTechnicianName = tech.name;
    }
    store.serviceEnquiries[idx] = { ...store.serviceEnquiries[idx], ...update, updatedAt: new Date().toISOString() };
    res.json({ success: true, data: store.serviceEnquiries[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

router.put('/:id', authMiddleware, requirePermission('serviceEnquiries:edit'), updateEnquiryHandler);
router.patch('/:id', authMiddleware, requirePermission('serviceEnquiries:edit'), updateEnquiryHandler);

router.patch('/:id/approval', authMiddleware, requirePermission('serviceEnquiries:edit'), async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'MongoDB required for approval workflow.' });
    }
    const { approvalStatus, rejectionReason = '' } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid approval status.' });
    }
    const existing = await ServiceEnquiry.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Service enquiry not found' });

    const prevApproval = existing.approvalStatus;
    existing.approvalStatus = approvalStatus;
    existing.approvedBy = req.user.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null;
    existing.approvedByName = req.user.name || 'Admin';
    existing.approvedAt = new Date();
    existing.rejectionReason = approvalStatus === 'Rejected' ? rejectionReason : '';
    await existing.save();

    await logActivity({
      entityType: 'ServiceEnquiry',
      entityId: existing._id.toString(),
      entityRef: existing.enquiryId,
      module: 'Services',
      action: `APPROVAL_${approvalStatus.toUpperCase()}`,
      description: `Service enquiry ${existing.enquiryId} approval marked ${approvalStatus}`,
      previousValues: { approvalStatus: prevApproval },
      newValues: { approvalStatus, rejectionReason: existing.rejectionReason },
      user: req.user
    });

    res.json({ success: true, data: existing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post(
  '/:id/receipt',
  authMiddleware,
  requirePermission('serviceEnquiries:edit'),
  uploadProductImage.single('receipt'),
  async (req, res) => {
    try {
      const receiptUrl = req.file ? `/uploads/${req.file.filename}` : req.body.receiptUrl || '';
      if (!receiptUrl) return res.status(400).json({ success: false, message: 'Receipt file or URL is required' });
      if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
      const existing = await ServiceEnquiry.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
      if (!(await assertEnquiryAccess(req.user, existing))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      existing.receiptUrl = receiptUrl;
      await existing.save();
      res.json({ success: true, data: existing });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/:id/notes',
  authMiddleware,
  requirePermission('serviceEnquiries:edit'),
  [body('text').trim().notEmpty().withMessage('Note text is required')],
  validateRequest,
  async (req, res) => {
    try {
      const note = { text: req.body.text, addedBy: req.user?.name || 'Admin', createdAt: new Date() };
      if (isMongoConnected()) {
        const existing = await ServiceEnquiry.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
        if (!(await assertEnquiryAccess(req.user, existing))) {
          return res.status(403).json({ success: false, message: 'Access denied: service enquiry is not assigned to you.' });
        }
        const updated = await ServiceEnquiry.findByIdAndUpdate(
          req.params.id,
          { $push: { notesList: note }, $set: { internalNotes: req.body.text } },
          { new: true }
        );
        await logActivity({
          entityType: 'ServiceEnquiry',
          entityId: updated._id.toString(),
          entityRef: updated.enquiryId,
          action: 'NOTE_ADDED',
          description: `Internal note added: ${req.body.text.slice(0, 80)}`,
          user: req.user
        });
        return res.json({ success: true, data: updated });
      }

      const item = store.serviceEnquiries.find((s) => s.id === req.params.id);
      if (!item) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
      item.notesList = item.notesList || [];
      item.notesList.unshift({ ...note, id: `snote-${Date.now()}` });
      item.internalNotes = req.body.text;
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.delete('/:id', authMiddleware, requirePermission('serviceEnquiries:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await ServiceEnquiry.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
      return res.json({ success: true, message: 'Service enquiry deleted successfully' });
    }
    const idx = store.serviceEnquiries.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
    store.serviceEnquiries.splice(idx, 1);
    res.json({ success: true, message: 'Service enquiry deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
