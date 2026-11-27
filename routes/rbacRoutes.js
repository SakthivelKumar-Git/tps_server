import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import Employee from '../models/Employee.js';
import { isMongoConnected } from '../config/db.js';
import {
  authorize,
  authorizeAny,
  authMiddleware,
  normalizeRole,
  validateRequest
} from '../middleware/auth.js';
import {
  ALL_PERMISSION_KEYS,
  canManageTargetUser,
  computeEffectivePermissions,
  getHierarchyLevel,
  normalizeRoleName,
  PERMISSIONS_CATALOG,
  ROLE_HIERARCHY
} from '../config/rbac.js';
import { logActivity, parsePagination, escapeRegex } from '../utils/crmHelpers.js';
import { nextSequenceId } from '../utils/sequence.js';

const router = express.Router();

const requireMongo = (res) => {
  if (!isMongoConnected()) {
    res.status(503).json({ success: false, message: 'MongoDB database connection is required for RBAC management.' });
    return false;
  }
  return true;
};

// ==================== PERMISSIONS & ROLES CATALOG ====================
router.get('/permissions', authMiddleware, authorizeAny('permissions.manage', 'users.view', 'roles.view'), async (_req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.json({ success: true, data: PERMISSIONS_CATALOG });
    }
    const perms = await Permission.find({}).sort({ module: 1, key: 1 });
    res.json({ success: true, data: perms.length ? perms : PERMISSIONS_CATALOG });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/roles', authMiddleware, async (_req, res) => {
  try {
    if (!requireMongo(res)) return;
    const roles = await Role.find({}).sort({ hierarchyLevel: 1, name: 1 });
    res.json({ success: true, data: roles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== CREATE CUSTOM ROLE ====================
router.post('/roles', authMiddleware, authorize('permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin may create roles.' });
    }

    const { name, description, permissions, hierarchyLevel } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required.' });
    }

    const existing = await Role.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: `A role named "${name.trim()}" already exists.` });
    }

    const role = await Role.create({
      name: name.trim(),
      slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
      description: description || '',
      permissions: Array.isArray(permissions) ? permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p)) : [],
      hierarchyLevel: Number(hierarchyLevel) || 6,
      isSystemRole: false,
      isSystem: false
    });

    await logActivity({
      entityType: 'Role',
      entityId: role._id.toString(),
      entityRef: role.name,
      module: 'RBAC',
      action: 'CUSTOM_ROLE_CREATED',
      targetType: 'Role',
      targetId: role._id.toString(),
      targetLabel: role.name,
      description: `Custom role "${role.name}" created`,
      user: req.user,
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: role });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==================== DELETE CUSTOM ROLE ====================
router.delete('/roles/:id', authMiddleware, authorize('permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin may delete roles.' });
    }

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });

    if (role.isSystemRole || role.isSystem) {
      return res.status(403).json({ success: false, message: `System role "${role.name}" cannot be deleted.` });
    }
    if (['Super Admin', 'Admin'].includes(role.name)) {
      return res.status(403).json({ success: false, message: `Critical role "${role.name}" cannot be deleted.` });
    }

    // Check if any users are currently assigned this role
    const usersAssigned = await User.countDocuments({ role: role.name });
    if (usersAssigned > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete role "${role.name}" — ${usersAssigned} user(s) are currently assigned to it. Reassign them first.`
      });
    }

    await Role.deleteOne({ _id: role._id });

    await logActivity({
      entityType: 'Role',
      entityId: role._id.toString(),
      entityRef: role.name,
      module: 'RBAC',
      action: 'CUSTOM_ROLE_DELETED',
      targetType: 'Role',
      targetId: role._id.toString(),
      targetLabel: role.name,
      description: `Custom role "${role.name}" deleted`,
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Role "${role.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Only Super Admin may edit global Role definitions
router.put('/roles/:id', authMiddleware, authorize('permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin may modify global role permissions.' });
    }
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.name === 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Super Admin role retains full unrestricted authority and cannot be restricted.' });
    }

    const { description, permissions } = req.body;
    const previousPerms = role.permissions || [];
    if (description !== undefined) role.description = description;
    if (Array.isArray(permissions)) {
      role.permissions = permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p));
    }
    await role.save();

    await logActivity({
      entityType: 'Role',
      entityId: role._id.toString(),
      entityRef: role.name,
      module: 'RBAC',
      action: 'ROLE_PERMISSIONS_UPDATE',
      targetType: 'Role',
      targetId: role._id.toString(),
      targetLabel: role.name,
      description: `Updated permissions for role ${role.name}`,
      changes: { before: previousPerms, after: role.permissions },
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, data: role });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==================== USER & ACCESS MANAGEMENT ====================
router.get('/users', authMiddleware, authorizeAny('users.view', 'employees.view', 'employees.viewTeam', 'permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { search, role, status, department } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['createdAt', 'name', 'email', 'role', 'employeeId', 'lastLogin'],
      'createdAt'
    );

    const query = {};
    if (role && role !== 'All') query.role = role;
    if (department && department !== 'All') query.department = department;
    if (status === 'Active') query.isActive = true;
    if (status === 'Inactive') query.isActive = false;

    // Manager scope sees only direct/department team users
    if (req.user.role === 'Manager') {
      query.role = { $in: ['Senior Sales Executive', 'Sales Executive', 'Business Development Executive'] };
      if (req.user.department) query.department = req.user.department;
    }

    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { name: rx },
        { email: rx },
        { username: rx },
        { employeeId: rx },
        { designation: rx },
        { department: rx }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash -password -passwordPlain')
        .populate('reportingManager', 'name email designation employeeId')
        .populate('roleId', 'name hierarchyLevel permissions')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    const enriched = users.map((u) => {
      const json = u.toJSON();
      return {
        ...json,
        hierarchyLevel: getHierarchyLevel(json.role),
        effectivePermissionsCount: computeEffectivePermissions({
          roleName: json.role,
          rolePermissions: u.roleId?.permissions,
          userPermissions: json.permissions,
          deniedPermissions: json.deniedPermissions,
          temporaryAccess: json.temporaryAccess
        }).length
      };
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/users',
  authMiddleware,
  authorize('users.create'),
  [
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  ],
  validateRequest,
  async (req, res) => {
    try {
      if (!requireMongo(res)) return;
      const email = req.body.email.trim().toLowerCase();
      const username = (req.body.username || email).trim().toLowerCase();
      const targetRole = normalizeRoleName(req.body.role || 'Sales Executive');

      // Hierarchy protection: non-Super Admin cannot create Super Admin or higher roles
      if (targetRole === 'Super Admin' && req.user.role !== 'Super Admin') {
        return res.status(403).json({ success: false, message: 'Only Super Admin can assign the Super Admin role.' });
      }
      if (req.user.role === 'Manager' && !['Senior Sales Executive', 'Sales Executive', 'Business Development Executive'].includes(targetRole)) {
        return res.status(403).json({ success: false, message: 'Managers may only create team-level sales executive accounts.' });
      }

      const duplicate = await User.findOne({ $or: [{ email }, { username }] });
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'A user with this email or username already exists.' });
      }

      const roleDoc = await Role.findOne({ name: targetRole });
      const passwordHash = await bcrypt.hash(req.body.password, 12);

      // Create or link employee record without storing password in Employee collection
      let empDoc = await Employee.findOne({ $or: [{ email }, { username }] });
      if (!empDoc) {
        const employeeId = req.body.employeeId || (await nextSequenceId('TPS-EMP'));
        empDoc = await Employee.create({
          employeeId,
          name: req.body.name.trim(),
          username,
          email,
          phone: req.body.phone || '0000000000',
          designation: req.body.designation || targetRole,
          role: targetRole,
          department: req.body.department || 'Operations',
          status: req.body.isActive !== false ? 'Active' : 'Inactive',
          portalAccess: req.body.portalAccess !== false
        });
      }

      const created = await User.create({
        name: req.body.name.trim(),
        username,
        email,
        phone: req.body.phone || empDoc.phone || '',
        passwordHash,
        designation: req.body.designation || targetRole,
        department: req.body.department || empDoc.department || 'Operations',
        employeeId: empDoc.employeeId,
        reportingManager: req.body.reportingManager || null,
        role: targetRole,
        roleId: roleDoc?._id || null,
        roleRef: roleDoc?._id || null,
        employeeRef: empDoc._id,
        isActive: req.body.isActive !== false,
        portalAccess: req.body.portalAccess !== false,
        mustChangePassword: req.body.mustChangePassword !== false
      });

      await Employee.updateOne({ _id: empDoc._id }, { $set: { userRef: created._id, userId: created._id } });

      await logActivity({
        entityType: 'User',
        entityId: created._id.toString(),
        entityRef: created.employeeId,
        module: 'RBAC',
        action: 'CREATE_USER',
        targetType: 'User',
        targetId: created._id.toString(),
        targetLabel: created.email,
        description: `Created user ${created.name} (${created.role} - ${created.designation})`,
        user: req.user,
        ipAddress: req.ip
      });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/users/:id', authMiddleware, authorize('users.edit'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this account due to role hierarchy restrictions.' });
    }

    const nextRole = req.body.role ? normalizeRoleName(req.body.role) : normalizeRoleName(target.role);
    if (nextRole === 'Super Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin may assign the Super Admin role.' });
    }
    if (nextRole !== target.role && !req.user.permissions.includes('*') && !req.user.permissions.includes('users.assignRole')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to change user roles.' });
    }

    const beforeRole = target.role;
    if (req.body.name) target.name = req.body.name.trim();
    if (req.body.phone !== undefined) target.phone = req.body.phone;
    if (req.body.designation !== undefined) target.designation = req.body.designation.trim();
    if (req.body.department !== undefined) target.department = req.body.department;
    if (req.body.reportingManager !== undefined) target.reportingManager = req.body.reportingManager || null;
    if (req.body.isActive !== undefined) target.isActive = Boolean(req.body.isActive);
    if (req.body.portalAccess !== undefined) target.portalAccess = Boolean(req.body.portalAccess);

    if (nextRole !== target.role) {
      const roleDoc = await Role.findOne({ name: nextRole });
      target.role = nextRole;
      target.roleId = roleDoc?._id || target.roleId;
      target.roleRef = roleDoc?._id || target.roleRef;
    }

    await target.save();

    if (target.employeeRef) {
      await Employee.updateOne(
        { _id: target.employeeRef },
        {
          $set: {
            name: target.name,
            phone: target.phone,
            designation: target.designation,
            department: target.department,
            role: target.role,
            status: target.isActive ? 'Active' : 'Inactive',
            portalAccess: target.portalAccess
          }
        }
      );
    }

    await logActivity({
      entityType: 'User',
      entityId: target._id.toString(),
      entityRef: target.employeeId,
      module: 'RBAC',
      action: beforeRole !== target.role ? 'ROLE_CHANGE' : 'UPDATE_USER',
      targetType: 'User',
      targetId: target._id.toString(),
      targetLabel: target.email,
      description:
        beforeRole !== target.role
          ? `Changed role for ${target.name} from ${beforeRole} to ${target.role}`
          : `Updated profile for user ${target.name}`,
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, data: target });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/users/:id/status', authMiddleware, authorizeAny('users.activate', 'users.edit'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot disable your own active account.' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    if (!canManageTargetUser(req.user, target)) {
      return res.status(403).json({ success: false, message: 'You do not have authority to change status for this user.' });
    }

    target.isActive = Boolean(req.body.isActive);
    await target.save();

    if (target.employeeRef) {
      await Employee.updateOne(
        { _id: target.employeeRef },
        { $set: { status: target.isActive ? 'Active' : 'Inactive' } }
      );
    }

    await logActivity({
      entityType: 'User',
      entityId: target._id.toString(),
      entityRef: target.employeeId,
      module: 'RBAC',
      action: target.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      targetType: 'User',
      targetId: target._id.toString(),
      targetLabel: target.email,
      description: `${target.name} account ${target.isActive ? 'activated' : 'disabled'}`,
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, data: target, message: `User ${target.isActive ? 'activated' : 'disabled'} successfully.` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post(
  '/users/:id/reset-password',
  authMiddleware,
  authorize('users.resetPassword'),
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
      if (!requireMongo(res)) return;
      const target = await User.findById(req.params.id);
      if (!target) return res.status(404).json({ success: false, message: 'User not found' });
      if (!canManageTargetUser(req.user, target)) {
        return res.status(403).json({ success: false, message: 'You cannot reset credentials for this user.' });
      }

      target.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
      target.mustChangePassword = req.body.requireChange !== false;
      target.tokenVersion = (target.tokenVersion || 0) + 1;
      target.lastPasswordResetAt = new Date();
      await target.save();

      await logActivity({
        entityType: 'User',
        entityId: target._id.toString(),
        entityRef: target.employeeId,
        module: 'RBAC',
        action: 'PASSWORD_RESET',
        targetType: 'User',
        targetId: target._id.toString(),
        targetLabel: target.email,
        description: `Reset password for ${target.name} (${target.email})`,
        user: req.user,
        ipAddress: req.ip
      });

      res.json({ success: true, message: `Password reset securely for ${target.name}.` });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ==================== SUPER ADMIN USER ACCESS CONFIGURATION ====================
router.get('/users/:id/access', authMiddleware, authorize('permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const target = await User.findById(req.params.id)
      .select('-passwordHash -password -passwordPlain')
      .populate('roleId', 'name permissions hierarchyLevel')
      .populate('reportingManager', 'name email designation');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    const roleDoc = target.roleId || (await Role.findOne({ name: normalizeRoleName(target.role) }));
    const roleDefaults = roleDoc?.permissions || [];
    const effective = computeEffectivePermissions({
      roleName: target.role,
      rolePermissions: roleDefaults,
      userPermissions: target.permissions,
      deniedPermissions: target.deniedPermissions,
      temporaryAccess: target.temporaryAccess
    });

    res.json({
      success: true,
      data: {
        user: target.toJSON(),
        roleName: normalizeRoleName(target.role),
        roleDefaults,
        grantedOverrides: target.permissions || [],
        deniedOverrides: target.deniedPermissions || [],
        temporaryAccess: target.temporaryAccess || { permissions: [], expiresAt: null },
        effectivePermissions: effective,
        permissionHistory: (target.permissionHistory || []).slice().reverse().slice(0, 30)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/users/:id/access', authMiddleware, authorize('permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    // Prevent self-escalation cleanly; only Super Admin can manage permissions globally
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin may modify individual user permissions.' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (target._id.toString() === req.user.id && target.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'You cannot grant permissions to your own account.' });
    }
    if (normalizeRoleName(target.role) === 'Super Admin' && req.body.portalAccess === false) {
      return res.status(400).json({ success: false, message: 'Super Admin portal access cannot be revoked.' });
    }

    const grantedOverrides = Array.isArray(req.body.grantedOverrides)
      ? req.body.grantedOverrides.filter((p) => ALL_PERMISSION_KEYS.includes(p))
      : target.permissions || [];
    const deniedOverrides = Array.isArray(req.body.deniedOverrides)
      ? req.body.deniedOverrides.filter((p) => ALL_PERMISSION_KEYS.includes(p))
      : target.deniedPermissions || [];

    const prevSet = new Set(target.permissions || []);
    const nextSet = new Set(grantedOverrides);
    const permissionsAdded = [...nextSet].filter((x) => !prevSet.has(x));
    const permissionsRemoved = [...prevSet].filter((x) => !nextSet.has(x));

    target.permissions = grantedOverrides;
    target.deniedPermissions = deniedOverrides;

    if (req.body.portalAccess !== undefined) {
      target.portalAccess = Boolean(req.body.portalAccess);
    }

    if (req.body.temporaryAccess) {
      target.temporaryAccess = {
        permissions: (req.body.temporaryAccess.permissions || []).filter((p) => ALL_PERMISSION_KEYS.includes(p)),
        expiresAt: req.body.temporaryAccess.expiresAt ? new Date(req.body.temporaryAccess.expiresAt) : null,
        grantedBy: req.user.id
      };
    }

    target.permissionHistory.push({
      changedBy: req.user.id,
      changedByName: req.user.name,
      action: 'UPDATE_USER_ACCESS',
      permissionsAdded,
      permissionsRemoved,
      deniedAdded: deniedOverrides,
      note: req.body.note || 'Updated user permission overrides',
      timestamp: new Date()
    });

    await target.save();

    if (target.employeeRef) {
      await Employee.updateOne({ _id: target.employeeRef }, { $set: { portalAccess: target.portalAccess } });
    }

    await logActivity({
      entityType: 'User',
      entityId: target._id.toString(),
      entityRef: target.employeeId,
      module: 'RBAC',
      action: 'PERMISSION_OVERRIDE',
      targetType: 'User',
      targetId: target._id.toString(),
      targetLabel: target.email,
      description: `Configured module permissions for ${target.name}`,
      changes: { permissionsAdded, permissionsRemoved, deniedOverrides },
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Permissions updated for ${target.name}.` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/users/:id/access/reset', authMiddleware, authorize('permissions.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin may reset user permission overrides.' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    target.permissions = [];
    target.deniedPermissions = [];
    target.temporaryAccess = { permissions: [], expiresAt: null, grantedBy: null };
    target.permissionHistory.push({
      changedBy: req.user.id,
      changedByName: req.user.name,
      action: 'RESET_TO_ROLE_DEFAULTS',
      permissionsAdded: [],
      permissionsRemoved: [],
      deniedAdded: [],
      note: 'Reset user access to role defaults',
      timestamp: new Date()
    });
    await target.save();

    await logActivity({
      entityType: 'User',
      entityId: target._id.toString(),
      entityRef: target.employeeId,
      module: 'RBAC',
      action: 'PERMISSION_RESET',
      targetType: 'User',
      targetId: target._id.toString(),
      targetLabel: target.email,
      description: `Reset ${target.name} permissions back to ${target.role} role defaults`,
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Reset permissions to ${target.role} role defaults.` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
