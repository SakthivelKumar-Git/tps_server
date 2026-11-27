import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import Dealer from '../models/Dealer.js';
import FollowUp from '../models/FollowUp.js';
import ActivityLog from '../models/ActivityLog.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, getAccessibleEmployeeIds, requirePermission, validateRequest } from '../middleware/auth.js';
import { nextSequenceId, normalizePhone, runInTransaction } from '../utils/sequence.js';
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

const buildLeadLookup = (idOrCode) =>
  mongoose.Types.ObjectId.isValid(idOrCode)
    ? { $or: [{ _id: idOrCode }, { leadId: idOrCode }] }
    : { leadId: idOrCode };

// Public + Admin create lead with duplicate & idempotency protection
export const createLeadHandler = async (req, res) => {
  try {
    const customerName = (req.body.customerName || req.body.name || '').trim();
    const phone = (req.body.phone || '').trim();
    if (!customerName || !phone) {
      return res.status(400).json({ success: false, message: 'Customer name and phone number are required' });
    }

    const normalizedPhone = normalizePhone(phone);
    const email = (req.body.email || '').trim().toLowerCase();
    const submissionToken = (req.body.submissionToken || '').trim() || undefined;
    const allowDuplicate = Boolean(req.body.allowDuplicate);

    const leadPayload = {
      customerName,
      phone,
      normalizedPhone,
      email,
      company: (req.body.company || '').trim(),
      address: (req.body.address || '').trim(),
      city: req.body.city || 'Salem',
      referralType: req.body.referralType || 'None',
      referralName: (req.body.referralName || '').trim(),
      referralMobile: (req.body.referralMobile || '').trim(),
      enquiryType: req.body.enquiryType || 'Product Enquiry',
      category: req.body.category || 'Pressure Pumps',
      subcategory: req.body.subcategory || '',
      subcategoryRef: req.body.subcategoryRef && mongoose.Types.ObjectId.isValid(req.body.subcategoryRef) ? req.body.subcategoryRef : null,
      brand: req.body.brand || 'GRUNDFOS',
      product: req.body.product || '',
      productRef: req.body.productRef && mongoose.Types.ObjectId.isValid(req.body.productRef) ? req.body.productRef : null,
      dealer: req.body.dealer && mongoose.Types.ObjectId.isValid(req.body.dealer) ? req.body.dealer : null,
      dealerName: req.body.dealerName || '',
      inquiryDate: req.body.inquiryDate ? new Date(req.body.inquiryDate) : new Date(),
      subject: req.body.subject || '',
      message: req.body.message || '',
      leadSource: req.body.leadSource || (req.user ? 'Phone Call' : 'Website'),
      assignedEmployee: req.body.assignedEmployee || null,
      assignedEmployeeName: req.body.assignedEmployeeName || '',
      createdBy: req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null,
      createdByName: req.user?.name || 'Website Visitor',
      priority: req.body.priority || 'Medium',
      status: req.body.status || 'New',
      estimatedValue: Number(req.body.estimatedValue || 0),
      expectedCloseDate: req.body.expectedCloseDate ? new Date(req.body.expectedCloseDate) : null,
      notes: req.body.notes || '',
      ...(submissionToken ? { submissionToken } : {})
    };

    if (isMongoConnected()) {
      // 1. Idempotency check (prevents double-click duplicate creation)
      if (submissionToken) {
        const existingByToken = await Lead.findOne({ submissionToken });
        if (existingByToken) {
          return res.status(200).json({
            success: true,
            duplicatePrevented: true,
            message: `Enquiry ${existingByToken.leadId} already received.`,
            data: existingByToken
          });
        }
      }

      // 2. Duplicate active lead check by normalizedPhone
      if (!allowDuplicate && normalizedPhone) {
        const recentWindow = new Date(Date.now() - 5 * 60 * 1000);
        const existingLead = await Lead.findOne({
          normalizedPhone,
          status: { $nin: ['Converted', 'Lost'] }
        }).sort({ createdAt: -1 });

        if (existingLead) {
          if (req.user) {
            return res.status(409).json({
              success: false,
              message: `An open lead (${existingLead.leadId} — ${existingLead.customerName}) already exists for phone ${phone}.`,
              existingLead
            });
          }
          // Public website submission within 5 minutes -> deduplicate gracefully
          if (new Date(existingLead.createdAt) >= recentWindow) {
            return res.status(200).json({
              success: true,
              duplicatePrevented: true,
              message: 'Thank you! Your enquiry has already been registered with our engineering team.',
              data: existingLead
            });
          }
        }
      }

      const leadId = await nextSequenceId('TPS-LD');
      if (leadPayload.assignedEmployee && mongoose.Types.ObjectId.isValid(leadPayload.assignedEmployee)) {
        const emp = await Employee.findById(leadPayload.assignedEmployee);
        if (emp) leadPayload.assignedEmployeeName = emp.name;
      } else {
        leadPayload.assignedEmployee = null;
      }
      if (leadPayload.dealer && mongoose.Types.ObjectId.isValid(leadPayload.dealer)) {
        const dealer = await Dealer.findById(leadPayload.dealer);
        if (dealer) leadPayload.dealerName = dealer.businessName || dealer.dealerName;
      }

      // Phase 3: Central Customer Duplicate Prevention & Auto-link
      let linkedCustomerId =
        req.body.customerId && mongoose.Types.ObjectId.isValid(req.body.customerId) ? req.body.customerId : null;
      if (!linkedCustomerId) {
        const { customer } = await findOrCreateCustomer({
          name: leadPayload.customerName,
          phone: leadPayload.phone,
          email: leadPayload.email,
          company: leadPayload.company,
          address: leadPayload.address,
          city: leadPayload.city,
          referralType: leadPayload.referralType,
          referralName: leadPayload.referralName,
          referralMobile: leadPayload.referralMobile,
          assignedEmployee: leadPayload.assignedEmployee,
          assignedEmployeeName: leadPayload.assignedEmployeeName,
          createdBy: leadPayload.createdBy,
          createdByName: leadPayload.createdByName
        });
        linkedCustomerId = customer?._id || null;
      }

      const lead = await Lead.create({ ...leadPayload, leadId, convertedCustomer: linkedCustomerId });
      await createNotification({
        type: 'New Lead',
        title: `New Lead ${lead.leadId}`,
        message: `${lead.customerName} (${lead.phone}) enquired about ${lead.product || lead.category || lead.brand}`,
        relatedModel: 'Lead',
        relatedId: lead._id.toString(),
        link: `/admin/leads/${lead._id.toString()}`,
        dedupeKey: `lead-${lead._id.toString()}`
      });
      await logActivity({
        entityType: 'Lead',
        entityId: lead._id.toString(),
        entityRef: lead.leadId,
        action: 'CREATE',
        description: `Lead created from ${lead.leadSource} for ${lead.customerName}`,
        user: req.user,
        ipAddress: req.ip
      });

      return res.status(201).json({
        success: true,
        message: 'Enquiry received. Our engineering team will contact you shortly.',
        data: lead
      });
    }

    // Fallback store mode
    if (submissionToken) {
      const existingByToken = store.leads.find((l) => l.submissionToken === submissionToken);
      if (existingByToken) {
        return res.status(200).json({
          success: true,
          duplicatePrevented: true,
          message: `Enquiry ${existingByToken.leadId} already received.`,
          data: existingByToken
        });
      }
    }

    if (!allowDuplicate && normalizedPhone) {
      const recentCutoff = Date.now() - 5 * 60 * 1000;
      const existingLead = store.leads.find(
        (l) => normalizePhone(l.phone) === normalizedPhone && !['Converted', 'Lost'].includes(l.status)
      );
      if (existingLead) {
        if (req.user) {
          return res.status(409).json({
            success: false,
            message: `An open lead (${existingLead.leadId} — ${existingLead.customerName}) already exists for phone ${phone}.`,
            existingLead
          });
        }
        if (new Date(existingLead.createdAt).getTime() >= recentCutoff) {
          return res.status(200).json({
            success: true,
            duplicatePrevented: true,
            message: 'Thank you! Your enquiry has already been registered with our engineering team.',
            data: existingLead
          });
        }
      }
    }

    const leadId = await nextSequenceId('TPS-LD');
    if (leadPayload.assignedEmployee) {
      const emp = store.employees.find((e) => e.id === leadPayload.assignedEmployee);
      if (emp) leadPayload.assignedEmployeeName = emp.name;
    }
    const created = {
      ...leadPayload,
      id: `lead-${Date.now()}`,
      leadId,
      name: leadPayload.customerName,
      notesList: [],
      communications: [],
      createdAt: new Date().toISOString()
    };
    store.leads.unshift(created);
    store.addNotification({
      type: 'New Lead',
      title: `New Lead ${leadId}`,
      message: `${created.customerName} (${created.phone}) enquired about ${created.product || created.category}`,
      relatedModel: 'Lead',
      relatedId: created.id,
      link: `/admin/leads/${created.id}`,
      dedupeKey: `lead-${created.id}`
    });
    res.status(201).json({
      success: true,
      message: 'Enquiry received. Our engineering team will contact you shortly.',
      data: created
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

router.post('/', authMiddleware, requirePermission('leads:create'), createLeadHandler);

router.get('/', authMiddleware, requirePermission('leads:view'), async (req, res) => {
  try {
    const { status, brand, source, assignedEmployee, search, startDate, endDate } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['createdAt', 'customerName', 'status', 'leadId', 'estimatedValue'],
      'createdAt'
    );

    if (isMongoConnected()) {
      const query = {};
      const perms = req.user.permissions || [];
      const hasAllLeads = perms.includes('*') || perms.includes('leads.viewAll');

      if (!hasAllLeads) {
        const hasTeam = perms.includes('leads.viewTeam');
        const allowedEmpIds = hasTeam
          ? await getAccessibleEmployeeIds(req.user)
          : req.user.employeeObjectId
          ? [req.user.employeeObjectId]
          : [];
        if (allowedEmpIds.length === 0) {
          return res.json({ success: true, data: [], pagination: { total: 0, page, limit, totalPages: 1 } });
        }
        query.assignedEmployee = { $in: allowedEmpIds };
      } else if (assignedEmployee && mongoose.Types.ObjectId.isValid(assignedEmployee)) {
        query.assignedEmployee = assignedEmployee;
      }

      if (status && status !== 'All' && status !== 'all') query.status = status;
      if (brand && brand !== 'All') query.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
      if (source && source !== 'All') query.leadSource = source;
      const dateFilter = buildDateRangeFilter(startDate, endDate, 'createdAt');
      if (dateFilter) Object.assign(query, dateFilter);

      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { leadId: rx },
          { customerName: rx },
          { phone: rx },
          { email: rx },
          { product: rx },
          { brand: rx },
          { subject: rx }
        ];
      }

      const [data, total] = await Promise.all([
        Lead.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        Lead.countDocuments(query)
      ]);

      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    const result = filterAndPaginateMemory(store.leads, {
      search,
      searchFields: ['leadId', 'customerName', 'phone', 'email', 'product', 'brand', 'subject'],
      filters: { status, brand, leadSource: source, assignedEmployee },
      startDate,
      endDate,
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

const checkLeadAccess = async (user, lead, writeMode = false) => {
  const perms = user.permissions || [];
  if (perms.includes('*')) return true;
  if (writeMode ? perms.includes('leads.editAll') : perms.includes('leads.viewAll')) return true;
  if (!lead.assignedEmployee) return false;
  const assignedStr = lead.assignedEmployee.toString();
  if (perms.includes('leads.viewTeam') && !writeMode) {
    const teamIds = await getAccessibleEmployeeIds(user);
    return teamIds.includes(assignedStr);
  }
  return Boolean(user.employeeObjectId && assignedStr === user.employeeObjectId);
};

router.get('/:id', authMiddleware, requirePermission('leads:view'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const lead = await Lead.findOne(buildLeadLookup(req.params.id)).populate('convertedCustomer', 'customerId name phone');
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      if (!(await checkLeadAccess(req.user, lead, false))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to access this lead.' });
      }
      const [followUps, timeline] = await Promise.all([
        FollowUp.find({ relatedModel: 'Lead', relatedId: lead._id }).sort({ followUpDate: -1 }),
        ActivityLog.find({ entityType: 'Lead', entityId: lead._id.toString() }).sort({ createdAt: -1 })
      ]);
      return res.json({ success: true, data: { ...lead.toJSON(), followUps, timeline } });
    }

    const lead = store.leads.find((l) => l.id === req.params.id || l.leadId === req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    const followUps = store.followUps.filter((f) => f.relatedRef === lead.leadId || f.relatedId === lead.id);
    const timeline = store.activityLogs.filter((a) => a.entityType === 'Lead' && a.entityId === lead.id);
    res.json({ success: true, data: { ...lead, followUps, timeline } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const updateLeadHandler = async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.name && !update.customerName) update.customerName = update.name;
    if (update.phone) update.normalizedPhone = normalizePhone(update.phone);
    if (update.email !== undefined) update.email = String(update.email || '').trim().toLowerCase();
    if (update.estimatedValue !== undefined) update.estimatedValue = Number(update.estimatedValue || 0);

    if (isMongoConnected()) {
      const existingLead = await Lead.findOne(buildLeadLookup(req.params.id));
      if (!existingLead) return res.status(404).json({ success: false, message: 'Lead not found' });
      if (!(await checkLeadAccess(req.user, existingLead, true))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to modify this lead.' });
      }
      if (
        update.assignedEmployee !== undefined &&
        String(update.assignedEmployee || '') !== String(existingLead.assignedEmployee || '') &&
        !req.user.permissions.includes('*') &&
        !req.user.permissions.includes('leads.assign')
      ) {
        return res.status(403).json({ success: false, message: 'You do not have permission to reassign lead ownership.' });
      }
      if (update.assignedEmployee && mongoose.Types.ObjectId.isValid(update.assignedEmployee)) {
        const emp = await Employee.findById(update.assignedEmployee);
        if (emp) update.assignedEmployeeName = emp.name;
      } else if (update.assignedEmployee === '') {
        update.assignedEmployee = null;
        update.assignedEmployeeName = '';
      }

      const updated = await Lead.findOneAndUpdate(buildLeadLookup(req.params.id), update, { new: true });

      await logActivity({
        entityType: 'Lead',
        entityId: updated._id.toString(),
        entityRef: updated.leadId,
        action: 'UPDATE',
        description: `Lead updated${update.status ? ` (status: ${update.status})` : ''}`,
        user: req.user,
        ipAddress: req.ip
      });
      return res.json({ success: true, data: updated });
    }

    const idx = store.leads.findIndex((l) => l.id === req.params.id || l.leadId === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (update.assignedEmployee) {
      const emp = store.employees.find((e) => e.id === update.assignedEmployee);
      if (emp) update.assignedEmployeeName = emp.name;
    }
    store.leads[idx] = { ...store.leads[idx], ...update, name: update.customerName || store.leads[idx].customerName, updatedAt: new Date().toISOString() };
    res.json({ success: true, data: store.leads[idx] });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

router.put('/:id', authMiddleware, requirePermission('leads:edit'), updateLeadHandler);
router.patch('/:id', authMiddleware, requirePermission('leads:edit'), updateLeadHandler);

router.post(
  '/:id/notes',
  authMiddleware,
  requirePermission('leads:edit'),
  [body('text').trim().notEmpty().withMessage('Note text is required')],
  validateRequest,
  async (req, res) => {
    try {
      const note = { text: req.body.text, addedBy: req.user?.name || 'Admin', createdAt: new Date() };
      if (isMongoConnected()) {
        const existingLead = await Lead.findOne(buildLeadLookup(req.params.id));
        if (!existingLead) return res.status(404).json({ success: false, message: 'Lead not found' });
        if (!(await checkLeadAccess(req.user, existingLead, true))) {
          return res.status(403).json({ success: false, message: 'You do not have permission to edit this lead.' });
        }
        const lead = await Lead.findOneAndUpdate(
          { _id: existingLead._id },
          { $push: { notesList: note }, $set: { notes: req.body.text } },
          { new: true }
        );
        await logActivity({
          entityType: 'Lead',
          entityId: lead._id.toString(),
          entityRef: lead.leadId,
          action: 'NOTE_ADDED',
          description: `Added note: ${req.body.text.slice(0, 80)}`,
          user: req.user
        });
        return res.json({ success: true, data: lead });
      }
      const lead = store.leads.find((l) => l.id === req.params.id || l.leadId === req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      lead.notesList = lead.notesList || [];
      lead.notesList.unshift({ ...note, id: `note-${Date.now()}` });
      lead.notes = req.body.text;
      res.json({ success: true, data: lead });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/:id/communications',
  authMiddleware,
  requirePermission('leads:edit'),
  [body('summary').trim().notEmpty().withMessage('Communication summary is required')],
  validateRequest,
  async (req, res) => {
    try {
      const entry = {
        type: req.body.type || 'Call',
        summary: req.body.summary,
        by: req.user?.name || 'Admin',
        createdAt: new Date()
      };
      if (isMongoConnected()) {
        const existingLead = await Lead.findOne(buildLeadLookup(req.params.id));
        if (!existingLead) return res.status(404).json({ success: false, message: 'Lead not found' });
        if (!(await checkLeadAccess(req.user, existingLead, true))) {
          return res.status(403).json({ success: false, message: 'You do not have permission to edit this lead.' });
        }
        const lead = await Lead.findOneAndUpdate(
          { _id: existingLead._id },
          { $push: { communications: entry } },
          { new: true }
        );
        await logActivity({
          entityType: 'Lead',
          entityId: lead._id.toString(),
          entityRef: lead.leadId,
          action: 'COMMUNICATION',
          description: `${entry.type}: ${entry.summary.slice(0, 80)}`,
          user: req.user
        });
        return res.json({ success: true, data: lead });
      }
      const lead = store.leads.find((l) => l.id === req.params.id || l.leadId === req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      lead.communications = lead.communications || [];
      lead.communications.unshift({ ...entry, id: `comm-${Date.now()}` });
      res.json({ success: true, data: lead });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.post('/:id/convert', authMiddleware, requirePermission('leads:edit'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const result = await runInTransaction(async (session) => {
        const lead = await Lead.findOne(buildLeadLookup(req.params.id)).session(session || null);
        if (!lead) return null;
        if (!(await checkLeadAccess(req.user, lead, true))) {
          const err = new Error('You do not have permission to convert this lead.');
          err.statusCode = 403;
          throw err;
        }

        if (lead.status === 'Converted' && lead.convertedCustomer) {
          const existingCust = await mongoose.model('Customer').findById(lead.convertedCustomer).session(session || null);
          if (existingCust) {
            return { lead, customer: existingCust, createdCustomer: false, alreadyConverted: true };
          }
        }

        const { customer, created } = await findOrCreateCustomer(
          {
            name: lead.customerName,
            phone: lead.phone,
            email: lead.email,
            city: lead.city,
            customerType: req.body.customerType || 'Residential',
            sourceLead: lead._id
          },
          session
        );

        lead.status = 'Converted';
        lead.convertedCustomer = customer._id;
        lead.convertedAt = new Date();
        await lead.save({ session: session || undefined });

        await logActivity(
          {
            entityType: 'Lead',
            entityId: lead._id.toString(),
            entityRef: lead.leadId,
            action: 'CONVERT',
            description: `Converted lead ${lead.leadId} to customer ${customer.customerId}`,
            user: req.user
          },
          session
        );

        return { lead, customer, createdCustomer: created };
      });
      if (!result) return res.status(404).json({ success: false, message: 'Lead not found' });
      return res.json({
        success: true,
        message: result.alreadyConverted
          ? `Lead is already linked to customer ${result.customer.customerId}.`
          : `Lead converted to customer ${result.customer.customerId} successfully.`,
        data: result
      });
    }

    const lead = store.leads.find((l) => l.id === req.params.id || l.leadId === req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (lead.status === 'Converted' && lead.convertedCustomer) {
      const existingCust = store.customers.find((c) => c.id === lead.convertedCustomer);
      if (existingCust) {
        return res.json({
          success: true,
          message: `Lead is already linked to customer ${existingCust.customerId}.`,
          data: { lead, customer: existingCust, createdCustomer: false, alreadyConverted: true }
        });
      }
    }
    const { customer, created } = store.findOrCreateCustomer({
      name: lead.customerName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city
    });
    lead.status = 'Converted';
    lead.convertedCustomer = customer.id;
    lead.convertedAt = new Date().toISOString();
    res.json({
      success: true,
      message: `Lead converted to customer ${customer.customerId} successfully.`,
      data: { lead, customer, createdCustomer: created }
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authMiddleware, requirePermission('leads:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Lead.findOneAndDelete(buildLeadLookup(req.params.id));
      if (!deleted) return res.status(404).json({ success: false, message: 'Lead not found' });
      await logActivity({
        entityType: 'Lead',
        entityId: deleted._id.toString(),
        entityRef: deleted.leadId,
        action: 'DELETE',
        description: `Deleted lead ${deleted.leadId}`,
        user: req.user
      });
      return res.json({ success: true, message: 'Lead deleted successfully' });
    }
    const idx = store.leads.findIndex((l) => l.id === req.params.id || l.leadId === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Lead not found' });
    store.leads.splice(idx, 1);
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
