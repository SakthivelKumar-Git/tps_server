import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import ServiceBooking from '../models/ServiceBooking.js';
import ServiceRecord from '../models/ServiceRecord.js';
import Warranty from '../models/Warranty.js';
import AmcContract from '../models/AmcContract.js';
import FollowUp from '../models/FollowUp.js';
import Notification from '../models/Notification.js';
import PushSubscription from '../models/PushSubscription.js';
import NotificationPreference from '../models/NotificationPreference.js';
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import CompanySetting from '../models/CompanySetting.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, requirePermission, requireRole, validateRequest } from '../middleware/auth.js';
import { canManageTargetUser } from '../config/rbac.js';
import { buildDateRangeFilter, computeStatusByEndDate, escapeRegex, logActivity, safeDaysRemaining } from '../utils/crmHelpers.js';
import { runAmcExpirySweep, runFollowUpNotificationSweep } from '../utils/notificationScheduler.js';

const router = express.Router();

// ==================== REPORTS ====================
router.get('/reports/:type', authMiddleware, requirePermission('reports:view'), async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, status, brand } = req.query;

    if (type === 'leads') {
      const dateMatch = buildDateRangeFilter(startDate, endDate, 'createdAt') || {};
      if (status && status !== 'All') dateMatch.status = status;
      if (brand && brand !== 'All') dateMatch.brand = brand;

      const records = isMongoConnected()
        ? await Lead.find(dateMatch).sort({ createdAt: -1 })
        : store.leads.filter((l) => (!status || status === 'All' || l.status === status) && (!brand || brand === 'All' || l.brand === brand));

      const byStatus = {};
      const bySource = {};
      records.forEach((r) => {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        bySource[r.leadSource || 'Website'] = (bySource[r.leadSource || 'Website'] || 0) + 1;
      });
      const convertedCount = records.filter((r) => r.status === 'Converted').length;
      const conversionRate = records.length ? Number(((convertedCount / records.length) * 100).toFixed(1)) : 0;

      return res.json({
        success: true,
        data: {
          summary: {
            totalLeads: records.length,
            converted: convertedCount,
            conversionRate,
            pipelineValue: records.reduce((s, r) => s + Number(r.estimatedValue || 0), 0)
          },
          byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
          bySource: Object.entries(bySource).map(([name, value]) => ({ name, value })),
          records
        }
      });
    }

    if (type === 'services') {
      const dateMatch = buildDateRangeFilter(startDate, endDate, 'createdAt') || {};
      const enquiries = isMongoConnected() ? await ServiceEnquiry.find(dateMatch).sort({ createdAt: -1 }) : store.serviceEnquiries;
      const bookings = isMongoConnected() ? await ServiceBooking.find().sort({ appointmentDate: -1 }) : store.serviceBookings;
      const records = isMongoConnected() ? await ServiceRecord.find().sort({ serviceDate: -1 }) : store.serviceRecords;

      const byBrand = {};
      const byStatus = {};
      enquiries.forEach((e) => {
        byBrand[e.brand || 'Other'] = (byBrand[e.brand || 'Other'] || 0) + 1;
        byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      });

      const techPerf = {};
      records.forEach((r) => {
        const k = r.technicianName || 'Unassigned';
        if (!techPerf[k]) techPerf[k] = { technician: k, completed: 0, revenue: 0 };
        techPerf[k].completed += 1;
        techPerf[k].revenue += Number(r.totalCharges || 0);
      });

      return res.json({
        success: true,
        data: {
          summary: {
            totalEnquiries: enquiries.length,
            totalBookings: bookings.length,
            completedServices: records.length,
            completionRate: enquiries.length ? Number(((records.length / enquiries.length) * 100).toFixed(1)) : 0
          },
          byBrand: Object.entries(byBrand).map(([name, value]) => ({ name, value })),
          byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
          technicianPerformance: Object.values(techPerf),
          records
        }
      });
    }

    if (type === 'customers') {
      const customers = isMongoConnected() ? await Customer.find().sort({ createdAt: -1 }) : store.customers;
      const records = isMongoConnected() ? await ServiceRecord.find() : store.serviceRecords;
      const byType = {};
      customers.forEach((c) => { byType[c.customerType] = (byType[c.customerType] || 0) + 1; });

      const enriched = customers.map((c) => {
        const cj = c.toJSON ? c.toJSON() : c;
        const custRecs = records.filter((r) => String(r.customer) === String(cj.id));
        return {
          ...cj,
          servicesCount: custRecs.length,
          totalSpend: custRecs.reduce((s, r) => s + Number(r.totalCharges || 0), 0)
        };
      });

      return res.json({
        success: true,
        data: {
          summary: {
            totalCustomers: customers.length,
            activeCustomers: customers.filter((c) => c.status === 'Active').length,
            totalCustomerRevenue: enriched.reduce((s, c) => s + c.totalSpend, 0)
          },
          byType: Object.entries(byType).map(([name, value]) => ({ name, value })),
          records: enriched
        }
      });
    }

    if (type === 'revenue') {
      const dateMatch = buildDateRangeFilter(startDate, endDate, 'serviceDate') || {};
      const records = isMongoConnected() ? await ServiceRecord.find(dateMatch).sort({ serviceDate: -1 }) : store.serviceRecords;
      const amc = isMongoConnected() ? await AmcContract.find() : store.amcContracts;

      const serviceRevenue = records.reduce((s, r) => s + Number(r.totalCharges || 0), 0);
      const labourRevenue = records.reduce((s, r) => s + Number(r.labourCharges || 0), 0);
      const partsRevenue = records.reduce((s, r) => s + Number(r.partsCharges || 0), 0);
      const amcRevenue = amc.reduce((s, a) => s + Number(a.contractAmount || 0), 0);
      const pendingPayments = records.filter((r) => r.paymentStatus === 'Pending').reduce((s, r) => s + Number(r.totalCharges || 0), 0);

      const monthlyMap = {};
      records.forEach((r) => {
        const d = new Date(r.serviceDate || r.createdAt);
        const key = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
        if (!monthlyMap[key]) monthlyMap[key] = { month: key, labour: 0, parts: 0, total: 0 };
        monthlyMap[key].labour += Number(r.labourCharges || 0);
        monthlyMap[key].parts += Number(r.partsCharges || 0);
        monthlyMap[key].total += Number(r.totalCharges || 0);
      });

      return res.json({
        success: true,
        data: {
          summary: { serviceRevenue, labourRevenue, partsRevenue, amcRevenue, totalCombined: serviceRevenue + amcRevenue, pendingPayments },
          monthly: Object.values(monthlyMap),
          records
        }
      });
    }

    if (type === 'warranty') {
      const raw = isMongoConnected() ? await Warranty.find().sort({ warrantyEnd: 1 }) : store.warranties;
      const records = raw.map((w) => {
        const j = w.toJSON ? w.toJSON() : { ...w };
        j.warrantyStatus = computeStatusByEndDate(j.warrantyEnd, j.warrantyStatus);
        return j;
      });
      return res.json({
        success: true,
        data: {
          summary: {
            total: records.length,
            active: records.filter((r) => r.warrantyStatus === 'Active').length,
            expiringSoon: records.filter((r) => r.warrantyStatus === 'Expiring Soon').length,
            expired: records.filter((r) => r.warrantyStatus === 'Expired').length
          },
          records
        }
      });
    }

    if (type === 'amc') {
      const raw = isMongoConnected() ? await AmcContract.find().sort({ endDate: 1 }) : store.amcContracts;
      const records = raw.map((a) => {
        const j = a.toJSON ? a.toJSON() : { ...a };
        j.amcStatus = computeStatusByEndDate(j.endDate, j.amcStatus);
        return j;
      });
      return res.json({
        success: true,
        data: {
          summary: {
            total: records.length,
            active: records.filter((r) => r.amcStatus === 'Active').length,
            expiringSoon: records.filter((r) => r.amcStatus === 'Expiring Soon').length,
            expired: records.filter((r) => r.amcStatus === 'Expired').length,
            totalValue: records.reduce((s, r) => s + Number(r.contractAmount || 0), 0)
          },
          records
        }
      });
    }

    if (type === 'lead-status') {
      const { priority, category, subcategory, product } = req.query;
      const q = buildDateRangeFilter(startDate, endDate, 'inquiryDate') || {};
      if (status && status !== 'All') q.status = status;
      if (priority && priority !== 'All') q.priority = priority;
      if (category && category !== 'All') q.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
      if (subcategory && subcategory !== 'All') q.subcategory = new RegExp(`^${escapeRegex(subcategory)}$`, 'i');
      if (product && product !== 'All') q.product = new RegExp(escapeRegex(product), 'i');

      const leads = isMongoConnected() ? await Lead.find(q).sort({ inquiryDate: -1, createdAt: -1 }) : [];
      const followUps = isMongoConnected() ? await FollowUp.find({ relatedModel: 'Lead' }).sort({ followUpDate: 1 }) : [];
      const fuByLead = {};
      followUps.forEach((f) => {
        const key = String(f.relatedId || '');
        if (!fuByLead[key]) fuByLead[key] = [];
        fuByLead[key].push(f);
      });

      const records = leads.map((l) => {
        const j = l.toJSON();
        const list = fuByLead[j.id] || [];
        const completed = list.filter((f) => f.status === 'Completed');
        const upcoming = list.filter((f) => ['Upcoming', 'Pending'].includes(f.status));
        return {
          ...j,
          followUpsCount: list.length,
          lastFollowUp: completed.length ? completed[completed.length - 1].followUpDate : null,
          nextFollowUp: upcoming.length ? upcoming[0].followUpDate : null
        };
      });
      return res.json({
        success: true,
        data: {
          summary: {
            total: records.length,
            new: records.filter((r) => r.status === 'New').length,
            activePipeline: records.filter((r) => !['Won', 'Converted', 'Lost', 'Cancelled'].includes(r.status)).length,
            won: records.filter((r) => ['Won', 'Converted'].includes(r.status)).length
          },
          records
        }
      });
    }

    if (type === 'warranty-detailed') {
      const { priority, category, subcategory, product, assignedEmployee } = req.query;
      const q = buildDateRangeFilter(startDate, endDate, 'warrantyEnd') || {};
      if (priority && priority !== 'All') q.priority = priority;
      if (category && category !== 'All') q.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
      if (subcategory && subcategory !== 'All') q.subcategory = new RegExp(`^${escapeRegex(subcategory)}$`, 'i');
      if (product && product !== 'All') q.productName = new RegExp(escapeRegex(product), 'i');
      if (assignedEmployee && assignedEmployee !== 'All') q.assignedEmployee = assignedEmployee;

      const raw = isMongoConnected() ? await Warranty.find(q).sort({ warrantyEnd: 1 }) : [];
      const records = raw
        .map((w) => {
          const j = w.toJSON();
          j.warrantyStatus = computeStatusByEndDate(j.warrantyEnd, j.warrantyStatus);
          j.daysLeft = safeDaysRemaining(j.warrantyEnd);
          return j;
        })
        .filter((r) => !status || status === 'All' || r.warrantyStatus === status);

      return res.json({
        success: true,
        data: {
          summary: {
            total: records.length,
            active: records.filter((r) => r.warrantyStatus === 'Active').length,
            expiringSoon: records.filter((r) => r.warrantyStatus === 'Expiring Soon').length,
            expired: records.filter((r) => r.warrantyStatus === 'Expired').length
          },
          records
        }
      });
    }

    if (type === 'amc-expired') {
      const { priority, category, subcategory, product, assignedEmployee, amcStartFrom, amcStartTo, expiryFrom, expiryTo } = req.query;
      const q = {};
      if (priority && priority !== 'All') q.priority = priority;
      if (category && category !== 'All') q.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
      if (subcategory && subcategory !== 'All') q.subcategory = new RegExp(`^${escapeRegex(subcategory)}$`, 'i');
      if (product && product !== 'All') q.productName = new RegExp(escapeRegex(product), 'i');
      if (assignedEmployee && assignedEmployee !== 'All') q.assignedEmployee = assignedEmployee;
      const sFilter = buildDateRangeFilter(amcStartFrom, amcStartTo, 'startDate');
      if (sFilter) Object.assign(q, sFilter);
      const eFilter = buildDateRangeFilter(expiryFrom || startDate, expiryTo || endDate, 'endDate');
      if (eFilter) Object.assign(q, eFilter);

      const raw = isMongoConnected() ? await AmcContract.find(q).sort({ endDate: 1 }) : [];
      const records = raw
        .map((a) => {
          const j = a.toJSON();
          j.amcStatus = computeStatusByEndDate(j.endDate, j.amcStatus);
          const diff = safeDaysRemaining(j.endDate);
          j.daysSinceExpiry = diff !== null && diff < 0 ? Math.abs(diff) : 0;
          j.daysRemaining = diff;
          return j;
        })
        .filter((r) => (!status || status === 'All' ? true : r.amcStatus === status));

      return res.json({
        success: true,
        data: {
          summary: {
            total: records.length,
            expired: records.filter((r) => r.amcStatus === 'Expired').length,
            expiringSoon: records.filter((r) => r.amcStatus === 'Expiring Soon').length,
            active: records.filter((r) => r.amcStatus === 'Active').length
          },
          records
        }
      });
    }

    if (type === 'upcoming-followups') {
      const followUps = isMongoConnected()
        ? await FollowUp.find({ status: { $in: ['Upcoming', 'Pending', 'Rescheduled'] } }).sort({ followUpDate: 1 })
        : [];
      const leadIds = followUps.filter((f) => f.relatedModel === 'Lead' && f.relatedId).map((f) => f.relatedId);
      const leads = leadIds.length ? await Lead.find({ _id: { $in: leadIds } }) : [];
      const leadMap = Object.fromEntries(leads.map((l) => [l._id.toString(), l.toJSON()]));

      // Exclude Won, Converted, Cancelled, Lost leads from Upcoming Follow-ups Report
      const excludedLeadStatuses = new Set(['Won', 'Converted', 'Cancelled', 'Lost']);
      const records = followUps
        .map((f) => {
          const j = f.toJSON();
          const lead = leadMap[String(j.relatedId || '')];
          if (lead && excludedLeadStatuses.has(lead.status)) return null;
          return {
            ...j,
            productCategory: lead?.category || j.category || '',
            productSubcategory: lead?.subcategory || '',
            product: lead?.product || j.relatedRef || '',
            inquiryDate: lead?.inquiryDate || lead?.createdAt || null,
            leadStatus: lead?.status || j.status
          };
        })
        .filter(Boolean);

      return res.json({
        success: true,
        data: {
          summary: { totalUpcoming: records.length },
          records
        }
      });
    }

    res.status(400).json({ success: false, message: 'Unknown report type' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== NOTIFICATIONS, PREFERENCES & PUSH SUBSCRIPTIONS ====================
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const empObjId = req.user?.employeeObjectId;
      const scopeQuery = {
        isCancelled: { $ne: true },
        ...(['Super Admin', 'Admin'].includes(req.user.role)
          ? {}
          : {
              $or: [
                { recipientUser: req.user.id },
                ...(empObjId ? [{ recipientEmployee: empObjId }] : []),
                { targetRoles: req.user.role },
                { recipientUser: null, recipientEmployee: null, targetRoles: { $size: 0 } }
              ]
            })
      };
      const [items, unreadCount] = await Promise.all([
        Notification.find(scopeQuery).sort({ createdAt: -1 }).limit(80),
        Notification.countDocuments({ ...scopeQuery, isRead: false })
      ]);
      return res.json({ success: true, unreadCount, data: items });
    }
    const items = store.notifications.slice(0, 50);
    const unreadCount = store.notifications.filter((n) => !n.isRead).length;
    res.json({ success: true, unreadCount, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.json({ success: true, data: {} });
    let pref = await NotificationPreference.findOne({ user: req.user.id });
    if (!pref) pref = await NotificationPreference.create({ user: req.user.id });
    res.json({ success: true, data: pref });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
    const updated = await NotificationPreference.findOneAndUpdate(
      { user: req.user.id },
      { ...req.body, user: req.user.id },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/notifications/push-subscribe', authMiddleware, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
    const { endpoint, keys = {}, deviceType = 'desktop' } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, message: 'Push subscription endpoint is required.' });
    const sub = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.user.id,
        role: req.user.role,
        endpoint,
        keys,
        deviceType,
        userAgent: req.headers['user-agent'] || '',
        isActive: true
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, data: sub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/notifications/sweep', authMiddleware, requireRole('Super Admin', 'Admin', 'System Admin'), async (_req, res) => {
  try {
    const [amc, followUps] = await Promise.all([runAmcExpirySweep(), runFollowUpNotificationSweep()]);
    res.json({ success: true, data: { amc, followUps } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/notifications/read-all', authMiddleware, async (_req, res) => {
  try {
    if (isMongoConnected()) {
      await Notification.updateMany({ isRead: false }, { isRead: true });
      return res.json({ success: true, message: 'All notifications marked as read' });
    }
    store.notifications.forEach((n) => { n.isRead = true; });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const updated = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
      return res.json({ success: true, data: updated });
    }
    const n = store.notifications.find((x) => x.id === req.params.id);
    if (n) n.isRead = true;
    res.json({ success: true, data: n });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SETTINGS: COMPANY, USERS, ROLES, ACTIVITY LOGS ====================
router.get('/settings/company', authMiddleware, async (_req, res) => {
  try {
    if (isMongoConnected()) {
      let settings = await CompanySetting.findOne({ key: 'default' });
      if (!settings) settings = await CompanySetting.create({ key: 'default' });
      return res.json({ success: true, data: settings });
    }
    res.json({ success: true, data: store.companySettings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/settings/company', authMiddleware, requireRole('Super Admin', 'Admin'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const updated = await CompanySetting.findOneAndUpdate(
        { key: 'default' },
        { ...req.body, key: 'default' },
        { upsert: true, new: true }
      );
      await logActivity({
        entityType: 'CompanySetting',
        entityId: updated._id.toString(),
        action: 'UPDATE',
        description: 'Updated company settings',
        user: req.user
      });
      return res.json({ success: true, data: updated });
    }
    store.companySettings = { ...store.companySettings, ...req.body };
    res.json({ success: true, data: store.companySettings });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/settings/users', authMiddleware, requireRole('Super Admin', 'Admin', 'Manager'), async (_req, res) => {
  try {
    if (isMongoConnected()) {
      const users = await User.find().select('-passwordHash -password -passwordPlain').sort({ createdAt: -1 });
      return res.json({ success: true, data: users });
    }
    res.json({
      success: true,
      data: store.users.map(({ passwordPlain, passwordHash, password, ...safe }) => safe)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/settings/users',
  authMiddleware,
  requireRole('Super Admin', 'Admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const email = req.body.email.trim().toLowerCase();
      const username = (req.body.username || email).trim().toLowerCase();
      const passwordHash = await bcrypt.hash(req.body.password, 12);

      if (isMongoConnected()) {
        const exists = await User.findOne({ $or: [{ email }, { username }] });
        if (exists) return res.status(409).json({ success: false, message: 'User with this email or username already exists' });
        const roleDoc = await Role.findOne({ name: req.body.role || 'Sales Employee' });
        const created = await User.create({
          name: req.body.name,
          username,
          email,
          phone: req.body.phone || '',
          passwordHash,
          role: req.body.role || 'Sales Employee',
          roleRef: roleDoc?._id || null,
          isActive: req.body.isActive !== false
        });
        return res.status(201).json({ success: true, data: created });
      }

      if (store.users.some((u) => u.email === email || u.username === username)) {
        return res.status(409).json({ success: false, message: 'User with this email or username already exists' });
      }
      const created = {
        id: `usr-${Date.now()}`,
        name: req.body.name,
        username,
        email,
        phone: req.body.phone || '',
        role: req.body.role || 'Sales Employee',
        isActive: req.body.isActive !== false,
        createdAt: new Date().toISOString()
      };
      store.users.unshift({ ...created, passwordHash });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/settings/users/:id', authMiddleware, requireRole('Super Admin', 'Admin'), async (req, res) => {
  try {
    const update = {
      name: req.body.name,
      email: req.body.email?.trim().toLowerCase(),
      username: req.body.username?.trim().toLowerCase(),
      phone: req.body.phone,
      role: req.body.role,
      isActive: req.body.isActive
    };
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);

    if (req.body.password) {
      update.passwordHash = await bcrypt.hash(req.body.password, 12);
      update.lastPasswordResetAt = new Date();
    }
    if (isMongoConnected()) {
      const target = await User.findById(req.params.id);
      if (!target) return res.status(404).json({ success: false, message: 'User not found' });
      if (!canManageTargetUser(req.user, target)) {
        return res.status(403).json({ success: false, message: 'You cannot modify this user account.' });
      }
      if (update.role === 'Super Admin' && req.user.role !== 'Super Admin') {
        return res.status(403).json({ success: false, message: 'Only Super Admin may assign Super Admin role.' });
      }
      const updated = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-passwordHash');
      return res.json({ success: true, data: updated });
    }
    const idx = store.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
    store.users[idx] = { ...store.users[idx], ...update };
    const { passwordHash, passwordPlain, password, ...safeUser } = store.users[idx];
    res.json({ success: true, data: safeUser });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/settings/users/:id', authMiddleware, requireRole('Super Admin', 'Admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own active account' });
    }
    if (isMongoConnected()) {
      const target = await User.findById(req.params.id);
      if (!target) return res.status(404).json({ success: false, message: 'User not found' });
      if (!canManageTargetUser(req.user, target)) {
        return res.status(403).json({ success: false, message: 'You cannot delete this user account.' });
      }
      await User.findByIdAndDelete(req.params.id);
      return res.json({ success: true, message: 'User deleted' });
    }
    const idx = store.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
    store.users.splice(idx, 1);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/settings/roles', authMiddleware, async (_req, res) => {
  try {
    if (isMongoConnected()) {
      const roles = await Role.find().sort({ createdAt: 1 });
      return res.json({ success: true, data: roles });
    }
    res.json({ success: true, data: store.roles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/settings/roles/:id', authMiddleware, requireRole('Super Admin'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const updated = await Role.findByIdAndUpdate(
        req.params.id,
        { description: req.body.description, permissions: req.body.permissions },
        { new: true }
      );
      if (!updated) return res.status(404).json({ success: false, message: 'Role not found' });
      return res.json({ success: true, data: updated });
    }
    const idx = store.roles.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Role not found' });
    store.roles[idx] = { ...store.roles[idx], ...req.body };
    res.json({ success: true, data: store.roles[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/activity-logs', authMiddleware, async (_req, res) => {
  try {
    if (isMongoConnected()) {
      const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(100);
      return res.json({ success: true, data: logs });
    }
    res.json({ success: true, data: store.activityLogs.slice(0, 100) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
