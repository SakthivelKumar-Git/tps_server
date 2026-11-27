import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import FollowUp from '../models/FollowUp.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, getAccessibleEmployeeIds, requirePermission, validateRequest } from '../middleware/auth.js';
import { nextSequenceId } from '../utils/sequence.js';
import { createNotification, escapeRegex, logActivity, parsePagination, stripImmutableFields } from '../utils/crmHelpers.js';
import { filterAndPaginateMemory } from '../utils/memoryQuery.js';

const router = express.Router();

router.get('/', authMiddleware, requirePermission('followUps:view'), async (req, res) => {
  try {
    const { view, category, status, assignedEmployee, search } = req.query;
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(
      req.query,
      ['followUpDate', 'createdAt', 'followUpId', 'status'],
      'followUpDate'
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (isMongoConnected()) {
      const query = {};
      const perms = req.user.permissions || [];
      if (!perms.includes('*') && !perms.includes('followups.viewAll')) {
        const teamIds = perms.includes('employees.viewTeam') || req.user.role === 'Manager'
          ? await getAccessibleEmployeeIds(req.user)
          : req.user.employeeObjectId
          ? [req.user.employeeObjectId]
          : [];
        if (teamIds.length === 0) {
          return res.json({ success: true, data: [], pagination: { total: 0, page, limit, totalPages: 1 } });
        }
        query.assignedEmployee = { $in: teamIds };
      } else if (assignedEmployee && mongoose.Types.ObjectId.isValid(assignedEmployee)) {
        query.assignedEmployee = assignedEmployee;
      }
      if (category && category !== 'All') query.category = category;
      if (status && status !== 'All') query.status = status;

      if (view === 'upcoming') {
        query.status = { $in: ['Upcoming', 'Pending'] };
        query.followUpDate = { $gte: startOfToday };
      } else if (view === 'today') {
        query.status = { $in: ['Upcoming', 'Pending'] };
        query.followUpDate = { $gte: startOfToday, $lte: endOfToday };
      } else if (view === 'overdue') {
        query.status = { $in: ['Upcoming', 'Pending', 'Missed'] };
        query.followUpDate = { $lt: startOfToday };
      } else if (view === 'completed' || view === 'history') {
        if (view === 'completed') query.status = 'Completed';
      }

      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        query.$or = [
          { followUpId: rx },
          { customerName: rx },
          { phone: rx },
          { relatedRef: rx },
          { notes: rx },
          { assignedEmployeeName: rx }
        ];
      }

      const [data, total] = await Promise.all([
        FollowUp.find(query).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
        FollowUp.countDocuments(query)
      ]);

      return res.json({
        success: true,
        data,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
      });
    }

    let list = [...store.followUps];
    if (view === 'upcoming') {
      list = list.filter((f) => ['Upcoming', 'Pending'].includes(f.status) && new Date(f.followUpDate) >= startOfToday);
    } else if (view === 'today') {
      list = list.filter((f) => ['Upcoming', 'Pending'].includes(f.status) && new Date(f.followUpDate) >= startOfToday && new Date(f.followUpDate) <= endOfToday);
    } else if (view === 'overdue') {
      list = list.filter((f) => ['Upcoming', 'Pending', 'Missed'].includes(f.status) && new Date(f.followUpDate) < startOfToday);
    } else if (view === 'completed') {
      list = list.filter((f) => f.status === 'Completed');
    }

    const result = filterAndPaginateMemory(list, {
      search,
      searchFields: ['followUpId', 'customerName', 'phone', 'relatedRef', 'notes', 'assignedEmployeeName'],
      filters: { category, status, assignedEmployee },
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
  '/',
  authMiddleware,
  requirePermission('followUps:create'),
  [
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('followUpDate').notEmpty().withMessage('Follow-up date is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const followUpId = await nextSequenceId('TPS-FLW');
      const payload = {
        ...req.body,
        followUpId,
        followUpDate: new Date(req.body.followUpDate),
        status: req.body.status || 'Upcoming'
      };

      if (isMongoConnected()) {
        if (payload.assignedEmployee && mongoose.Types.ObjectId.isValid(payload.assignedEmployee)) {
          const emp = await Employee.findById(payload.assignedEmployee);
          if (emp) payload.assignedEmployeeName = emp.name;
        } else {
          payload.assignedEmployee = req.user?.employeeObjectId || null;
          payload.assignedEmployeeName = req.user?.employeeObjectId ? req.user.name : '';
        }
        payload.createdBy = req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null;
        payload.createdByName = req.user?.name || '';
        if (payload.relatedId && !mongoose.Types.ObjectId.isValid(payload.relatedId)) {
          payload.relatedId = null;
        }
        if (payload.customer && !mongoose.Types.ObjectId.isValid(payload.customer)) {
          payload.customer = null;
        }

        const created = await FollowUp.create(payload);

        if (created.status !== 'Cancelled') {
          await createNotification({
            type: 'Follow-up Due',
            title: `Follow-up ${created.followUpId} Scheduled`,
            message: `${created.customerName} (${created.phone || 'No phone'}) — ${created.followUpType} on ${new Date(created.followUpDate).toLocaleDateString('en-IN')} at ${created.followUpTime || ''}`,
            relatedModel: 'FollowUp',
            relatedId: created._id.toString(),
            link: '/admin/followups',
            recipientEmployee: created.assignedEmployee || null,
            metadata: {
              customerName: created.customerName,
              customerPhone: created.phone,
              referenceId: created.followUpId,
              followUpDate: created.followUpDate,
              followUpTime: created.followUpTime,
              followUpType: created.followUpType,
              assignedEmployeeName: created.assignedEmployeeName
            },
            scheduledFor: created.followUpDate
          });
        }

        await logActivity({
          entityType: 'FollowUp',
          entityId: created._id.toString(),
          entityRef: created.followUpId,
          module: 'FollowUps',
          action: 'CREATE',
          description: `Follow-up ${created.followUpId} scheduled for ${created.customerName}`,
          newValues: { followUpDate: created.followUpDate, followUpType: created.followUpType, assignedEmployeeName: created.assignedEmployeeName },
          user: req.user
        });
        return res.status(201).json({ success: true, data: created });
      }

      if (payload.assignedEmployee) {
        const emp = store.employees.find((e) => e.id === payload.assignedEmployee);
        if (emp) payload.assignedEmployeeName = emp.name;
      }
      const created = {
        ...payload,
        id: `flw-${Date.now()}`,
        followUpDate: payload.followUpDate.toISOString(),
        createdAt: new Date().toISOString()
      };
      store.followUps.unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

const updateFollowUp = async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (update.status === 'Completed' && !update.completedAt) update.completedAt = new Date();
    if (update.followUpDate) update.followUpDate = new Date(update.followUpDate);

    if (isMongoConnected()) {
      const existing = await FollowUp.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Follow-up not found' });
      const perms = req.user?.permissions || [];
      if (!perms.includes('*') && !perms.includes('followups.viewAll')) {
        const teamIds = perms.includes('employees.viewTeam') || req.user.role === 'Manager'
          ? await getAccessibleEmployeeIds(req.user)
          : req.user.employeeObjectId
          ? [req.user.employeeObjectId]
          : [];
        const allowedSet = teamIds.map((id) => id.toString());
        if (!existing.assignedEmployee || !allowedSet.includes(existing.assignedEmployee.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: follow-up is not assigned to you.' });
        }
      }
      const previousDate = existing.followUpDate;
      const previousTime = existing.followUpTime;
      const previousStatus = existing.status;

      const dateChanged =
        update.followUpDate &&
        new Date(update.followUpDate).toISOString().slice(0, 10) !==
          new Date(previousDate).toISOString().slice(0, 10);
      const timeChanged = update.followUpTime !== undefined && update.followUpTime !== previousTime;

      if (dateChanged || timeChanged) {
        existing.rescheduleHistory = existing.rescheduleHistory || [];
        existing.rescheduleHistory.push({
          previousDate,
          previousTime,
          newDate: update.followUpDate || previousDate,
          newTime: update.followUpTime ?? previousTime,
          rescheduledBy: req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null,
          rescheduledByName: req.user?.name || 'System',
          reason: req.body.rescheduleReason || update.notes || 'Rescheduled',
          timestamp: new Date()
        });
        update.rescheduleHistory = existing.rescheduleHistory;
      }

      if (update.assignedEmployee && mongoose.Types.ObjectId.isValid(update.assignedEmployee)) {
        const emp = await Employee.findById(update.assignedEmployee);
        if (emp) update.assignedEmployeeName = emp.name;
      }

      const updated = await FollowUp.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Follow-up not found' });

      // Cancel prior scheduled notifications if cancelled or rescheduled
      if (updated.status === 'Cancelled' || dateChanged || timeChanged) {
        await Notification.updateMany(
          { relatedModel: 'FollowUp', relatedId: updated._id.toString(), isCancelled: { $ne: true } },
          { $set: { isCancelled: true } }
        );
      }

      if ((dateChanged || timeChanged) && updated.status !== 'Cancelled') {
        await createNotification({
          type: 'Follow-up Rescheduled',
          title: `Follow-up ${updated.followUpId} Rescheduled`,
          message: `${updated.customerName} (${updated.phone || ''}) moved from ${new Date(previousDate).toLocaleDateString('en-IN')} to ${new Date(updated.followUpDate).toLocaleDateString('en-IN')} (${updated.followUpTime})`,
          relatedModel: 'FollowUp',
          relatedId: updated._id.toString(),
          link: '/admin/followups',
          recipientEmployee: updated.assignedEmployee || null,
          scheduledFor: updated.followUpDate,
          metadata: {
            customerName: updated.customerName,
            customerPhone: updated.phone,
            referenceId: updated.followUpId,
            followUpDate: updated.followUpDate,
            followUpTime: updated.followUpTime,
            followUpType: updated.followUpType,
            assignedEmployeeName: updated.assignedEmployeeName
          }
        });
      }

      // Auto-schedule Next Follow-up if nextFollowUpDate provided upon update/completion
      if (update.nextFollowUpDate && !Number.isNaN(new Date(update.nextFollowUpDate).getTime())) {
        const nextFollowUpId = await nextSequenceId('TPS-FLW');
        const nextDoc = await FollowUp.create({
          followUpId: nextFollowUpId,
          category: updated.category,
          relatedModel: updated.relatedModel,
          relatedId: updated.relatedId,
          relatedRef: updated.relatedRef,
          customer: updated.customer,
          customerName: updated.customerName,
          phone: updated.phone,
          assignedEmployee: updated.assignedEmployee,
          assignedEmployeeName: updated.assignedEmployeeName,
          followUpDate: new Date(update.nextFollowUpDate),
          followUpType: update.nextFollowUpType || updated.followUpType || 'Call',
          contactPerson: updated.contactPerson || '',
          notes: `Scheduled from ${updated.followUpId}`,
          createdBy: req.user?.id || null,
          createdByName: req.user?.name || '',
          status: 'Upcoming'
        });
        await createNotification({
          type: 'Follow-up Due',
          title: `Next Follow-up ${nextFollowUpId} Scheduled`,
          message: `${nextDoc.customerName} (${nextDoc.phone || ''}) — ${nextDoc.followUpType} on ${new Date(nextDoc.followUpDate).toLocaleDateString('en-IN')}`,
          relatedModel: 'FollowUp',
          relatedId: nextDoc._id.toString(),
          link: '/admin/followups',
          recipientEmployee: nextDoc.assignedEmployee || null,
          scheduledFor: nextDoc.followUpDate
        });
      }

      await logActivity({
        entityType: 'FollowUp',
        entityId: updated._id.toString(),
        entityRef: updated.followUpId,
        module: 'FollowUps',
        action: dateChanged || timeChanged ? 'RESCHEDULE' : 'UPDATE',
        description: `${dateChanged || timeChanged ? 'Rescheduled' : 'Updated'} follow-up ${updated.followUpId}`,
        previousValues: { followUpDate: previousDate, followUpTime: previousTime, status: previousStatus },
        newValues: { followUpDate: updated.followUpDate, followUpTime: updated.followUpTime, status: updated.status },
        user: req.user
      });
      return res.json({ success: true, data: updated });
    }

    const idx = store.followUps.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Follow-up not found' });
    store.followUps[idx] = { ...store.followUps[idx], ...update, updatedAt: new Date().toISOString() };
    res.json({ success: true, data: store.followUps[idx] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

router.put('/:id', authMiddleware, requirePermission('followUps:edit'), updateFollowUp);
router.patch('/:id', authMiddleware, requirePermission('followUps:edit'), updateFollowUp);

router.delete('/:id', authMiddleware, requirePermission('followUps:delete'), async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await FollowUp.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Follow-up not found' });
      return res.json({ success: true, message: 'Follow-up deleted' });
    }
    const idx = store.followUps.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Follow-up not found' });
    store.followUps.splice(idx, 1);
    res.json({ success: true, message: 'Follow-up deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
