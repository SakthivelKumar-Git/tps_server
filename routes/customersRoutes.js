import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Customer from '../models/Customer.js';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import ServiceBooking from '../models/ServiceBooking.js';
import ServiceRecord from '../models/ServiceRecord.js';
import Warranty from '../models/Warranty.js';
import AmcContract from '../models/AmcContract.js';
import FollowUp from '../models/FollowUp.js';
import Lead from '../models/Lead.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, getAccessibleEmployeeIds, requirePermission, validateRequest } from '../middleware/auth.js';
import { nextSequenceId, normalizePhone } from '../utils/sequence.js';
import { escapeRegex, logActivity, parsePagination, stripImmutableFields } from '../utils/crmHelpers.js';
import { filterAndPaginateMemory } from '../utils/memoryQuery.js';

const router = express.Router();

const getAssignedCustomerIds = async (user) => {
  const empIds = (user.permissions || []).includes('employees.viewTeam') || user.role === 'Senior Sales Executive' || user.role === 'Manager'
    ? await getAccessibleEmployeeIds(user)
    : user.employeeObjectId
    ? [user.employeeObjectId]
    : [];
  if (empIds.length === 0) return [];
  const [fromLeads, fromEnq, fromBkg, directCust] = await Promise.all([
    Lead.distinct('convertedCustomer', { assignedEmployee: { $in: empIds }, convertedCustomer: { $ne: null } }),
    ServiceEnquiry.distinct('customer', { assignedTechnician: { $in: empIds }, customer: { $ne: null } }),
    ServiceBooking.distinct('customer', { assignedTechnician: { $in: empIds }, customer: { $ne: null } }),
    Customer.distinct('_id', { assignedEmployee: { $in: empIds } })
  ]);
  const all = [...fromLeads, ...fromEnq, ...fromBkg, ...directCust].map((id) => id.toString());
  return Array.from(new Set(all));
};

router.get('/lookup-phone', authMiddleware, async (req, res) => {
  try {
    const raw = String(req.query.phone || '').trim();
    const normalizedPhone = normalizePhone(raw);
    if (!normalizedPhone || normalizedPhone.length < 7) {
      return res.json({ success: true, found: false, data: null });
    }
    if (isMongoConnected()) {
      const customer = await Customer.findOne({ normalizedPhone });
      if (!customer) {
        return res.json({ success: true, found: false, data: null });
      }
      return res.json({ success: true, found: true, data: customer });
    }
    const mem = store.customers.find((c) => c.normalizedPhone === normalizedPhone);
    res.json({ success: true, found: Boolean(mem), data: mem || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', authMiddleware, requirePermission('customers:view'), async (req, res) => {
  try {
    const { customerType, status, city, search } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['createdAt', 'name', 'customerId', 'city', 'customerType', 'status'],
      'createdAt'
    );

    if (isMongoConnected()) {
      const query = {};
      const perms = req.user.permissions || [];
      if (!perms.includes('*') && !perms.includes('customers.viewAll')) {
        const assignedIds = await getAssignedCustomerIds(req.user);
        if (assignedIds.length === 0) {
          return res.json({ success: true, data: [], pagination: { total: 0, page, limit, totalPages: 1 } });
        }
        query._id = { $in: assignedIds };
      }
      if (customerType && customerType !== 'All') query.customerType = customerType;
      if (status && status !== 'All') query.status = status;
      if (city && city !== 'All') query.city = new RegExp(`^${escapeRegex(city)}$`, 'i');
      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { customerId: rx },
          { name: rx },
          { phone: rx },
          { email: rx },
          { city: rx },
          { address: rx }
        ];
      }

      const [customers, total] = await Promise.all([
        Customer.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        Customer.countDocuments(query)
      ]);

      const ids = customers.map((c) => c._id);
      const [serviceCounts, lastServices] = await Promise.all([
        ServiceRecord.aggregate([
          { $match: { customer: { $in: ids } } },
          { $group: { _id: '$customer', count: { $sum: 1 }, lastDate: { $max: '$serviceDate' } } }
        ]),
        ServiceBooking.aggregate([
          { $match: { customer: { $in: ids } } },
          { $group: { _id: '$customer', count: { $sum: 1 } } }
        ])
      ]);
      const recMap = Object.fromEntries(serviceCounts.map((s) => [s._id.toString(), s]));
      const bkgMap = Object.fromEntries(lastServices.map((b) => [b._id.toString(), b.count]));

      const enriched = customers.map((c) => {
        const j = c.toJSON();
        const rec = recMap[j.id] || {};
        return {
          ...j,
          totalProducts: (j.ownedProducts || []).length,
          totalServices: rec.count || bkgMap[j.id] || 0,
          lastServiceDate: rec.lastDate || null
        };
      });

      return res.json({
        success: true,
        data: enriched,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const enrichedAll = store.customers.map((c) => {
      const recs = store.serviceRecords.filter((r) => r.customer === c.id);
      const lastDate = recs.length
        ? recs.map((r) => r.serviceDate).sort((a, b) => new Date(b) - new Date(a))[0]
        : null;
      return {
        ...c,
        totalProducts: (c.ownedProducts || []).length,
        totalServices: recs.length || store.serviceBookings.filter((b) => b.customer === c.id).length,
        lastServiceDate: lastDate
      };
    });

    const result = filterAndPaginateMemory(enrichedAll, {
      search,
      searchFields: ['customerId', 'name', 'phone', 'email', 'city', 'address'],
      filters: { customerType, status, city },
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

router.get('/:id', authMiddleware, requirePermission('customers:view'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const cond = mongoose.Types.ObjectId.isValid(req.params.id)
        ? { $or: [{ _id: req.params.id }, { customerId: req.params.id }] }
        : { customerId: req.params.id };
      const customer = await Customer.findOne(cond);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

      const perms = req.user.permissions || [];
      if (!perms.includes('*') && !perms.includes('customers.viewAll')) {
        const allowedIds = await getAssignedCustomerIds(req.user);
        if (!allowedIds.includes(customer._id.toString())) {
          return res.status(403).json({ success: false, message: 'You do not have permission to access this customer.' });
        }
      }

      const [serviceEnquiries, serviceBookings, serviceRecords, warranties, amcContracts, followUps] = await Promise.all([
        ServiceEnquiry.find({ customer: customer._id }).sort({ createdAt: -1 }),
        ServiceBooking.find({ customer: customer._id }).sort({ appointmentDate: -1 }),
        ServiceRecord.find({ customer: customer._id }).sort({ serviceDate: -1 }),
        Warranty.find({ customer: customer._id }).sort({ warrantyEnd: 1 }),
        AmcContract.find({ customer: customer._id }).sort({ endDate: 1 }),
        FollowUp.find({ customer: customer._id }).sort({ followUpDate: -1 })
      ]);

      return res.json({
        success: true,
        data: {
          ...customer.toJSON(),
          serviceEnquiries,
          serviceBookings,
          serviceRecords,
          warranties,
          amcContracts,
          followUps
        }
      });
    }

    const customer = store.customers.find((c) => c.id === req.params.id || c.customerId === req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    res.json({
      success: true,
      data: {
        ...customer,
        serviceEnquiries: store.serviceEnquiries.filter((s) => s.customer === customer.id),
        serviceBookings: store.serviceBookings.filter((b) => b.customer === customer.id),
        serviceRecords: store.serviceRecords.filter((r) => r.customer === customer.id),
        warranties: store.warranties.filter((w) => w.customer === customer.id),
        amcContracts: store.amcContracts.filter((a) => a.customer === customer.id),
        followUps: store.followUps.filter((f) => f.customer === customer.id)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/',
  authMiddleware,
  requirePermission('customers:create'),
  [
    body('name').trim().notEmpty().withMessage('Customer name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const normalizedPhone = normalizePhone(req.body.phone);
      const email = (req.body.email || '').trim().toLowerCase();

      if (isMongoConnected()) {
        const dup = await Customer.findOne({
          $or: [
            { normalizedPhone },
            ...(email ? [{ email }] : [])
          ]
        });
        if (dup) {
          return res.status(409).json({
            success: false,
            message: `Customer already exists (${dup.customerId} — ${dup.name}). Duplicate phone/email prevented.`,
            existingCustomer: dup
          });
        }
        const customerId = await nextSequenceId('TPS-CUS');
        const created = await Customer.create({
          ...req.body,
          customerId,
          normalizedPhone,
          email,
          createdBy: req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null,
          createdByName: req.user?.name || 'Admin'
        });
        await logActivity({
          entityType: 'Customer',
          entityId: created._id.toString(),
          entityRef: created.customerId,
          action: 'CREATE',
          description: `Created customer ${created.name}`,
          user: req.user
        });
        return res.status(201).json({ success: true, data: created });
      }

      const dup = store.customers.find(
        (c) => c.normalizedPhone === normalizedPhone || (email && c.email === email)
      );
      if (dup) {
        return res.status(409).json({
          success: false,
          message: `Customer already exists (${dup.customerId} — ${dup.name}). Duplicate phone/email prevented.`,
          existingCustomer: dup
        });
      }
      const customerId = await nextSequenceId('TPS-CUS');
      const created = {
        ...req.body,
        id: `cus-${Date.now()}`,
        customerId,
        normalizedPhone,
        email,
        ownedProducts: req.body.ownedProducts || [],
        notesList: [],
        status: req.body.status || 'Active',
        createdAt: new Date().toISOString()
      };
      store.customers.unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

const assertCustomerAccess = async (user, customerId) => {
  const perms = user?.permissions || [];
  if (perms.includes('*') || perms.includes('customers.viewAll')) return true;
  const allowedIds = await getAssignedCustomerIds(user);
  return allowedIds.includes(String(customerId));
};

router.put('/:id', authMiddleware, requirePermission('customers:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.phone) update.normalizedPhone = normalizePhone(update.phone);
    if (update.email !== undefined) update.email = String(update.email || '').trim().toLowerCase();

    if (isMongoConnected()) {
      const existing = await Customer.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Customer not found' });
      if (!(await assertCustomerAccess(req.user, existing._id))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to edit this customer.' });
      }
      const dupConditions = [];
      if (update.normalizedPhone) dupConditions.push({ normalizedPhone: update.normalizedPhone });
      if (update.email) dupConditions.push({ email: update.email });
      if (dupConditions.length > 0) {
        const dup = await Customer.findOne({ _id: { $ne: req.params.id }, $or: dupConditions });
        if (dup) {
          return res.status(409).json({
            success: false,
            message: `Another customer (${dup.customerId} — ${dup.name}) already uses this phone or email.`
          });
        }
      }
      const updated = await Customer.findByIdAndUpdate(req.params.id, update, { new: true });
      return res.json({ success: true, data: updated });
    }
    const idx = store.customers.findIndex((c) => c.id === req.params.id || c.customerId === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Customer not found' });
    const currentId = store.customers[idx].id;
    const dup = store.customers.find(
      (c) =>
        c.id !== currentId &&
        ((update.normalizedPhone && c.normalizedPhone === update.normalizedPhone) ||
          (update.email && c.email === update.email))
    );
    if (dup) {
      return res.status(409).json({
        success: false,
        message: `Another customer (${dup.customerId} — ${dup.name}) already uses this phone or email.`
      });
    }
    store.customers[idx] = { ...store.customers[idx], ...update, updatedAt: new Date().toISOString() };
    res.json({ success: true, data: store.customers[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post(
  '/:id/products',
  authMiddleware,
  requirePermission('customers:edit'),
  [body('productName').trim().notEmpty().withMessage('Product name is required')],
  validateRequest,
  async (req, res) => {
    try {
      if (isMongoConnected()) {
        const existing = await Customer.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: 'Customer not found' });
        if (!(await assertCustomerAccess(req.user, existing._id))) {
          return res.status(403).json({ success: false, message: 'You do not have permission to edit this customer.' });
        }
        const customer = await Customer.findByIdAndUpdate(
          req.params.id,
          { $push: { ownedProducts: req.body } },
          { new: true }
        );
        return res.json({ success: true, data: customer });
      }
      const customer = store.customers.find((c) => c.id === req.params.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      customer.ownedProducts = customer.ownedProducts || [];
      customer.ownedProducts.push({ ...req.body, _id: `op-${Date.now()}` });
      res.json({ success: true, data: customer });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/:id/notes',
  authMiddleware,
  requirePermission('customers:edit'),
  [body('text').trim().notEmpty().withMessage('Note text is required')],
  validateRequest,
  async (req, res) => {
    try {
      const note = { text: req.body.text, addedBy: req.user?.name || 'Admin', createdAt: new Date() };
      if (isMongoConnected()) {
        const existing = await Customer.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: 'Customer not found' });
        if (!(await assertCustomerAccess(req.user, existing._id))) {
          return res.status(403).json({ success: false, message: 'You do not have permission to add notes to this customer.' });
        }
        const customer = await Customer.findByIdAndUpdate(
          req.params.id,
          { $push: { notesList: note } },
          { new: true }
        );
        return res.json({ success: true, data: customer });
      }
      const customer = store.customers.find((c) => c.id === req.params.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      customer.notesList = customer.notesList || [];
      customer.notesList.unshift({ ...note, id: `cnote-${Date.now()}` });
      res.json({ success: true, data: customer });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.delete('/:id', authMiddleware, requirePermission('customers:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const [activeBookings, activeAmc] = await Promise.all([
        ServiceBooking.countDocuments({ customer: req.params.id, status: { $nin: ['Completed', 'Cancelled'] } }),
        AmcContract.countDocuments({ customer: req.params.id, amcStatus: 'Active' })
      ]);
      if (activeBookings > 0 || activeAmc > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete customer with active service bookings or active AMC contracts. Mark customer Inactive instead.'
        });
      }
      const deleted = await Customer.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Customer not found' });
      return res.json({ success: true, message: 'Customer deleted successfully' });
    }
    const idx = store.customers.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Customer not found' });
    store.customers.splice(idx, 1);
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
