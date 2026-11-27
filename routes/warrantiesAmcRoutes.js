import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Warranty from '../models/Warranty.js';
import AmcContract from '../models/AmcContract.js';
import Notification from '../models/Notification.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, requirePermission, validateRequest } from '../middleware/auth.js';
import { nextSequenceId } from '../utils/sequence.js';
import { computeStatusByEndDate, escapeRegex, findOrCreateCustomer, logActivity, parsePagination, safeDaysRemaining, stripImmutableFields } from '../utils/crmHelpers.js';
import { filterAndPaginateMemory } from '../utils/memoryQuery.js';

const router = express.Router();

// ==================== WARRANTIES ====================
router.get('/warranties', authMiddleware, requirePermission('warranties:view'), async (req, res) => {
  try {
    const { status, brand, search } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['warrantyEnd', 'purchaseDate', 'createdAt', 'warrantyId'],
      'warrantyEnd'
    );

    if (isMongoConnected()) {
      const query = {};
      if (status && status !== 'All') query.warrantyStatus = status;
      if (brand && brand !== 'All') query.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { warrantyId: rx },
          { customerName: rx },
          { phone: rx },
          { productName: rx },
          { brand: rx },
          { serialNumber: rx }
        ];
      }

      const [raw, total] = await Promise.all([
        Warranty.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        Warranty.countDocuments(query)
      ]);
      const data = raw.map((w) => {
        const j = w.toJSON();
        j.warrantyStatus = computeStatusByEndDate(j.warrantyEnd, j.warrantyStatus);
        return j;
      });
      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const withComputed = store.warranties.map((w) => ({
      ...w,
      warrantyStatus: computeStatusByEndDate(w.warrantyEnd, w.warrantyStatus)
    }));
    const result = filterAndPaginateMemory(withComputed, {
      search,
      searchFields: ['warrantyId', 'customerName', 'phone', 'productName', 'brand', 'serialNumber'],
      filters: { warrantyStatus: status, brand },
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
  '/warranties',
  authMiddleware,
  requirePermission('warranties:create'),
  [
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('productName').trim().notEmpty().withMessage('Product name is required'),
    body('serialNumber').trim().notEmpty().withMessage('Serial number is required'),
    body('warrantyEnd').notEmpty().withMessage('Warranty end date is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const warrantyId = await nextSequenceId('TPS-WRN');
      const warrantyStatus = computeStatusByEndDate(req.body.warrantyEnd, req.body.warrantyStatus);

      if (isMongoConnected()) {
        let customerRef = req.body.customer && mongoose.Types.ObjectId.isValid(req.body.customer) ? req.body.customer : null;
        if (!customerRef && req.body.phone) {
          const { customer } = await findOrCreateCustomer({ name: req.body.customerName, phone: req.body.phone });
          customerRef = customer._id;
        }
        const created = await Warranty.create({
          ...req.body,
          warrantyId,
          customer: customerRef,
          product: req.body.product && mongoose.Types.ObjectId.isValid(req.body.product) ? req.body.product : null,
          purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : new Date(),
          installationDate: req.body.installationDate ? new Date(req.body.installationDate) : null,
          warrantyStart: req.body.warrantyStart ? new Date(req.body.warrantyStart) : new Date(),
          warrantyEnd: new Date(req.body.warrantyEnd),
          warrantyStatus
        });
        await logActivity({
          entityType: 'Warranty',
          entityId: created._id.toString(),
          entityRef: created.warrantyId,
          action: 'CREATE',
          description: `Warranty ${created.warrantyId} registered for ${created.customerName}`,
          user: req.user
        });
        return res.status(201).json({ success: true, data: created });
      }

      const created = {
        ...req.body,
        id: `wrn-${Date.now()}`,
        warrantyId,
        warrantyStatus,
        createdAt: new Date().toISOString()
      };
      store.warranties.unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/warranties/:id', authMiddleware, requirePermission('warranties:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.warrantyEnd) update.warrantyStatus = computeStatusByEndDate(update.warrantyEnd, update.warrantyStatus);
    if (isMongoConnected()) {
      const updated = await Warranty.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Warranty not found' });
      return res.json({ success: true, data: updated });
    }
    const idx = store.warranties.findIndex((w) => w.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Warranty not found' });
    store.warranties[idx] = { ...store.warranties[idx], ...update };
    res.json({ success: true, data: store.warranties[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/warranties/:id', authMiddleware, requirePermission('warranties:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Warranty.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Warranty not found' });
      return res.json({ success: true, message: 'Warranty deleted' });
    }
    const idx = store.warranties.findIndex((w) => w.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Warranty not found' });
    store.warranties.splice(idx, 1);
    res.json({ success: true, message: 'Warranty deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== AMC CONTRACTS ====================
router.get('/amc', authMiddleware, requirePermission('amc:view'), async (req, res) => {
  try {
    const { status, frequency, search } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['endDate', 'startDate', 'contractAmount', 'createdAt', 'amcId'],
      'endDate'
    );

    if (isMongoConnected()) {
      const query = {};
      if (status && status !== 'All') query.amcStatus = status;
      if (frequency && frequency !== 'All') query.serviceFrequency = frequency;
      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { amcId: rx },
          { agreementNumber: rx },
          { customerName: rx },
          { phone: rx },
          { productName: rx },
          { brand: rx }
        ];
      }

      const [raw, total] = await Promise.all([
        AmcContract.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        AmcContract.countDocuments(query)
      ]);
      const data = raw.map((a) => {
        const j = a.toJSON();
        j.amcStatus = computeStatusByEndDate(j.endDate, j.amcStatus);
        j.daysRemaining = safeDaysRemaining(j.endDate);
        return j;
      });
      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const withComputed = store.amcContracts.map((a) => ({
      ...a,
      amcStatus: computeStatusByEndDate(a.endDate, a.amcStatus)
    }));
    const result = filterAndPaginateMemory(withComputed, {
      search,
      searchFields: ['amcId', 'agreementNumber', 'customerName', 'phone', 'productName', 'brand'],
      filters: { amcStatus: status, serviceFrequency: frequency },
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
  '/amc',
  authMiddleware,
  requirePermission('amc:create'),
  [
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('productName').trim().notEmpty().withMessage('Product name is required'),
    body('endDate').notEmpty().withMessage('Contract end date is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const amcId = await nextSequenceId('TPS-AMC');
      const agreementNumber = req.body.agreementNumber || `AGR-${amcId}`;
      const amcStatus = computeStatusByEndDate(req.body.endDate, req.body.amcStatus);

      if (isMongoConnected()) {
        let customerRef = req.body.customer && mongoose.Types.ObjectId.isValid(req.body.customer) ? req.body.customer : null;
        if (!customerRef && req.body.phone) {
          const { customer } = await findOrCreateCustomer({ name: req.body.customerName, phone: req.body.phone });
          customerRef = customer._id;
        }
        const created = await AmcContract.create({
          ...req.body,
          amcId,
          agreementNumber,
          customer: customerRef,
          product: req.body.product && mongoose.Types.ObjectId.isValid(req.body.product) ? req.body.product : null,
          startDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
          endDate: new Date(req.body.endDate),
          nextMaintenanceDate: req.body.nextMaintenanceDate ? new Date(req.body.nextMaintenanceDate) : null,
          contractAmount: Number(req.body.contractAmount || 0),
          amcStatus
        });
        await logActivity({
          entityType: 'AmcContract',
          entityId: created._id.toString(),
          entityRef: created.amcId,
          action: 'CREATE',
          description: `AMC ${created.agreementNumber} created for ${created.customerName}`,
          user: req.user
        });
        return res.status(201).json({ success: true, data: created });
      }

      const created = {
        ...req.body,
        id: `amc-${Date.now()}`,
        amcId,
        agreementNumber,
        contractAmount: Number(req.body.contractAmount || 0),
        amcStatus,
        createdAt: new Date().toISOString()
      };
      store.amcContracts.unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/amc/:id', authMiddleware, requirePermission('amc:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.startDate && Number.isNaN(new Date(update.startDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid AMC start date.' });
    }
    if (update.endDate && Number.isNaN(new Date(update.endDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid AMC end date.' });
    }
    if (update.endDate) update.amcStatus = computeStatusByEndDate(update.endDate, update.amcStatus);
    if (isMongoConnected()) {
      const existing = await AmcContract.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'AMC contract not found' });
      const updated = await AmcContract.findByIdAndUpdate(req.params.id, update, { new: true });
      if (['Renewed', 'Cancelled', 'Expired'].includes(updated.amcStatus)) {
        await Notification.updateMany(
          { relatedModel: 'AmcContract', relatedId: updated._id.toString(), isCancelled: { $ne: true } },
          { $set: { isCancelled: true } }
        );
      }
      return res.json({ success: true, data: updated });
    }
    const idx = store.amcContracts.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'AMC contract not found' });
    store.amcContracts[idx] = { ...store.amcContracts[idx], ...update };
    res.json({ success: true, data: store.amcContracts[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/amc/:id/renew', authMiddleware, requirePermission('amc:edit'), async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
    const { newStartDate, newEndDate, contractAmount, serviceFrequency, notes = '' } = req.body;
    const startDt = newStartDate ? new Date(newStartDate) : new Date();
    const endDt = new Date(newEndDate);
    if (!newEndDate || Number.isNaN(endDt.getTime()) || Number.isNaN(startDt.getTime()) || endDt <= startDt) {
      return res.status(400).json({ success: false, message: 'Valid renewal start and end dates are required.' });
    }
    const existing = await AmcContract.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'AMC contract not found' });

    const prevDates = { startDate: existing.startDate, endDate: existing.endDate, amcStatus: existing.amcStatus };
    existing.renewalHistory = existing.renewalHistory || [];
    existing.renewalHistory.push({
      previousStartDate: existing.startDate,
      previousEndDate: existing.endDate,
      newStartDate: startDt,
      newEndDate: endDt,
      renewalAmount: Number(contractAmount ?? existing.contractAmount ?? 0),
      renewedBy: req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null,
      renewedByName: req.user?.name || 'Admin',
      renewedAt: new Date(),
      notes
    });
    existing.startDate = startDt;
    existing.endDate = endDt;
    if (contractAmount !== undefined) existing.contractAmount = Number(contractAmount);
    if (serviceFrequency) existing.serviceFrequency = serviceFrequency;
    existing.amcStatus = computeStatusByEndDate(endDt, 'Active');
    existing.amcNotificationsSent = [];
    await existing.save();

    await Notification.updateMany(
      { relatedModel: 'AmcContract', relatedId: existing._id.toString(), isCancelled: { $ne: true } },
      { $set: { isCancelled: true } }
    );

    await logActivity({
      entityType: 'AmcContract',
      entityId: existing._id.toString(),
      entityRef: existing.amcId,
      module: 'AMC',
      action: 'AMC_RENEW',
      description: `Renewed AMC ${existing.agreementNumber} until ${endDt.toLocaleDateString('en-IN')}`,
      previousValues: prevDates,
      newValues: { startDate: startDt, endDate: endDt, amcStatus: existing.amcStatus },
      user: req.user
    });

    res.json({ success: true, data: existing, message: 'AMC contract renewed successfully.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/amc/:id', authMiddleware, requirePermission('amc:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await AmcContract.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'AMC contract not found' });
      return res.json({ success: true, message: 'AMC contract deleted' });
    }
    const idx = store.amcContracts.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'AMC contract not found' });
    store.amcContracts.splice(idx, 1);
    res.json({ success: true, message: 'AMC contract deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
