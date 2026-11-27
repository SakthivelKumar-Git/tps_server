import Customer from '../models/Customer.js';
import Notification from '../models/Notification.js';
import ActivityLog from '../models/ActivityLog.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { nextSequenceId, normalizePhone } from './sequence.js';

export const computeStatusByEndDate = (endDate, currentStatus = 'Active') => {
  if (currentStatus === 'Void' || currentStatus === 'Cancelled' || currentStatus === 'Renewed') {
    return currentStatus;
  }
  if (!endDate) return 'Active';
  const now = new Date();
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return currentStatus || 'Pending Verification';
  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expired';
  if (diffDays <= 30) return 'Expiring Soon';
  return 'Active';
};

export const safeDaysRemaining = (endDate) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

export const findOrCreateCustomer = async (payload, session = null) => {
  const name = (payload.name || payload.customerName || '').trim();
  const phone = (payload.phone || '').trim();
  const email = (payload.email || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);

  if (isMongoConnected()) {
    let existing = null;
    if (normalizedPhone) {
      existing = await Customer.findOne({ normalizedPhone }).session(session || null);
    }
    if (!existing && email) {
      existing = await Customer.findOne({ email }).session(session || null);
    }

    if (existing) {
      let dirty = false;
      if (!existing.email && email) { existing.email = email; dirty = true; }
      if (!existing.company && payload.company) { existing.company = payload.company; dirty = true; }
      if (!existing.address && (payload.address || payload.serviceAddress)) {
        existing.address = payload.address || payload.serviceAddress;
        dirty = true;
      }
      if (!existing.city && payload.city) { existing.city = payload.city; dirty = true; }
      if (!existing.pincode && payload.pincode) { existing.pincode = payload.pincode; dirty = true; }
      if (!existing.altPhone && payload.altPhone) { existing.altPhone = payload.altPhone; dirty = true; }
      if ((!existing.referralType || existing.referralType === 'None') && payload.referralType) {
        existing.referralType = payload.referralType;
        dirty = true;
      }
      if (!existing.referralName && payload.referralName) { existing.referralName = payload.referralName; dirty = true; }
      if (!existing.referralMobile && payload.referralMobile) { existing.referralMobile = payload.referralMobile; dirty = true; }
      if (dirty) await existing.save({ session: session || undefined });
      return { customer: existing, created: false };
    }

    const customerId = await nextSequenceId('TPS-CUS', session);
    const doc = {
      customerId,
      name: name || 'Walk-in Customer',
      phone,
      normalizedPhone: normalizedPhone || customerId,
      altPhone: payload.altPhone || '',
      email,
      company: payload.company || '',
      address: payload.address || payload.serviceAddress || payload.location || '',
      city: payload.city || 'Salem',
      pincode: payload.pincode || '',
      customerType: payload.customerType || 'Residential',
      referralType: payload.referralType || 'None',
      referralName: payload.referralName || '',
      referralMobile: payload.referralMobile || '',
      assignedEmployee: payload.assignedEmployee || null,
      assignedEmployeeName: payload.assignedEmployeeName || '',
      createdBy: payload.createdBy || null,
      createdByName: payload.createdByName || '',
      sourceLead: payload.sourceLead || null
    };
    const [created] = await Customer.create([doc], session ? { session } : {});
    return { customer: created, created: true };
  }

  return store.findOrCreateCustomer(payload);
};

export const createNotification = async (
  { type, title, message, relatedModel = '', relatedId = '', link = '/admin/dashboard', dedupeKey = null },
  session = null
) => {
  if (isMongoConnected()) {
    try {
      if (dedupeKey) {
        const exists = await Notification.findOne({ dedupeKey }).session(session || null);
        if (exists) return exists;
      }
      const doc = { type, title, message, relatedModel, relatedId: String(relatedId || ''), link };
      if (dedupeKey) doc.dedupeKey = dedupeKey;
      const [created] = await Notification.create([doc], session ? { session } : {});
      return created;
    } catch (err) {
      if (err?.code === 11000) return null; // dedupe conflict ignored safely
      return null;
    }
  }
  return store.addNotification({ type, title, message, relatedModel, relatedId, link, dedupeKey });
};

export const logActivity = async (
  {
    entityType,
    entityId,
    entityRef = '',
    module = 'CRM',
    action,
    targetType = '',
    targetId = '',
    targetLabel = '',
    description,
    user = null,
    changes = null,
    previousValues = null,
    newValues = null,
    metadata = {},
    ipAddress = ''
  },
  session = null
) => {
  const performedByName = user?.name || user?.email || 'System';
  const userRole = user?.role || '';
  if (isMongoConnected()) {
    try {
      const [log] = await ActivityLog.create(
        [
          {
            entityType,
            entityId: String(entityId),
            entityRef,
            module,
            action,
            targetType,
            targetId: String(targetId || ''),
            targetLabel,
            description,
            performedBy: user?.id && /^[a-f\d]{24}$/i.test(user.id) ? user.id : null,
            performedByName,
            userRole,
            changes,
            previousValues,
            newValues,
            metadata,
            ipAddress
          }
        ],
        session ? { session } : {}
      );
      return log;
    } catch {
      return null;
    }
  }
  return store.addActivityLog({
    entityType,
    entityId: String(entityId),
    entityRef,
    action,
    description,
    performedByName,
    metadata
  });
};

export const parsePagination = (query, allowedSort = ['createdAt'], defaultSort = 'createdAt') => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
  const skip = (page - 1) * limit;
  const sortBy = allowedSort.includes(query.sortBy) ? query.sortBy : defaultSort;
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  return { page, limit, skip, sortBy, sortOrder };
};

export const buildDateRangeFilter = (startDate, endDate, field = 'createdAt') => {
  if (!startDate && !endDate) return null;
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
};

export const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const stripImmutableFields = (body = {}) => {
  const clean = { ...body };
  delete clean._id;
  delete clean.id;
  delete clean.__v;
  delete clean.createdAt;
  delete clean.updatedAt;
  delete clean.password;
  delete clean.passwordHash;
  delete clean.passwordPlain;
  return clean;
};
