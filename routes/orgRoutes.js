import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import Dealer from '../models/Dealer.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Lead from '../models/Lead.js';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import ServiceBooking from '../models/ServiceBooking.js';
import ServiceRecord from '../models/ServiceRecord.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import {
  authorizeAny,
  authMiddleware,
  getAccessibleEmployeeIds,
  normalizeRole,
  requirePermission,
  requireRole,
  validateRequest
} from '../middleware/auth.js';
import { canManageTargetUser } from '../config/rbac.js';
import { nextSequenceId } from '../utils/sequence.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import CompanySetting from '../models/CompanySetting.js';
import { escapeRegex, logActivity, parsePagination, stripImmutableFields } from '../utils/crmHelpers.js';
import { filterAndPaginateMemory } from '../utils/memoryQuery.js';

const router = express.Router();

// ==================== DEALERS ====================
router.get('/dealers', authMiddleware, requirePermission('dealers:view'), async (req, res) => {
  try {
    const { status, city, company, search } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['createdAt', 'dealerName', 'businessName', 'dealerId', 'dealerCode', 'city', 'commissionRate'],
      'createdAt'
    );

    if (isMongoConnected()) {
      const query = {};
      if (status && status !== 'All') query.status = status;
      if (city && city !== 'All') query.city = new RegExp(`^${escapeRegex(city)}$`, 'i');
      if (company && company !== 'All') {
        const compRx = new RegExp(escapeRegex(company), 'i');
        query.$and = [...(query.$and || []), { $or: [{ company: compRx }, { businessName: compRx }] }];
      }
      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { dealerId: rx },
          { dealerCode: rx },
          { dealerName: rx },
          { businessName: rx },
          { company: rx },
          { contactPerson: rx },
          { phone: rx },
          { email: rx },
          { city: rx }
        ];
      }
      const [data, total] = await Promise.all([
        Dealer.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        Dealer.countDocuments(query)
      ]);
      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const result = filterAndPaginateMemory(store.dealers, {
      search,
      searchFields: ['dealerId', 'dealerName', 'businessName', 'contactPerson', 'phone', 'email', 'city'],
      filters: { status, city },
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
  '/dealers',
  authMiddleware,
  requirePermission('dealers:create'),
  [
    body('dealerName').trim().notEmpty().withMessage('Dealer name is required'),
    body('businessName').trim().notEmpty().withMessage('Business name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const dealerId = await nextSequenceId('TPS-DLR');
      const dealerCode = req.body.dealerCode ? String(req.body.dealerCode).trim().toUpperCase() : undefined;
      if (isMongoConnected()) {
        if (dealerCode) {
          const dupCode = await Dealer.findOne({ dealerCode });
          if (dupCode) {
            return res.status(409).json({
              success: false,
              message: `Dealer code "${dealerCode}" already exists (${dupCode.businessName || dupCode.dealerName}). Duplicate dealer codes are not allowed.`
            });
          }
        }
        const created = await Dealer.create({
          ...req.body,
          dealerId,
          ...(dealerCode ? { dealerCode } : {}),
          company: req.body.company || req.body.businessName || '',
          commissionRate: Number(req.body.commissionRate || 0)
        });
        await logActivity({
          entityType: 'Dealer',
          entityId: created._id.toString(),
          entityRef: created.dealerId,
          module: 'Dealers',
          action: 'CREATE',
          description: `Dealer ${created.businessName} added`,
          user: req.user
        });
        return res.status(201).json({ success: true, data: created });
      }
      const created = { ...req.body, id: `dlr-${Date.now()}`, dealerId, createdAt: new Date().toISOString() };
      store.dealers.unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ success: false, message: 'Duplicate dealer code prevented.' });
      }
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.get('/dealers/:id/history', authMiddleware, requirePermission('dealers:view'), async (req, res) => {
  try {
    if (!isMongoConnected()) return res.json({ success: true, data: { leads: [], serviceEnquiries: [] } });
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });
    const [leads, serviceEnquiries] = await Promise.all([
      Lead.find({ dealer: dealer._id }).sort({ createdAt: -1 }),
      ServiceEnquiry.find({ dealer: dealer._id }).sort({ createdAt: -1 })
    ]);
    res.json({ success: true, data: { dealer, leads, serviceEnquiries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/dealers/:id', authMiddleware, requirePermission('dealers:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.dealerCode !== undefined) {
      update.dealerCode = String(update.dealerCode).trim().toUpperCase() || undefined;
    }
    if (update.commissionRate !== undefined) {
      update.commissionRate = Number(update.commissionRate || 0);
    }
    if (isMongoConnected()) {
      if (update.dealerCode) {
        const dup = await Dealer.findOne({ _id: { $ne: req.params.id }, dealerCode: update.dealerCode });
        if (dup) {
          return res.status(409).json({ success: false, message: `Dealer code "${update.dealerCode}" is already used by another dealer.` });
        }
      }
      const updated = await Dealer.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Dealer not found' });
      return res.json({ success: true, data: updated });
    }
    const idx = store.dealers.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Dealer not found' });
    store.dealers[idx] = { ...store.dealers[idx], ...update };
    res.json({ success: true, data: store.dealers[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/dealers/:id', authMiddleware, requirePermission('dealers:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Dealer.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Dealer not found' });
      return res.json({ success: true, message: 'Dealer deleted' });
    }
    const idx = store.dealers.findIndex((d) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Dealer not found' });
    store.dealers.splice(idx, 1);
    res.json({ success: true, message: 'Dealer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== EMPLOYEES ====================
router.get('/employees', authMiddleware, authorizeAny('employees.view', 'employees.viewTeam'), async (req, res) => {
  try {
    const { role, department, status, search } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['createdAt', 'name', 'employeeId', 'role', 'joiningDate', 'salary', 'status'],
      'createdAt'
    );

    if (isMongoConnected()) {
      const query = {};
      const perms = req.user.permissions || [];
      const flags = await getFeatureFlags(CompanySetting);
      const canSeePayroll =
        flags.hrManagementEnabled &&
        (perms.includes('*') || perms.includes('payroll.viewAll') || perms.includes('payroll.manage'));

      if (!perms.includes('*') && !perms.includes('employees.view')) {
        const teamIds = await getAccessibleEmployeeIds(req.user);
        query._id = { $in: teamIds };
      }

      if (role && role !== 'All') query.role = role;
      if (department && department !== 'All') query.department = department;
      if (status && status !== 'All') query.status = status;
      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { employeeId: rx },
          { name: rx },
          { username: rx },
          { phone: rx },
          { email: rx },
          { serviceArea: rx }
        ];
      }
      const projection = canSeePayroll
        ? '-passwordHash -password -passwordPlain'
        : '-passwordHash -password -passwordPlain -salary -salaryReference';
      const [data, total] = await Promise.all([
        Employee.find(query)
          .select(projection)
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit),
        Employee.countDocuments(query)
      ]);
      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const result = filterAndPaginateMemory(store.employees, {
      search,
      searchFields: ['employeeId', 'name', 'username', 'phone', 'email', 'serviceArea'],
      filters: { role, department, status },
      page,
      limit,
      sortBy,
      sortOrder
    });
    res.json({
      success: true,
      ...result,
      data: result.data.map(({ password, passwordHash, passwordPlain, ...safe }) => safe)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/employees/:id/tasks', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const emp = await Employee.findById(req.params.id);
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
      const [leads, enquiries, bookings, completedRecords] = await Promise.all([
        Lead.find({ assignedEmployee: emp._id }).sort({ createdAt: -1 }),
        ServiceEnquiry.find({ assignedTechnician: emp._id }).sort({ createdAt: -1 }),
        ServiceBooking.find({ assignedTechnician: emp._id }).sort({ appointmentDate: -1 }),
        ServiceRecord.find({ technician: emp._id }).sort({ serviceDate: -1 })
      ]);
      return res.json({
        success: true,
        data: {
          employee: emp,
          leads,
          enquiries,
          bookings,
          completedRecords,
          stats: {
            assignedLeads: leads.length,
            convertedLeads: leads.filter((l) => l.status === 'Converted').length,
            assignedEnquiries: enquiries.length,
            activeBookings: bookings.filter((b) => !['Completed', 'Cancelled'].includes(b.status)).length,
            completedServices: completedRecords.length,
            revenueGenerated: completedRecords.reduce((s, r) => s + Number(r.totalCharges || 0), 0)
          }
        }
      });
    }

    const emp = store.employees.find((e) => e.id === req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    const leads = store.leads.filter((l) => l.assignedEmployee === emp.id);
    const enquiries = store.serviceEnquiries.filter((e) => e.assignedTechnician === emp.id);
    const bookings = store.serviceBookings.filter((b) => b.assignedTechnician === emp.id);
    const completedRecords = store.serviceRecords.filter((r) => r.technician === emp.id);
    res.json({
      success: true,
      data: {
        employee: emp,
        leads,
        enquiries,
        bookings,
        completedRecords,
        stats: {
          assignedLeads: leads.length,
          convertedLeads: leads.filter((l) => l.status === 'Converted').length,
          assignedEnquiries: enquiries.length,
          activeBookings: bookings.filter((b) => !['Completed', 'Cancelled'].includes(b.status)).length,
          completedServices: completedRecords.length,
          revenueGenerated: completedRecords.reduce((s, r) => s + Number(r.totalCharges || 0), 0)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/employees',
  authMiddleware,
  requirePermission('employees:create'),
  [
    body('name').trim().notEmpty().withMessage('Employee name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('salary').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Salary must be a positive number')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const cleanBody = stripImmutableFields(req.body);
      delete cleanBody.employeeId;
      delete cleanBody.portalPassword;
      const salary = cleanBody.salary !== undefined && cleanBody.salary !== '' ? Number(cleanBody.salary) : 0;
      const email = cleanBody.email ? String(cleanBody.email).trim().toLowerCase() : '';
      const employeeId = await nextSequenceId('TPS-EMP');
      const username = cleanBody.username
        ? String(cleanBody.username).trim().toLowerCase()
        : (email || employeeId.toLowerCase());

      if (isMongoConnected()) {
        if (email) {
          const dupEmail = await Employee.findOne({ email });
          if (dupEmail) {
            return res.status(409).json({ success: false, message: `An employee with email "${email}" already exists.` });
          }
        }

        let linkedUser = null;
        const rawPassword = req.body.portalPassword || req.body.password || '';
        if (rawPassword) {
          if (String(rawPassword).length < 8) {
            return res.status(400).json({ success: false, message: 'Portal password must be at least 8 characters long.' });
          }
          const userEmail = email || `${username}@tps.local`;
          const dupUser = await User.findOne({ $or: [{ email: userEmail }, { username }] });
          if (dupUser) {
            return res.status(409).json({ success: false, message: 'A portal user account with this email/username already exists.' });
          }
          const normalizedRole = normalizeRole(cleanBody.role || 'Service Technician');
          const roleDoc = await Role.findOne({ name: normalizedRole });
          const passwordHash = await bcrypt.hash(String(rawPassword), 12);
          linkedUser = await User.create({
            name: cleanBody.name,
            username,
            email: userEmail,
            phone: cleanBody.phone,
            passwordHash,
            role: normalizedRole,
            roleRef: roleDoc?._id || null,
            isActive: (cleanBody.status || 'Active') === 'Active'
          });
        }

        const created = await Employee.create({
          ...cleanBody,
          email,
          username,
          salary,
          employeeId,
          userRef: linkedUser?._id || cleanBody.userRef || null,
          joiningDate: cleanBody.joiningDate ? new Date(cleanBody.joiningDate) : new Date()
        });

        if (linkedUser) {
          await User.updateOne({ _id: linkedUser._id }, { $set: { employeeRef: created._id } });
        }

        await logActivity({
          entityType: 'Employee',
          entityId: created._id.toString(),
          entityRef: created.employeeId,
          action: 'CREATE',
          description: `Employee ${created.name} (${created.role}) added`,
          user: req.user
        });
        return res.status(201).json({ success: true, data: created });
      }

      const created = {
        ...cleanBody,
        email,
        username,
        salary,
        id: `emp-${Date.now()}`,
        employeeId,
        joiningDate: cleanBody.joiningDate || new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      store.employees.unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/employees/:id', authMiddleware, requirePermission('employees:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    delete update.employeeId;
    delete update.portalPassword;
    if (update.salary !== undefined && update.salary !== '') {
      const parsed = Number(update.salary);
      if (Number.isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ success: false, message: 'Salary must be a valid non-negative number.' });
      }
      update.salary = parsed;
    }
    if (update.email) update.email = String(update.email).trim().toLowerCase();
    if (update.username) update.username = String(update.username).trim().toLowerCase();

    if (isMongoConnected()) {
      const targetEmp = await Employee.findById(req.params.id);
      if (!targetEmp) return res.status(404).json({ success: false, message: 'Employee not found' });
      if (!canManageTargetUser(req.user, targetEmp)) {
        return res.status(403).json({ success: false, message: 'You cannot modify this employee due to role hierarchy restrictions.' });
      }
      const updated = await Employee.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

      if (updated.userRef) {
        const userSync = {};
        if (update.name) userSync.name = updated.name;
        if (update.role) userSync.role = normalizeRole(updated.role);
        if (update.status) userSync.isActive = updated.status === 'Active';
        if (Object.keys(userSync).length > 0) {
          await User.updateOne({ _id: updated.userRef }, { $set: userSync });
        }
      }

      await logActivity({
        entityType: 'Employee',
        entityId: updated._id.toString(),
        entityRef: updated.employeeId,
        action: 'UPDATE',
        description: `Updated employee ${updated.name}`,
        user: req.user
      });
      return res.json({ success: true, data: updated });
    }
    const idx = store.employees.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Employee not found' });
    store.employees[idx] = { ...store.employees[idx], ...update };
    res.json({ success: true, data: store.employees[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch(
  '/employees/:id/status',
  authMiddleware,
  requirePermission('employees:edit'),
  [
    body('status').isIn(['Active', 'On Leave', 'Inactive']).withMessage('Status must be Active, On Leave, or Inactive')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { status } = req.body;
      if (isMongoConnected()) {
        const targetEmp = await Employee.findById(req.params.id);
        if (!targetEmp) return res.status(404).json({ success: false, message: 'Employee not found' });
        if (!canManageTargetUser(req.user, targetEmp)) {
          return res.status(403).json({ success: false, message: 'You cannot change status for this employee.' });
        }
        const updated = await Employee.findByIdAndUpdate(req.params.id, { status }, { new: true });

        if (updated.userRef) {
          await User.updateOne({ _id: updated.userRef }, { $set: { isActive: status === 'Active' } });
        } else if (updated.email || updated.username) {
          await User.updateOne(
            { $or: [{ email: updated.email }, { username: updated.username }] },
            { $set: { isActive: status === 'Active' } }
          );
        }

        await logActivity({
          entityType: 'Employee',
          entityId: updated._id.toString(),
          entityRef: updated.employeeId,
          action: 'STATUS_CHANGE',
          description: `Employee ${updated.name} status changed to ${status}`,
          user: req.user
        });
        return res.json({ success: true, data: updated, message: `Employee status updated to ${status}` });
      }
      const idx = store.employees.findIndex((e) => e.id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Employee not found' });
      store.employees[idx] = { ...store.employees[idx], status };
      res.json({ success: true, data: store.employees[idx] });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/employees/:id/reset-password',
  authMiddleware,
  requireRole('Super Admin', 'Admin'),
  [
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[A-Za-z])(?=.*[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/)
      .withMessage('Password must contain letters and at least one number or symbol')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { newPassword } = req.body;
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const resetAt = new Date();

      if (isMongoConnected()) {
        const emp = await Employee.findById(req.params.id);
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
        if (!canManageTargetUser(req.user, emp)) {
          return res.status(403).json({ success: false, message: 'You cannot reset credentials for this user.' });
        }

        let user = null;
        if (emp.userRef) {
          user = await User.findById(emp.userRef);
        }
        if (!user && (emp.email || emp.username)) {
          user = await User.findOne({
            $or: [
              ...(emp.email ? [{ email: emp.email.toLowerCase() }] : []),
              ...(emp.username ? [{ username: emp.username.toLowerCase() }] : [])
            ]
          });
        }

        if (user) {
          user.passwordHash = passwordHash;
          user.lastPasswordResetAt = resetAt;
          await user.save();
          if (!emp.userRef) emp.userRef = user._id;
        } else {
          const username = (emp.username || emp.email || emp.employeeId).trim().toLowerCase();
          const email = (emp.email || `${username}@tps.local`).trim().toLowerCase();
          const normalizedRole = normalizeRole(emp.role);
          const roleDoc = await Role.findOne({ name: normalizedRole });
          user = await User.create({
            name: emp.name,
            username,
            email,
            phone: emp.phone || '',
            passwordHash,
            role: normalizedRole,
            roleRef: roleDoc?._id || null,
            employeeRef: emp._id,
            isActive: emp.status === 'Active',
            lastPasswordResetAt: resetAt
          });
          emp.userRef = user._id;
        }

        emp.lastPasswordResetAt = resetAt;
        await emp.save();

        await logActivity({
          entityType: 'Employee',
          entityId: emp._id.toString(),
          entityRef: emp.employeeId,
          action: 'PASSWORD_RESET',
          description: `Password reset performed for employee ${emp.name} (${emp.employeeId})`,
          user: req.user
        });

        return res.json({
          success: true,
          message: `Password securely reset for ${emp.name}. Portal login username: ${user.username}`,
          data: emp
        });
      }

      const idx = store.employees.findIndex((e) => e.id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Employee not found' });
      store.employees[idx].lastPasswordResetAt = resetAt.toISOString();
      res.json({ success: true, message: `Password reset for ${store.employees[idx].name}` });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.delete('/employees/:id', authMiddleware, requirePermission('employees:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const targetEmp = await Employee.findById(req.params.id);
      if (!targetEmp) return res.status(404).json({ success: false, message: 'Employee not found' });
      if (!canManageTargetUser(req.user, targetEmp)) {
        return res.status(403).json({ success: false, message: 'You cannot delete this employee due to hierarchy protections.' });
      }
      await Employee.findByIdAndDelete(req.params.id);
      return res.json({ success: true, message: 'Employee deleted' });
    }
    const idx = store.employees.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Employee not found' });
    store.employees.splice(idx, 1);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
