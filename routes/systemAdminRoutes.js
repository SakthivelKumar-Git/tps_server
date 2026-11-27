import express from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';
import CompanySetting from '../models/CompanySetting.js';
import User from '../models/User.js';
import { isMongoConnected } from '../config/db.js';
import { authorize, authorizeAny, authMiddleware } from '../middleware/auth.js';
import { getMigrationStatus } from '../utils/migrator.js';
import { escapeRegex, logActivity, parsePagination } from '../utils/crmHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

const router = express.Router();

const getDirStats = (dir) => {
  if (!fs.existsSync(dir)) return { files: 0, totalBytes: 0 };
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = 0;
  let totalBytes = 0;
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile()) {
      files += 1;
      totalBytes += fs.statSync(p).size;
    }
  }
  return { files, totalBytes };
};

router.get('/health', authMiddleware, authorizeAny('system.view', 'system.manage'), async (_req, res) => {
  try {
    const start = Date.now();
    let dbStatus = 'disconnected';
    let dbName = '';
    let collections = [];
    let migrations = [];

    if (isMongoConnected()) {
      await mongoose.connection.db.admin().ping();
      dbStatus = 'connected';
      dbName = mongoose.connection.name;
      const cols = await mongoose.connection.db.listCollections().toArray();
      collections = await Promise.all(
        cols.map(async (c) => ({
          name: c.name,
          count: await mongoose.connection.db.collection(c.name).countDocuments()
        }))
      );
      migrations = await getMigrationStatus(mongoose.connection.db);
    }

    const dbLatencyMs = Date.now() - start;
    const uploadStats = getDirStats(UPLOADS_DIR);
    const mem = process.memoryUsage();
    const activeUsers = isMongoConnected() ? await User.countDocuments({ isActive: true }) : 0;

    res.json({
      success: true,
      data: {
        serviceStatus: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        environment: process.env.NODE_ENV || 'development',
        database: {
          status: dbStatus,
          name: dbName,
          latencyMs: dbLatencyMs,
          collections: collections.sort((a, b) => a.name.localeCompare(b.name))
        },
        migrations,
        storage: {
          uploadsFiles: uploadStats.files,
          uploadsSizeKB: Math.round(uploadStats.totalBytes / 1024)
        },
        memory: {
          rssMB: Math.round(mem.rss / 1048576),
          heapUsedMB: Math.round(mem.heapUsed / 1048576),
          heapTotalMB: Math.round(mem.heapTotal / 1048576)
        },
        activeUsers
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/logs', authMiddleware, authorizeAny('system.view', 'audit.view'), async (req, res) => {
  try {
    if (!isMongoConnected()) return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25, totalPages: 1 } });
    const { module: mod, action, search } = req.query;
    const { page, limit, skip } = parsePagination(req.query, ['createdAt'], 'createdAt');

    const query = {};
    if (mod && mod !== 'All') query.module = mod;
    if (action && action !== 'All') query.action = action;
    // System Admin without payroll/financial permissions must not inspect private payroll details inside log metadata
    if (!req.user.permissions.includes('*') && !req.user.permissions.includes('payroll.viewAll')) {
      query.module = query.module || { $ne: 'Payroll' };
    }
    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ description: rx }, { performedByName: rx }, { entityRef: rx }, { targetLabel: rx }];
    }

    const [data, total] = await Promise.all([
      ActivityLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ActivityLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/config', authMiddleware, authorizeAny('system.view', 'system.manage'), async (_req, res) => {
  try {
    const settings = isMongoConnected() ? await CompanySetting.findOne({ key: 'default' }) : null;
    res.json({
      success: true,
      data: {
        warrantyReminderDays: settings?.warrantyReminderDays ?? 30,
        amcReminderDays: settings?.amcReminderDays ?? 30,
        timeSlots: settings?.timeSlots || [],
        maxUploadSizeMB: 5,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        rateLimitWindowMin: 15,
        rateLimitMaxRequests: 600
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/config', authMiddleware, authorize('system.manage'), async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ success: false, message: 'MongoDB connection required.' });
    }
    const { warrantyReminderDays, amcReminderDays, timeSlots } = req.body;
    const update = {};
    if (warrantyReminderDays !== undefined) update.warrantyReminderDays = Number(warrantyReminderDays);
    if (amcReminderDays !== undefined) update.amcReminderDays = Number(amcReminderDays);
    if (Array.isArray(timeSlots)) update.timeSlots = timeSlots.filter(Boolean);

    const updated = await CompanySetting.findOneAndUpdate({ key: 'default' }, update, { upsert: true, new: true });

    await logActivity({
      entityType: 'SystemConfig',
      entityId: updated._id.toString(),
      module: 'System',
      action: 'SYSTEM_CONFIG_UPDATE',
      description: 'Updated system notification & reminder configuration',
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, data: updated, message: 'System configuration updated.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Authorised internal test notification endpoint (from employee settings menu / system admin)
router.post('/test-notification', authMiddleware, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'Database unavailable' });
    const created = await Notification.create({
      type: 'System Test',
      title: `Portal Test Alert — ${req.user.name}`,
      message: `Notification delivery verified for ${req.user.email} at ${new Date().toLocaleTimeString('en-IN')}.`,
      relatedModel: 'User',
      relatedId: req.user.id,
      link: req.user.hierarchyLevel <= 3 ? '/admin/dashboard' : '/employee/notifications',
      isRead: false
    });
    res.status(201).json({ success: true, data: created, message: 'Test notification generated.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
