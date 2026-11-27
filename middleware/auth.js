import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { isMongoConnected } from '../config/db.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Employee from '../models/Employee.js';
import CompanySetting from '../models/CompanySetting.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import {
  computeEffectivePermissions,
  getHierarchyLevel,
  normalizeRoleName,
  ROLE_DEFAULTS_BY_NAME,
  userHasPermission
} from '../config/rbac.js';

export const getJwtSecret = () => process.env.JWT_SECRET || 'true_power_solutions_jwt_secret_2026';

export const normalizeRole = (role = '') => normalizeRoleName(role);

export const ROLE_PERMISSIONS_MAP = ROLE_DEFAULTS_BY_NAME;

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (isMongoConnected() && decoded.id && /^[a-f\d]{24}$/i.test(decoded.id)) {
      const liveUser = await User.findById(decoded.id);
      if (!liveUser) {
        return res.status(401).json({ success: false, message: 'Account not found or session expired.' });
      }
      if (!liveUser.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been disabled. Please contact your administrator.'
        });
      }
      if (liveUser.portalAccess === false) {
        return res.status(403).json({
          success: false,
          message: 'Portal access has been restricted for this account.'
        });
      }
      if (decoded.tokenVersion !== undefined && liveUser.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({
          success: false,
          message: 'Session invalidated after password change. Please sign in again.'
        });
      }

      const normalizedRole = normalizeRoleName(liveUser.role);
      const roleDoc =
        (liveUser.roleId || liveUser.roleRef
          ? await Role.findById(liveUser.roleId || liveUser.roleRef)
          : null) || (await Role.findOne({ name: normalizedRole }));

      const empDoc =
        (liveUser.employeeRef ? await Employee.findById(liveUser.employeeRef) : null) ||
        (await Employee.findOne({ $or: [{ userId: liveUser._id }, { userRef: liveUser._id }, { email: liveUser.email }] }));

      const [effectivePerms, featureFlags] = await Promise.all([
        Promise.resolve(
          computeEffectivePermissions({
            roleName: normalizedRole,
            rolePermissions: roleDoc?.permissions,
            userPermissions: liveUser.permissions,
            deniedPermissions: liveUser.deniedPermissions,
            temporaryAccess: liveUser.temporaryAccess
          })
        ),
        getFeatureFlags(CompanySetting)
      ]);

      req.user = {
        id: liveUser._id.toString(),
        username: liveUser.username,
        email: liveUser.email,
        name: liveUser.name,
        phone: liveUser.phone || empDoc?.phone || '',
        role: normalizedRole,
        normalizedRole,
        designation: liveUser.designation || empDoc?.designation || normalizedRole,
        department: liveUser.department || empDoc?.department || 'Operations',
        employeeId: liveUser.employeeId || empDoc?.employeeId || '',
        employeeObjectId: empDoc?._id?.toString() || '',
        reportingManager: liveUser.reportingManager?.toString() || empDoc?.reportingManager?.toString() || null,
        hierarchyLevel: getHierarchyLevel(normalizedRole),
        mustChangePassword: Boolean(liveUser.mustChangePassword),
        portalAccess: liveUser.portalAccess !== false,
        permissions: effectivePerms,
        featureFlags
      };
      return next();
    }

    const fallbackRole = normalizeRoleName(decoded.role);
    req.user = {
      ...decoded,
      role: fallbackRole,
      normalizedRole: fallbackRole,
      hierarchyLevel: getHierarchyLevel(fallbackRole),
      permissions: decoded.permissions || ROLE_DEFAULTS_BY_NAME[fallbackRole] || []
    };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

export const authorize = (...permissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  const userPermissions = req.user.permissions || [];
  const allowed = permissions.every((permission) => userHasPermission(userPermissions, permission));
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }
  next();
};

export const authorizeAny = (...permissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  const userPermissions = req.user.permissions || [];
  const allowed = permissions.some((permission) => userHasPermission(userPermissions, permission));
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  }
  next();
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  const userRole = normalizeRoleName(req.user.role);
  if (userRole === 'Super Admin') return next();
  if (allowedRoles.map(normalizeRoleName).includes(userRole)) return next();
  return res.status(403).json({
    success: false,
    message: 'You do not have permission to perform this action.'
  });
};

export const requirePermission = (permission) => authorize(permission);

/**
 * Resolves the list of Employee ObjectIds visible to the current user for Team / Own scope queries.
 */
export const getAccessibleEmployeeIds = async (user) => {
  if (!isMongoConnected() || !user?.employeeObjectId) return [];
  const myEmpId = user.employeeObjectId;
  const subEmployees = await Employee.find({ reportingManager: myEmpId }).select('_id');
  const ids = [myEmpId, ...subEmployees.map((e) => e._id.toString())];

  if (user.role === 'Manager' && user.department) {
    const deptEmps = await Employee.find({
      department: user.department,
      role: { $in: ['Senior Sales Executive', 'Sales Executive', 'Business Development Executive', 'Service Technician'] }
    }).select('_id');
    deptEmps.forEach((e) => {
      const id = e._id.toString();
      if (!ids.includes(id)) ids.push(id);
    });
  }
  return ids;
};

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
};

const stripDangerousKeys = (obj) => {
  if (Array.isArray(obj)) return obj.map(stripDangerousKeys);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$') || k.includes('__proto__') || k.includes('constructor')) continue;
      clean[k] = stripDangerousKeys(v);
    }
    return clean;
  }
  if (typeof obj === 'string') {
    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  }
  return obj;
};

export const sanitizeBody = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body);
  }
  next();
};
