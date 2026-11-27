import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
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

router.get('/', authMiddleware, requirePermission('serviceBookings:view'), async (req, res) => {
  try {
    const { status, technician, priority, search, startDate, endDate } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['appointmentDate', 'createdAt', 'bookingId', 'customerName', 'status', 'estimatedCharges'],
      'appointmentDate'
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
          return res.json({ success: true, data: [], pagination: { total: 0, page, limit, totalPages: 1 } });
        }
        query.assignedTechnician = { $in: empIds };
      } else if (technician && technician !== 'All' && mongoose.Types.ObjectId.isValid(technician)) {
        query.assignedTechnician = technician;
      }
      if (status && status !== 'All') query.status = status;
      if (priority && priority !== 'All') query.priority = priority;
      const dateFilter = buildDateRangeFilter(startDate, endDate, 'appointmentDate');
      if (dateFilter) Object.assign(query, dateFilter);

      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { bookingId: rx },
          { enquiryId: rx },
          { customerName: rx },
          { phone: rx },
          { brand: rx },
          { serviceType: rx },
          { serviceAddress: rx }
        ];
      }

      const [data, total] = await Promise.all([
        ServiceBooking.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        ServiceBooking.countDocuments(query)
      ]);

      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const result = filterAndPaginateMemory(store.serviceBookings, {
      search,
      searchFields: ['bookingId', 'enquiryId', 'customerName', 'phone', 'brand', 'serviceType', 'serviceAddress'],
      filters: { status, priority, assignedTechnician: technician },
      startDate,
      endDate,
      dateField: 'appointmentDate',
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
  requirePermission('serviceBookings:create'),
  [
    body('appointmentDate').notEmpty().withMessage('Appointment date is required'),
    body('serviceType').trim().notEmpty().withMessage('Service type is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const {
        serviceEnquiryId,
        customerName,
        phone,
        product,
        brand,
        productModel,
        serviceType,
        serviceAddress,
        city,
        appointmentDate,
        appointmentTime,
        assignedTechnician,
        priority,
        estimatedCharges,
        allowMultipleVisits,
        notes
      } = req.body;

      if (isMongoConnected()) {
        const result = await runInTransaction(async (session) => {
          let enquiry = null;
          if (serviceEnquiryId && mongoose.Types.ObjectId.isValid(serviceEnquiryId)) {
            enquiry = await ServiceEnquiry.findById(serviceEnquiryId).session(session || null);
          }

          let visitNumber = 1;
          if (enquiry) {
            const existingBookings = await ServiceBooking.find({
              serviceEnquiry: enquiry._id,
              status: { $nin: ['Cancelled'] }
            }).session(session || null);

            if (existingBookings.length > 0 && !allowMultipleVisits) {
              const err = new Error(
                `An active booking (${existingBookings[0].bookingId}) already exists for enquiry ${enquiry.enquiryId}. Enable "Additional Visit" if scheduling a follow-up visit.`
              );
              err.statusCode = 409;
              throw err;
            }
            visitNumber = existingBookings.length + 1;
          }

          const finalName = (customerName || enquiry?.customerName || '').trim();
          const finalPhone = (phone || enquiry?.phone || '').trim();
          if (!finalName || !finalPhone) {
            const err = new Error('Customer name and phone number are required');
            err.statusCode = 400;
            throw err;
          }

          let customerIdRef = enquiry?.customer || null;
          if (!customerIdRef) {
            const { customer } = await findOrCreateCustomer(
              { name: finalName, phone: finalPhone, serviceAddress, city },
              session
            );
            customerIdRef = customer._id;
          }

          let techId = null;
          let techName = '';
          if (assignedTechnician && mongoose.Types.ObjectId.isValid(assignedTechnician)) {
            const tech = await Employee.findById(assignedTechnician).session(session || null);
            if (tech) {
              techId = tech._id;
              techName = tech.name;
            }
          } else if (enquiry?.assignedTechnician) {
            techId = enquiry.assignedTechnician;
            techName = enquiry.assignedTechnicianName || '';
          }

          const bookingId = await nextSequenceId('TPS-BKG', session);
          const status = req.body.status || (techId ? 'Technician Assigned' : 'Confirmed');

          const [booking] = await ServiceBooking.create(
            [
              {
                bookingId,
                serviceEnquiry: enquiry?._id || null,
                enquiryId: enquiry?.enquiryId || '',
                customer: customerIdRef,
                customerName: finalName,
                phone: finalPhone,
                product: product || enquiry?.productModel || '',
                brand: brand || enquiry?.brand || '',
                productModel: productModel || enquiry?.productModel || '',
                serviceType,
                serviceAddress: serviceAddress || enquiry?.serviceAddress || enquiry?.location || '',
                city: city || enquiry?.city || 'Salem',
                appointmentDate: new Date(appointmentDate),
                appointmentTime: appointmentTime || enquiry?.preferredTimeSlot || '10:00 AM - 12:00 PM',
                assignedTechnician: techId,
                assignedTechnicianName: techName,
                priority: priority || enquiry?.priority || 'Medium',
                estimatedCharges: Number(estimatedCharges || 0),
                visitNumber,
                status,
                notes: notes || ''
              }
            ],
            session ? { session } : {}
          );

          if (enquiry) {
            enquiry.status = techId ? 'Assigned' : 'Appointment Scheduled';
            if (techId) {
              enquiry.assignedTechnician = techId;
              enquiry.assignedTechnicianName = techName;
            }
            await enquiry.save({ session: session || undefined });
          }

          await createNotification(
            {
              type: 'New Booking',
              title: `Booking ${booking.bookingId} Scheduled`,
              message: `${booking.customerName} — ${booking.serviceType} on ${new Date(booking.appointmentDate).toLocaleDateString()}`,
              relatedModel: 'ServiceBooking',
              relatedId: booking._id.toString(),
              link: `/admin/service-bookings`,
              dedupeKey: `bkg-${booking._id.toString()}`
            },
            session
          );

          await logActivity(
            {
              entityType: 'ServiceBooking',
              entityId: booking._id.toString(),
              entityRef: booking.bookingId,
              action: 'CREATE',
              description: `Booking ${booking.bookingId} created${enquiry ? ` from ${enquiry.enquiryId}` : ''}`,
              user: req.user
            },
            session
          );

          return booking;
        });

        return res.status(201).json({ success: true, data: result });
      }

      // In-memory fallback
      const enquiry = serviceEnquiryId ? store.serviceEnquiries.find((s) => s.id === serviceEnquiryId) : null;
      if (enquiry) {
        const existing = store.serviceBookings.filter(
          (b) => b.serviceEnquiry === enquiry.id && b.status !== 'Cancelled'
        );
        if (existing.length > 0 && !allowMultipleVisits) {
          return res.status(409).json({
            success: false,
            message: `An active booking (${existing[0].bookingId}) already exists for enquiry ${enquiry.enquiryId}. Enable "Additional Visit" to schedule another visit.`
          });
        }
      }

      const tech = assignedTechnician ? store.employees.find((e) => e.id === assignedTechnician) : null;
      const bookingId = await nextSequenceId('TPS-BKG');
      const created = {
        id: `bkg-${Date.now()}`,
        bookingId,
        serviceEnquiry: enquiry?.id || null,
        enquiryId: enquiry?.enquiryId || '',
        customer: enquiry?.customer || null,
        customerName: customerName || enquiry?.customerName || 'Customer',
        phone: phone || enquiry?.phone || '',
        product: product || enquiry?.productModel || '',
        brand: brand || enquiry?.brand || '',
        productModel: productModel || enquiry?.productModel || '',
        serviceType,
        serviceAddress: serviceAddress || enquiry?.serviceAddress || '',
        city: city || enquiry?.city || 'Salem',
        appointmentDate,
        appointmentTime: appointmentTime || '10:00 AM - 12:00 PM',
        assignedTechnician: tech?.id || enquiry?.assignedTechnician || null,
        assignedTechnicianName: tech?.name || enquiry?.assignedTechnicianName || '',
        priority: priority || 'Medium',
        estimatedCharges: Number(estimatedCharges || 0),
        visitNumber: 1,
        status: req.body.status || (tech ? 'Technician Assigned' : 'Confirmed'),
        notes: notes || '',
        createdAt: new Date().toISOString()
      };
      store.serviceBookings.unshift(created);
      if (enquiry) enquiry.status = tech ? 'Assigned' : 'Appointment Scheduled';
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }
);

const assertBookingAccess = async (user, booking) => {
  const perms = user?.permissions || [];
  if (perms.includes('*') || perms.includes('services.viewAll')) return true;
  const empIds = perms.includes('employees.viewTeam')
    ? await getAccessibleEmployeeIds(user)
    : user.employeeObjectId
    ? [user.employeeObjectId]
    : [];
  const allowed = empIds.map((id) => id.toString());
  return Boolean(booking?.assignedTechnician && allowed.includes(booking.assignedTechnician.toString()));
};

const updateBookingHandler = async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (isMongoConnected()) {
      const existing = await ServiceBooking.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Booking not found' });
      if (!(await assertBookingAccess(req.user, existing))) {
        return res.status(403).json({ success: false, message: 'Access denied: booking is not assigned to you.' });
      }
      if (update.assignedTechnician && mongoose.Types.ObjectId.isValid(update.assignedTechnician)) {
        const tech = await Employee.findById(update.assignedTechnician);
        if (tech) update.assignedTechnicianName = tech.name;
      } else if (update.assignedTechnician === '') {
        update.assignedTechnician = null;
        update.assignedTechnicianName = '';
      }
      if (update.appointmentDate) update.appointmentDate = new Date(update.appointmentDate);

      const updated = await ServiceBooking.findByIdAndUpdate(req.params.id, update, { new: true });

      await logActivity({
        entityType: 'ServiceBooking',
        entityId: updated._id.toString(),
        entityRef: updated.bookingId,
        action: 'UPDATE',
        description: `Updated booking ${updated.bookingId}${update.status ? ` → ${update.status}` : ''}`,
        user: req.user
      });
      return res.json({ success: true, data: updated });
    }

    const idx = store.serviceBookings.findIndex((b) => b.id === req.params.id || b.bookingId === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (update.assignedTechnician) {
      const tech = store.employees.find((e) => e.id === update.assignedTechnician);
      if (tech) update.assignedTechnicianName = tech.name;
    }
    store.serviceBookings[idx] = { ...store.serviceBookings[idx], ...update, updatedAt: new Date().toISOString() };
    res.json({ success: true, data: store.serviceBookings[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

router.put('/:id', authMiddleware, requirePermission('serviceBookings:edit'), updateBookingHandler);
router.patch('/:id', authMiddleware, requirePermission('serviceBookings:edit'), updateBookingHandler);

router.delete('/:id', authMiddleware, requirePermission('serviceBookings:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await ServiceBooking.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Booking not found' });
      return res.json({ success: true, message: 'Booking deleted successfully' });
    }
    const idx = store.serviceBookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Booking not found' });
    store.serviceBookings.splice(idx, 1);
    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
