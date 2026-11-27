import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Employee from '../models/Employee.js';
import RefreshToken from '../models/RefreshToken.js';
import CompanySetting from '../models/CompanySetting.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import {
  authMiddleware,
  getJwtSecret,
  normalizeRole,
  ROLE_PERMISSIONS_MAP,
  validateRequest
} from '../middleware/auth.js';
import { computeEffectivePermissions, getHierarchyLevel } from '../config/rbac.js';
import { getFeatureFlags } from '../config/featureFlags.js';
import { logActivity } from '../utils/crmHelpers.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';

const router = express.Router();

const REFRESH_COOKIE_NAME = 'tps_rt';
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

const parseCookies = (cookieHeader = '') => {
  const cookies = {};
  String(cookieHeader || '')
    .split(';')
    .forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
      }
    });
  return cookies;
};

const issueRefreshToken = async (user, req, res, rememberMe = false) => {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlDays = rememberMe ? 30 : 7;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    tokenHash,
    user: user._id,
    tokenVersion: user.tokenVersion || 0,
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || '',
    expiresAt
  });

  if (res?.cookie) {
    res.cookie(REFRESH_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: ttlDays * 24 * 60 * 60 * 1000
    });
  }
  return rawToken;
};

const buildAuthPayload = async (user, expiresIn = '1d') => {
  const normalizedRole = normalizeRole(user.role);
  const [roleDoc, empDoc, featureFlags] = await Promise.all([
    (user.roleId || user.roleRef ? Role.findById(user.roleId || user.roleRef) : null) ||
      Role.findOne({ name: normalizedRole }),
    (user.employeeRef ? Employee.findById(user.employeeRef) : null) ||
      Employee.findOne({ $or: [{ userId: user._id }, { userRef: user._id }, { email: user.email }] }),
    getFeatureFlags(CompanySetting)
  ]);

  const permissions = computeEffectivePermissions({
    roleName: normalizedRole,
    rolePermissions: roleDoc?.permissions,
    userPermissions: user.permissions,
    deniedPermissions: user.deniedPermissions,
    temporaryAccess: user.temporaryAccess
  });

  const token = jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      role: normalizedRole,
      name: user.name,
      tokenVersion: user.tokenVersion || 0,
      employeeObjectId: empDoc?._id?.toString() || ''
    },
    getJwtSecret(),
    { expiresIn }
  );

  return {
    token,
    user: {
      id: user._id.toString(),
      username: user.username,
      name: user.name,
      role: normalizedRole,
      designation: user.designation || empDoc?.designation || normalizedRole,
      department: user.department || empDoc?.department || 'Operations',
      email: user.email,
      phone: user.phone || empDoc?.phone || '',
      employeeId: user.employeeId || empDoc?.employeeId || '',
      employeeObjectId: empDoc?._id?.toString() || '',
      hierarchyLevel: getHierarchyLevel(normalizedRole),
      mustChangePassword: Boolean(user.mustChangePassword),
      portalAccess: user.portalAccess !== false,
      permissions,
      featureFlags,
      uiPreferences: user.uiPreferences || {}
    }
  };
};

router.post(
  '/login',  [body('password').notEmpty().withMessage('Password is required')],
  validateRequest,
  async (req, res) => {
    try {
      const identifier = (req.body.email || req.body.username || '').trim().toLowerCase();
      const password = req.body.password || '';
      const rememberMe = Boolean(req.body.rememberMe);

      if (!identifier) {
        return res.status(400).json({ success: false, message: 'Email or username is required' });
      }

      const expiresIn = rememberMe ? '30d' : '7d';

      if (isMongoConnected()) {
        const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
        if (!user) {
          return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        if (!user.isActive) {
          return res.status(403).json({ success: false, message: 'This account is disabled. Please contact your administrator.' });
        }
        if (user.portalAccess === false) {
          return res.status(403).json({ success: false, message: 'Portal access has been restricted for this account.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        user.lastLogin = new Date();
        await user.save();

        const authData = await buildAuthPayload(user, rememberMe ? '7d' : '1d');
        const refreshToken = await issueRefreshToken(user, req, res, rememberMe);

        await logActivity({
          entityType: 'Auth',
          entityId: user._id.toString(),
          module: 'Auth',
          action: 'LOGIN',
          targetType: 'User',
          targetId: user._id.toString(),
          targetLabel: user.email,
          description: `${user.name} (${authData.user.role}) signed in`,
          user: { id: user._id.toString(), name: user.name, email: user.email, role: authData.user.role },
          ipAddress: req.ip
        });

        return res.json({
          success: true,
          token: authData.token,
          refreshToken,
          mustChangePassword: authData.user.mustChangePassword,
          user: authData.user
        });
      }

      const adminEmail = (process.env.ADMIN_EMAIL || 'sakthi@gmail.com').toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
      const adminName = process.env.ADMIN_NAME || 'Sakthi';
      const memUser = store.users.find((u) => u.email === identifier || u.username === identifier);

      if (identifier === adminEmail && password === adminPassword) {
        const role = process.env.ADMIN_ROLE || 'Admin';
        const permissions = ROLE_PERMISSIONS_MAP[role];
        const token = jwt.sign(
          { id: memUser?.id || 'usr-admin', email: adminEmail, username: adminEmail, role, name: memUser?.name || adminName, permissions },
          getJwtSecret(),
          { expiresIn }
        );
        return res.json({
          success: true,
          token,
          mustChangePassword: false,
          user: {
            id: memUser?.id || 'usr-admin',
            username: adminEmail,
            name: memUser?.name || adminName,
            role,
            designation: role,
            email: adminEmail,
            phone: memUser?.phone || '',
            mustChangePassword: false,
            permissions
          }
        });
      }

      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post('/refresh', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'Database connection required for session refresh.' });
    }
    const cookies = parseCookies(req.headers.cookie);
    const rawRefresh = req.body?.refreshToken || cookies[REFRESH_COOKIE_NAME];
    if (!rawRefresh) {
      return res.status(401).json({ success: false, message: 'Refresh token missing.' });
    }
    const tokenDoc = await RefreshToken.findOne({ tokenHash: hashToken(rawRefresh) });
    if (!tokenDoc || tokenDoc.revokedAt || new Date(tokenDoc.expiresAt) <= new Date()) {
      return res.status(401).json({ success: false, message: 'Refresh token expired or revoked.' });
    }
    const user = await User.findById(tokenDoc.user);
    if (!user || !user.isActive || user.portalAccess === false) {
      return res.status(403).json({ success: false, message: 'Account disabled or portal access revoked.' });
    }
    if ((user.tokenVersion || 0) !== (tokenDoc.tokenVersion || 0)) {
      await RefreshToken.updateOne({ _id: tokenDoc._id }, { $set: { revokedAt: new Date() } });
      return res.status(401).json({ success: false, message: 'Session invalidated after password reset. Please login again.' });
    }

    const newRawRefresh = crypto.randomBytes(40).toString('hex');
    const newHash = hashToken(newRawRefresh);
    tokenDoc.revokedAt = new Date();
    tokenDoc.replacedByHash = newHash;
    await tokenDoc.save();

    await RefreshToken.create({
      tokenHash: newHash,
      user: user._id,
      tokenVersion: user.tokenVersion || 0,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || '',
      expiresAt: tokenDoc.expiresAt
    });

    res.cookie(REFRESH_COOKIE_NAME, newRawRefresh, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: Math.max(60000, new Date(tokenDoc.expiresAt).getTime() - Date.now())
    });

    const authData = await buildAuthPayload(user, '1d');
    res.json({
      success: true,
      token: authData.token,
      refreshToken: newRawRefresh,
      user: authData.user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const cookies = parseCookies(req.headers.cookie);
      const rawRefresh = req.body?.refreshToken || cookies[REFRESH_COOKIE_NAME];
      if (rawRefresh) {
        await RefreshToken.updateOne({ tokenHash: hashToken(rawRefresh) }, { $set: { revokedAt: new Date() } });
      }
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    await logActivity({
      entityType: 'Auth',
      entityId: req.user.id || 'user',
      module: 'Auth',
      action: 'LOGOUT',
      targetType: 'User',
      targetId: req.user.id || 'user',
      targetLabel: req.user.email,
      description: `${req.user.name || req.user.email} signed out`,
      user: req.user,
      ipAddress: req.ip
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post(
  '/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/^(?=.*[A-Za-z])(?=.*[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/)
      .withMessage('New password must contain letters and at least one number or symbol')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (currentPassword === newPassword) {
        return res.status(400).json({ success: false, message: 'New password must be different from your temporary or current password.' });
      }
      if (!isMongoConnected() || !/^[a-f\d]{24}$/i.test(req.user.id)) {
        return res.status(400).json({ success: false, message: 'Database connection required to change password.' });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }

      user.passwordHash = await bcrypt.hash(newPassword, 12);
      user.mustChangePassword = false;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.lastPasswordResetAt = new Date();
      await user.save();

      await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

      if (user.employeeRef) {
        await Employee.updateOne({ _id: user.employeeRef }, { $set: { lastPasswordResetAt: user.lastPasswordResetAt } });
      }

      const authData = await buildAuthPayload(user, '1d');
      const refreshToken = await issueRefreshToken(user, req, res, false);

      await logActivity({
        entityType: 'Auth',
        entityId: user._id.toString(),
        module: 'Auth',
        action: 'PASSWORD_CHANGE',
        targetType: 'User',
        targetId: user._id.toString(),
        targetLabel: user.email,
        description: `${user.name} updated their password`,
        user: { id: user._id.toString(), name: user.name, email: user.email },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Password updated successfully.',
        token: authData.token,
        user: authData.user
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.put(
  '/profile',
  authMiddleware,
  [body('name').optional().trim().notEmpty().withMessage('Name cannot be empty')],
  validateRequest,
  async (req, res) => {
    try {
      const { name, phone, currentPassword, newPassword } = req.body;
      if (isMongoConnected() && req.user.id && /^[a-f\d]{24}$/i.test(req.user.id)) {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (newPassword) {
          if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
          }
          if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
          }
          user.passwordHash = await bcrypt.hash(newPassword, 12);
          user.mustChangePassword = false;
          user.tokenVersion = (user.tokenVersion || 0) + 1;
          user.lastPasswordResetAt = new Date();
        }
        await user.save();

        if (user.employeeRef) {
          const empSync = {};
          if (name) empSync.name = name;
          if (phone !== undefined) empSync.phone = phone;
          if (Object.keys(empSync).length > 0) {
            await Employee.updateOne({ _id: user.employeeRef }, { $set: empSync });
          }
        }

        const authData = await buildAuthPayload(user, '7d');
        return res.json({
          success: true,
          token: authData.token,
          user: authData.user,
          message: 'Profile updated successfully'
        });
      }

      res.json({ success: true, user: req.user, message: 'Profile updated successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ==================== FORGOT PASSWORD ====================
router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required')],
  validateRequest,
  async (req, res) => {
    // Always respond 200 regardless — prevents user enumeration
    const genericOk = () => res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' });

    try {
      if (!isMongoConnected()) return genericOk();

      const user = await User.findOne({ email: req.body.email.trim().toLowerCase() });
      if (!user || !user.isActive) return genericOk();

      // Generate a 32-byte raw token — NEVER stored plain, NEVER logged
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Store only the hash + 30-min expiry
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            resetPasswordTokenHash: tokenHash,
            resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
          }
        }
      );

      const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const isEmployee = ['Senior Sales Executive', 'Sales Executive', 'Business Development Executive', 'Service Technician', 'Data Entry'].includes(user.role);
      const prefix = isEmployee ? '/employee/reset-password' : '/admin/reset-password';
      const resetUrl = `${clientBaseUrl}${prefix}?token=${rawToken}`;

      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

      return genericOk();
    } catch (err) {
      console.error('[forgot-password] error:', err.message);
      return genericOk(); // never leak errors
    }
  }
);

// ==================== RESET PASSWORD ====================
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[A-Za-z])(?=.*[\d!@#$%^&*()_+\-=[\]{};':"|,.<>/?]).+$/)
      .withMessage('Password must contain letters and at least one number or symbol')
  ],
  validateRequest,
  async (req, res) => {
    try {
      if (!isMongoConnected()) {
        return res.status(503).json({ success: false, message: 'Database connection required.' });
      }

      const { token, newPassword } = req.body;
      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

      const user = await User.findOne({
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: { $gt: new Date() }
      }).select('+resetPasswordTokenHash +resetPasswordExpiresAt');

      if (!user) {
        return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired. Please request a new one.' });
      }

      user.passwordHash = await bcrypt.hash(newPassword, 12);
      user.mustChangePassword = false;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.lastPasswordResetAt = new Date();
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordExpiresAt = undefined;
      await user.save();

      // Revoke all existing refresh tokens — force fresh login
      await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

      await logActivity({
        entityType: 'Auth',
        entityId: user._id.toString(),
        module: 'Auth',
        action: 'PASSWORD_RESET',
        targetType: 'User',
        targetId: user._id.toString(),
        targetLabel: user.email,
        description: `Password reset completed for ${user.email}`,
        user: { id: user._id.toString(), name: user.name, email: user.email },
        ipAddress: req.ip
      });

      res.json({ success: true, message: 'Password reset successfully. You can now sign in with your new password.' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ==================== UI PREFERENCES ====================
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    if (!isMongoConnected() || !/^[a-f\d]{24}$/i.test(req.user.id)) {
      return res.json({ success: true, message: 'Preferences saved locally.' });
    }

    const { appearance, theme, navigation, navbar, layout, direction } = req.body;
    const prefs = {};
    if (['light', 'dark', 'system'].includes(appearance)) prefs['uiPreferences.appearance'] = appearance;
    if (['default', 'bordered', 'semi-dark'].includes(theme)) prefs['uiPreferences.theme'] = theme;
    if (['expanded', 'collapsed'].includes(navigation)) prefs['uiPreferences.navigation'] = navigation;
    if (['sticky', 'static', 'hidden'].includes(navbar)) prefs['uiPreferences.navbar'] = navbar;
    if (['compact', 'wide'].includes(layout)) prefs['uiPreferences.layout'] = layout;
    if (['ltr', 'rtl'].includes(direction)) prefs['uiPreferences.direction'] = direction;

    if (Object.keys(prefs).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid preference fields provided.' });
    }

    await User.updateOne({ _id: req.user.id }, { $set: prefs });

    res.json({ success: true, message: 'Preferences saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;