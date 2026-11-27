import express from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';
import Payslip from '../models/Payslip.js';
import Expense from '../models/Expense.js';
import ExpenseCategory from '../models/ExpenseCategory.js';
import ExpenseApproval from '../models/ExpenseApproval.js';
import ExpensePayment from '../models/ExpensePayment.js';
import CompanySetting from '../models/CompanySetting.js';
import Employee from '../models/Employee.js';
import Lead from '../models/Lead.js';
import FollowUp from '../models/FollowUp.js';
import Notification from '../models/Notification.js';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import ServiceBooking from '../models/ServiceBooking.js';
import ServiceRecord from '../models/ServiceRecord.js';
import { isMongoConnected } from '../config/db.js';
import { getFeatureFlags, requireHrFeatureEnabled } from '../config/featureFlags.js';
import {
  authorize,
  authorizeAny,
  authMiddleware,
  getAccessibleEmployeeIds,
  validateRequest
} from '../middleware/auth.js';
import { uploadReceiptOrMedia } from '../middleware/upload.js';
import { buildDateRangeFilter, escapeRegex, logActivity, parsePagination } from '../utils/crmHelpers.js';
import { nextSequenceId } from '../utils/sequence.js';

const router = express.Router();

const DEFAULT_EXPENSE_CATEGORIES = [
  'Fuel',
  'Travel',
  'Food',
  'Accommodation',
  'Office Expenses',
  'Electricity',
  'Internet',
  'Telephone',
  'Equipment',
  'Spare Parts',
  'Vehicle Maintenance',
  'Pump Service Expenses',
  'Employee Reimbursement',
  'Marketing',
  'Miscellaneous'
];

const ensureDefaultExpenseCategories = async () => {
  const existingCount = await ExpenseCategory.countDocuments({});
  if (existingCount >= DEFAULT_EXPENSE_CATEGORIES.length) return;
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await ExpenseCategory.updateOne(
      { name },
      { $setOnInsert: { name, slug, isDefault: true, status: 'Active' } },
      { upsert: true }
    );
  }
};

const requireHr = requireHrFeatureEnabled(CompanySetting);

const requireMongo = (res) => {
  if (!isMongoConnected()) {
    res.status(503).json({ success: false, message: 'MongoDB database connection is required.' });
    return false;
  }
  return true;
};

const getTodayStr = () => new Date().toISOString().slice(0, 10);
const getCurrentMonthPrefix = () => new Date().toISOString().slice(0, 7);

// ==================== EMPLOYEE PORTAL HOME DASHBOARD ====================
router.get('/employee-dashboard', authMiddleware, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const empIdObj = req.user.employeeObjectId;
    const today = getTodayStr();
    const monthPrefix = getCurrentMonthPrefix();
    const featureFlags = await getFeatureFlags(CompanySetting);
    const hrEnabled = Boolean(featureFlags.hrManagementEnabled);

    const [todayAtt, monthAtt, pendingExpenses, recentNotifications, bookings, enquiries, followUps, recentLeads] =
      await Promise.all([
        hrEnabled && empIdObj ? Attendance.findOne({ employee: empIdObj, date: today }) : null,
        hrEnabled && empIdObj ? Attendance.find({ employee: empIdObj, date: new RegExp(`^${monthPrefix}`) }) : [],
        empIdObj
          ? Expense.find({
              employee: empIdObj,
              approvalStatus: { $in: ['Submitted', 'Pending Approval', 'Pending'] }
            })
              .sort({ createdAt: -1 })
              .limit(10)
          : [],
        Notification.find({ isCancelled: { $ne: true } }).sort({ createdAt: -1 }).limit(10),
        empIdObj
          ? ServiceBooking.find({ assignedTechnician: empIdObj, status: { $nin: ['Cancelled'] } })
              .sort({ appointmentDate: 1 })
              .limit(10)
          : [],
        empIdObj
          ? ServiceEnquiry.find({ assignedTechnician: empIdObj, status: { $nin: ['Completed', 'Cancelled'] } })
              .sort({ createdAt: -1 })
              .limit(10)
          : [],
        empIdObj
          ? FollowUp.find({ assignedEmployee: empIdObj, status: { $in: ['Upcoming', 'Pending'] } })
              .sort({ followUpDate: 1 })
              .limit(10)
          : [],
        empIdObj ? Lead.find({ assignedEmployee: empIdObj }).sort({ createdAt: -1 }).limit(10) : []
      ]);

    const presentDays = hrEnabled ? monthAtt.filter((a) => ['Present', 'Checked In'].includes(a.status)).length : 0;
    const halfDays = hrEnabled ? monthAtt.filter((a) => a.status === 'Half Day').length : 0;
    const leaveDays = hrEnabled ? monthAtt.filter((a) => a.status === 'On Leave').length : 0;
    const absentDays = hrEnabled ? monthAtt.filter((a) => a.status === 'Absent').length : 0;

    res.json({
      success: true,
      data: {
        featureFlags,
        profile: {
          name: req.user.name,
          employeeId: req.user.employeeId,
          designation: req.user.designation,
          department: req.user.department,
          role: req.user.role
        },
        ...(hrEnabled
          ? {
              attendance: {
                today: todayAtt,
                monthlySummary: { presentDays, halfDays, leaveDays, absentDays, totalLogged: monthAtt.length }
              }
            }
          : {}),
        pendingExpensesCount: pendingExpenses.length,
        pendingExpensesTotal: pendingExpenses.reduce((s, e) => s + Number(e.totalAmount || e.amount || 0), 0),
        assignedServices: bookings,
        assignedEnquiries: enquiries,
        assignedFollowUps: followUps,
        assignedLeads: recentLeads,
        recentNotifications
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== EMPLOYEE MY SERVICES ====================
router.get('/my-services', authMiddleware, authorizeAny('services.viewAssigned', 'services.viewAll'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const empIdObj = req.user.employeeObjectId;
    const perms = req.user.permissions || [];
    const canViewAll = perms.includes('*') || perms.includes('services.viewAll');
    const filter = canViewAll ? {} : { assignedTechnician: empIdObj || '__none__' };
    if (!canViewAll && !empIdObj) {
      return res.json({ success: true, data: { bookings: [], enquiries: [] } });
    }

    const [bookings, enquiries] = await Promise.all([
      ServiceBooking.find(filter).sort({ appointmentDate: -1 }).limit(100),
      ServiceEnquiry.find(filter).sort({ createdAt: -1 }).limit(100)
    ]);
    res.json({ success: true, data: { bookings, enquiries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch(
  '/my-services/:id/progress',
  authMiddleware,
  authorize('services.updateStatus'),
  uploadReceiptOrMedia.single('serviceImage'),
  async (req, res) => {
    try {
      if (!requireMongo(res)) return;
      const { kind = 'booking', status, notes, workPerformed } = req.body;
      const perms = req.user.permissions || [];
      const canModifyAll = perms.includes('*') || perms.includes('services.viewAll') || perms.includes('services.assign');

      if (kind === 'enquiry') {
        const enq = await ServiceEnquiry.findById(req.params.id);
        if (!enq) return res.status(404).json({ success: false, message: 'Service enquiry not found' });
        if (!canModifyAll && enq.assignedTechnician?.toString() !== req.user.employeeObjectId) {
          return res.status(403).json({ success: false, message: 'You can only update services assigned to you.' });
        }
        if (status) enq.status = status;
        if (notes) {
          enq.notesList.push({ text: notes, addedBy: req.user.name, createdAt: new Date() });
          enq.internalNotes = notes;
        }
        if (req.file) {
          enq.productImageUrl = `/uploads/${req.file.filename}`;
        }
        await enq.save();
        await logActivity({
          entityType: 'ServiceEnquiry',
          entityId: enq._id.toString(),
          entityRef: enq.enquiryId,
          module: 'Services',
          action: 'SERVICE_PROGRESS',
          description: `${req.user.name} updated service enquiry ${enq.enquiryId}${status ? ` -> ${status}` : ''}`,
          user: req.user
        });
        return res.json({ success: true, data: enq });
      }

      const bkg = await ServiceBooking.findById(req.params.id);
      if (!bkg) return res.status(404).json({ success: false, message: 'Service booking not found' });
      if (!canModifyAll && bkg.assignedTechnician?.toString() !== req.user.employeeObjectId) {
        return res.status(403).json({ success: false, message: 'You can only update service bookings assigned to you.' });
      }

      if (status) bkg.status = status;
      if (notes) bkg.notes = bkg.notes ? `${bkg.notes}\n[${req.user.name}]: ${notes}` : `[${req.user.name}]: ${notes}`;
      await bkg.save();

      if (status === 'Completed' && workPerformed) {
        const serviceId = await nextSequenceId('TPS-REC');
        await ServiceRecord.create({
          serviceId,
          booking: bkg._id,
          bookingId: bkg.bookingId,
          customer: bkg.customer,
          customerName: bkg.customerName,
          phone: bkg.phone,
          productName: bkg.product || '',
          brand: bkg.brand || '',
          model: bkg.productModel || '',
          technician: bkg.assignedTechnician,
          technicianName: bkg.assignedTechnicianName || req.user.name,
          serviceDate: new Date(),
          workPerformed,
          totalCharges: Number(bkg.estimatedCharges || 0),
          paymentStatus: 'Pending',
          technicianRemarks: notes || ''
        });
      }

      await logActivity({
        entityType: 'ServiceBooking',
        entityId: bkg._id.toString(),
        entityRef: bkg.bookingId,
        module: 'Services',
        action: 'SERVICE_PROGRESS',
        description: `${req.user.name} updated booking ${bkg.bookingId}${status ? ` -> ${status}` : ''}`,
        user: req.user
      });

      res.json({ success: true, data: bkg });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ==================== ATTENDANCE (Feature-flagged per Phase 14) ====================
router.get('/attendance/today', authMiddleware, requireHr, authorizeAny('attendance.viewOwn', 'attendance.viewTeam', 'attendance.viewAll'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (!req.user.employeeObjectId) return res.json({ success: true, data: { today: null, summary: {} } });
    const today = getTodayStr();
    const monthPrefix = req.query.month || getCurrentMonthPrefix();
    const [todayRec, monthRecs] = await Promise.all([
      Attendance.findOne({ employee: req.user.employeeObjectId, date: today }),
      Attendance.find({ employee: req.user.employeeObjectId, date: new RegExp(`^${monthPrefix}`) }).sort({ date: -1 })
    ]);

    res.json({
      success: true,
      data: {
        today: todayRec,
        history: monthRecs,
        summary: {
          presentDays: monthRecs.filter((r) => ['Present', 'Checked In'].includes(r.status)).length,
          halfDays: monthRecs.filter((r) => r.status === 'Half Day').length,
          leaveDays: monthRecs.filter((r) => r.status === 'On Leave').length,
          absentDays: monthRecs.filter((r) => r.status === 'Absent').length,
          totalHours: Number(monthRecs.reduce((s, r) => s + Number(r.workingHours || 0), 0).toFixed(2))
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/attendance/check-in', authMiddleware, requireHr, authorizeAny('attendance.viewOwn', 'portal.access'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (!req.user.employeeObjectId) {
      return res.status(400).json({ success: false, message: 'No employee profile linked to this account.' });
    }
    const today = getTodayStr();
    const existing = await Attendance.findOne({ employee: req.user.employeeObjectId, date: today });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Check-in already recorded for today.',
        data: existing
      });
    }

    const now = new Date();
    const created = await Attendance.create({
      employee: req.user.employeeObjectId,
      employeeId: req.user.employeeId,
      employeeName: req.user.name,
      date: today,
      checkIn: now,
      status: 'Checked In',
      location: req.body.location || '',
      notes: req.body.notes || ''
    });

    await logActivity({
      entityType: 'Attendance',
      entityId: created._id.toString(),
      entityRef: today,
      module: 'Attendance',
      action: 'CHECK_IN',
      description: `${req.user.name} checked in for ${today}`,
      user: req.user
    });

    res.status(201).json({ success: true, data: created, message: 'Checked in successfully.' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Check-in already recorded for today.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/attendance/check-out', authMiddleware, requireHr, authorizeAny('attendance.viewOwn', 'portal.access'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (!req.user.employeeObjectId) {
      return res.status(400).json({ success: false, message: 'No employee profile linked to this account.' });
    }
    const today = getTodayStr();
    const rec = await Attendance.findOne({ employee: req.user.employeeObjectId, date: today });
    if (!rec) {
      return res.status(404).json({ success: false, message: 'You have not checked in yet today.' });
    }
    if (rec.checkOut) {
      return res.status(409).json({ success: false, message: 'Check-out already recorded for today.' });
    }

    const now = new Date();
    const hours = Math.max(0, (now.getTime() - new Date(rec.checkIn).getTime()) / 3600000);
    rec.checkOut = now;
    rec.workingHours = Number(hours.toFixed(2));
    rec.status = hours >= 4 ? 'Present' : 'Half Day';
    if (req.body.notes) rec.notes = req.body.notes;
    await rec.save();

    await logActivity({
      entityType: 'Attendance',
      entityId: rec._id.toString(),
      entityRef: today,
      module: 'Attendance',
      action: 'CHECK_OUT',
      description: `${req.user.name} checked out (${rec.workingHours} hrs)`,
      user: req.user
    });

    res.json({ success: true, data: rec, message: `Checked out (${rec.workingHours} hrs logged).` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/attendance', authMiddleware, requireHr, authorizeAny('attendance.viewOwn', 'attendance.viewTeam', 'attendance.viewAll'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { month, employeeId } = req.query;
    const { page, limit, skip } = parsePagination(req.query, ['date'], 'date');
    const perms = req.user.permissions || [];
    const query = {};
    if (month) query.date = new RegExp(`^${month}`);

    if (perms.includes('*') || perms.includes('attendance.viewAll')) {
      if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) query.employee = employeeId;
    } else if (perms.includes('attendance.viewTeam')) {
      const teamIds = await getAccessibleEmployeeIds(req.user);
      if (employeeId && !teamIds.includes(employeeId)) {
        return res.status(403).json({ success: false, message: 'You cannot view attendance outside your team.' });
      }
      query.employee = employeeId ? employeeId : { $in: teamIds };
    } else {
      if (employeeId && employeeId !== req.user.employeeObjectId) {
        return res.status(403).json({ success: false, message: 'You can only view your own attendance records.' });
      }
      query.employee = req.user.employeeObjectId || '__none__';
    }

    const [data, total] = await Promise.all([
      Attendance.find(query).sort({ date: -1 }).skip(skip).limit(limit),
      Attendance.countDocuments(query)
    ]);
    res.json({ success: true, data, pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SALARY & PAYROLL (Feature-flagged per Phase 14) ====================
router.get('/salary/me', authMiddleware, requireHr, authorize('payroll.viewOwn'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const emp = req.user.employeeObjectId ? await Employee.findById(req.user.employeeObjectId) : null;
    if (!emp) return res.json({ success: true, data: { structure: null, history: [] } });

    const payrollHistory = await Payroll.find({ employee: emp._id }).sort({ payPeriod: -1 }).limit(12);
    const ref = emp.salaryReference || {};
    const basicSalary = Number(ref.basicSalary || emp.salary || 0);
    const allowances = Number(ref.allowances || 0);
    const incentives = Number(ref.incentives || 0);
    const deductions = Number(ref.deductions || 0);
    const latest = payrollHistory[0];

    res.json({
      success: true,
      data: {
        employeeId: emp.employeeId,
        name: emp.name,
        designation: emp.designation || emp.role,
        department: emp.department,
        currentMonth: {
          payPeriod: latest?.payPeriod || getCurrentMonthPrefix(),
          basicSalary: latest?.basicSalary ?? basicSalary,
          allowances: latest?.allowances ?? allowances,
          incentives: latest?.incentives ?? incentives,
          deductions: latest?.deductions ?? deductions,
          netSalary: latest?.netSalary ?? Math.max(0, basicSalary + allowances + incentives - deductions),
          paymentStatus: latest?.paymentStatus || 'Pending'
        },
        history: payrollHistory
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/payroll', authMiddleware, requireHr, authorizeAny('payroll.viewAll', 'payroll.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { payPeriod, paymentStatus } = req.query;
    const query = {};
    if (payPeriod && payPeriod !== 'All') query.payPeriod = payPeriod;
    if (paymentStatus && paymentStatus !== 'All') query.paymentStatus = paymentStatus;
    const data = await Payroll.find(query).sort({ payPeriod: -1, employeeName: 1 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/payroll',
  authMiddleware,
  requireHr,
  authorize('payroll.manage'),
  [
    body('employee').notEmpty().withMessage('Employee is required'),
    body('payPeriod').matches(/^\d{4}-\d{2}$/).withMessage('Pay period must be in YYYY-MM format')
  ],
  validateRequest,
  async (req, res) => {
    try {
      if (!requireMongo(res)) return;
      const emp = await Employee.findById(req.body.employee);
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

      const basicSalary = Number(req.body.basicSalary ?? emp.salary ?? 0);
      const allowances = Number(req.body.allowances || 0);
      const incentives = Number(req.body.incentives || 0);
      const deductions = Number(req.body.deductions || 0);
      const netSalary = Math.max(0, basicSalary + allowances + incentives - deductions);

      const payroll = await Payroll.findOneAndUpdate(
        { employee: emp._id, payPeriod: req.body.payPeriod },
        {
          employee: emp._id,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          designation: emp.designation || emp.role,
          department: emp.department,
          payPeriod: req.body.payPeriod,
          basicSalary,
          allowances,
          incentives,
          deductions,
          netSalary,
          paymentStatus: req.body.paymentStatus || 'Pending',
          paymentDate: req.body.paymentStatus === 'Paid' ? new Date() : null,
          paymentReference: req.body.paymentReference || '',
          notes: req.body.notes || '',
          generatedBy: req.user.id
        },
        { upsert: true, new: true }
      );

      // Update salary reference structure on employee safely
      await Employee.updateOne(
        { _id: emp._id },
        {
          $set: {
            salary: netSalary,
            salaryReference: { basicSalary, allowances, incentives, deductions }
          }
        }
      );

      await logActivity({
        entityType: 'Payroll',
        entityId: payroll._id.toString(),
        entityRef: `${emp.employeeId} (${req.body.payPeriod})`,
        module: 'Payroll',
        action: 'PAYROLL_UPSERT',
        description: `Saved payroll for ${emp.name} (${req.body.payPeriod}) — Net ₹${netSalary}`,
        user: req.user
      });

      res.status(201).json({ success: true, data: payroll });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ==================== PAYSLIPS (Feature-flagged per Phase 14) ====================
router.get('/payslips', authMiddleware, requireHr, authorizeAny('payslips.viewOwn', 'payroll.viewAll'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const perms = req.user.permissions || [];
    const canViewAll = perms.includes('*') || perms.includes('payroll.viewAll');
    const query = canViewAll ? {} : { employee: req.user.employeeObjectId || '__none__' };
    const list = await Payslip.find(query).sort({ payPeriod: -1, createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/payslips/:id', authMiddleware, requireHr, authorizeAny('payslips.viewOwn', 'payroll.viewAll'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ success: false, message: 'Payslip not found' });

    const perms = req.user.permissions || [];
    const canViewAll = perms.includes('*') || perms.includes('payroll.viewAll');
    if (!canViewAll && payslip.employee?.toString() !== req.user.employeeObjectId) {
      return res.status(403).json({ success: false, message: 'You cannot access another employee\'s payslip.' });
    }

    res.json({ success: true, data: payslip });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/payslips/generate', authMiddleware, requireHr, authorize('payslips.generate'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { payrollId } = req.body;
    const payroll = await Payroll.findById(payrollId);
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll record not found' });

    let existing = await Payslip.findOne({ payroll: payroll._id });
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Payslip already generated for this pay period.' });
    }

    const payslipId = await nextSequenceId('TPS-PSL');
    const payslip = await Payslip.create({
      payslipId,
      employee: payroll.employee,
      employeeId: payroll.employeeId,
      employeeName: payroll.employeeName,
      designation: payroll.designation,
      department: payroll.department,
      payroll: payroll._id,
      payPeriod: payroll.payPeriod,
      snapshot: {
        basicSalary: payroll.basicSalary,
        allowances: payroll.allowances,
        incentives: payroll.incentives,
        deductions: payroll.deductions,
        netSalary: payroll.netSalary,
        paymentStatus: payroll.paymentStatus,
        paymentDate: payroll.paymentDate || new Date(),
        paymentReference: payroll.paymentReference || ''
      },
      generatedBy: req.user.id,
      generatedByName: req.user.name
    });

    await Notification.create({
      type: 'Payslip Available',
      title: `Payslip Ready — ${payroll.payPeriod}`,
      message: `${payroll.employeeName}: Payslip ${payslipId} has been generated.`,
      relatedModel: 'Payslip',
      relatedId: payslipId,
      link: '/employee/payslips'
    });

    await logActivity({
      entityType: 'Payslip',
      entityId: payslip._id.toString(),
      entityRef: payslipId,
      module: 'Payroll',
      action: 'PAYSLIP_GENERATE',
      description: `Generated payslip ${payslipId} for ${payroll.employeeName} (${payroll.payPeriod})`,
      user: req.user
    });

    res.status(201).json({ success: true, data: payslip });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==================== EXPENSE CATEGORIES (Super Admin Managed) ====================
router.get('/expense-categories', authMiddleware, async (_req, res) => {
  try {
    if (!requireMongo(res)) return;
    await ensureDefaultExpenseCategories();
    const list = await ExpenseCategory.find({}).sort({ name: 1 });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/expense-categories',
  authMiddleware,
  [body('name').trim().notEmpty().withMessage('Category name is required')],
  validateRequest,
  async (req, res) => {
    try {
      if (!requireMongo(res)) return;
      if (req.user.role !== 'Super Admin') {
        return res.status(403).json({ success: false, message: 'Only Super Admin can create or modify expense categories.' });
      }
      const name = req.body.name.trim();
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const existing = await ExpenseCategory.findOne({ $or: [{ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }, { slug }] });
      if (existing) {
        return res.status(409).json({ success: false, message: `Expense category "${existing.name}" already exists.` });
      }
      const created = await ExpenseCategory.create({
        name,
        slug,
        description: req.body.description || '',
        status: req.body.status || 'Active'
      });
      await logActivity({
        entityType: 'ExpenseCategory',
        entityId: created._id.toString(),
        module: 'Expenses',
        action: 'CATEGORY_CREATE',
        description: `Created expense category "${created.name}"`,
        user: req.user
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put('/expense-categories/:id', authMiddleware, async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can modify expense categories.' });
    }
    const existing = await ExpenseCategory.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found' });
    const prev = { name: existing.name, status: existing.status, description: existing.description };
    if (req.body.name) {
      existing.name = req.body.name.trim();
      existing.slug = existing.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    if (req.body.description !== undefined) existing.description = req.body.description;
    if (req.body.status) existing.status = req.body.status;
    await existing.save();
    await logActivity({
      entityType: 'ExpenseCategory',
      entityId: existing._id.toString(),
      module: 'Expenses',
      action: 'CATEGORY_UPDATE',
      description: `Updated expense category "${existing.name}"`,
      previousValues: prev,
      newValues: { name: existing.name, status: existing.status, description: existing.description },
      user: req.user
    });
    res.json({ success: true, data: existing });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==================== EXPENSES TRACKER (PHASE 13) ====================
const buildExpenseScopeFilter = async (user, { status, category, employeeId, paymentMethod, startDate, endDate, search } = {}) => {
  const perms = user.permissions || [];
  const query = {};
  if (status && status !== 'All') {
    if (status === 'Pending') {
      query.approvalStatus = { $in: ['Submitted', 'Pending Approval', 'Pending'] };
    } else {
      query.approvalStatus = status;
    }
  }
  if (category && category !== 'All') query.category = category;
  if (paymentMethod && paymentMethod !== 'All') query.paymentMethod = paymentMethod;

  if (perms.includes('*') || perms.includes('expenses.viewAll') || perms.includes('financials.view')) {
    if (employeeId && employeeId !== 'All' && mongoose.Types.ObjectId.isValid(employeeId)) {
      query.employee = employeeId;
    }
  } else if (perms.includes('expenses.viewTeam')) {
    const teamIds = await getAccessibleEmployeeIds(user);
    query.employee =
      employeeId && employeeId !== 'All' && teamIds.includes(employeeId) ? employeeId : { $in: teamIds };
  } else {
    query.employee = user.employeeObjectId || '__none__';
  }

  const dateFilter = buildDateRangeFilter(startDate, endDate, 'expenseDate');
  if (dateFilter) Object.assign(query, dateFilter);

  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    query.$or = [
      { expenseId: rx },
      { title: rx },
      { description: rx },
      { vendorPayee: rx },
      { referenceNumber: rx },
      { employeeName: rx },
      { category: rx }
    ];
  }
  return query;
};

router.get('/expense-dashboard', authMiddleware, authorizeAny('expenses.viewOwn', 'expenses.viewTeam', 'expenses.viewAll', 'financials.view'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    await ensureDefaultExpenseCategories();
    const { startDate, endDate, category, employeeId } = req.query;
    const query = await buildExpenseScopeFilter(req.user, { category, employeeId, startDate, endDate });
    const all = await Expense.find(query).sort({ expenseDate: -1 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const getTotal = (e) => Number(e.totalAmount || e.amount || 0);

    const nonDraft = all.filter((e) => e.approvalStatus !== 'Draft');
    const totalExpenses = nonDraft.reduce((s, e) => s + getTotal(e), 0);
    const thisMonthExpenses = nonDraft
      .filter((e) => new Date(e.expenseDate || e.createdAt) >= monthStart)
      .reduce((s, e) => s + getTotal(e), 0);
    const pendingList = all.filter((e) => ['Submitted', 'Pending Approval', 'Pending'].includes(e.approvalStatus));
    const approvedList = all.filter((e) => e.approvalStatus === 'Approved');
    const rejectedList = all.filter((e) => e.approvalStatus === 'Rejected');
    const paidList = all.filter((e) => e.approvalStatus === 'Paid');

    const outstandingReimbursements = approvedList.reduce((s, e) => s + getTotal(e), 0);

    const monthlyMap = {};
    const categoryMap = {};
    const employeeMap = {};

    nonDraft.forEach((e) => {
      const amt = getTotal(e);
      const d = new Date(e.expenseDate || e.createdAt);
      if (!Number.isNaN(d.getTime())) {
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mLabel = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
        if (!monthlyMap[mKey]) monthlyMap[mKey] = { monthKey: mKey, month: mLabel, total: 0, paid: 0, count: 0 };
        monthlyMap[mKey].total += amt;
        if (e.approvalStatus === 'Paid') monthlyMap[mKey].paid += amt;
        monthlyMap[mKey].count += 1;
      }

      const catKey = e.category || 'Miscellaneous';
      if (!categoryMap[catKey]) categoryMap[catKey] = { category: catKey, total: 0, count: 0 };
      categoryMap[catKey].total += amt;
      categoryMap[catKey].count += 1;

      const empKey = e.employeeName || e.employeeId || 'Unknown';
      if (!employeeMap[empKey]) employeeMap[empKey] = { employeeName: empKey, employeeId: e.employeeId, total: 0, paid: 0, pending: 0, count: 0 };
      employeeMap[empKey].total += amt;
      if (e.approvalStatus === 'Paid') employeeMap[empKey].paid += amt;
      if (['Submitted', 'Pending Approval', 'Pending', 'Approved'].includes(e.approvalStatus)) employeeMap[empKey].pending += amt;
      employeeMap[empKey].count += 1;
    });

    res.json({
      success: true,
      data: {
        kpis: {
          totalExpenses,
          thisMonthExpenses,
          pendingApprovalsCount: pendingList.length,
          pendingApprovalsAmount: pendingList.reduce((s, e) => s + getTotal(e), 0),
          approvedCount: approvedList.length,
          approvedAmount: outstandingReimbursements,
          rejectedCount: rejectedList.length,
          rejectedAmount: rejectedList.reduce((s, e) => s + getTotal(e), 0),
          paidCount: paidList.length,
          paidAmount: paidList.reduce((s, e) => s + getTotal(e), 0),
          outstandingReimbursements
        },
        monthlyReport: Object.values(monthlyMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
        categoryReport: Object.values(categoryMap).sort((a, b) => b.total - a.total),
        employeeReport: Object.values(employeeMap).sort((a, b) => b.total - a.total)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/expenses', authMiddleware, authorizeAny('expenses.viewOwn', 'expenses.viewTeam', 'expenses.viewAll', 'financials.view'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const query = await buildExpenseScopeFilter(req.user, req.query);
    const list = await Expense.find(query).sort({ expenseDate: -1, createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/expenses/:id/history', authMiddleware, authorizeAny('expenses.viewOwn', 'expenses.viewTeam', 'expenses.viewAll', 'financials.view'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const exp = await Expense.findById(req.params.id);
    if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });
    const perms = req.user.permissions || [];
    if (!perms.includes('*') && !perms.includes('expenses.viewAll') && !perms.includes('financials.view')) {
      const teamIds = perms.includes('expenses.viewTeam')
        ? await getAccessibleEmployeeIds(req.user)
        : [req.user.employeeObjectId];
      if (!teamIds.map(String).includes(String(exp.employee))) {
        return res.status(403).json({ success: false, message: 'Access denied to this expense history.' });
      }
    }
    const [approvals, payments] = await Promise.all([
      ExpenseApproval.find({ expense: exp._id }).sort({ createdAt: -1 }),
      ExpensePayment.find({ expense: exp._id }).sort({ paymentDate: -1 })
    ]);
    res.json({ success: true, data: { expense: exp, auditHistory: exp.auditHistory || [], approvals, payments } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/expenses',
  authMiddleware,
  authorize('expenses.createOwn'),
  uploadReceiptOrMedia.single('receipt'),
  [
    body('description').trim().notEmpty().withMessage('Description is required')
  ],
  validateRequest,
  async (req, res) => {
    try {
      if (!requireMongo(res)) return;
      if (!req.user.employeeObjectId) {
        return res.status(400).json({ success: false, message: 'No employee record linked to your account.' });
      }
      await ensureDefaultExpenseCategories();

      const expenseType = ['Petrol', 'Service Cost', 'Other'].includes(req.body.expenseType)
        ? req.body.expenseType
        : 'Other';
      const km = Math.max(0, Number(req.body.kilometresTravelled || 0));
      const actualServiceCost = Math.max(0, Number(req.body.actualServiceCost || 0));
      let ratePerKmApplied = 0;
      let amount = Number(req.body.amount || 0);

      if (expenseType === 'Petrol' || km > 0) {
        if (km <= 0 && amount <= 0) {
          return res.status(400).json({ success: false, message: 'Kilometres travelled must be greater than zero for petrol claims.' });
        }
        if (km > 0) {
          const settings = await CompanySetting.findOne({ key: 'default' }).select('petrolRatePerKm');
          ratePerKmApplied = Number(settings?.petrolRatePerKm ?? 5);
          amount = Number((km * ratePerKmApplied).toFixed(2));
        }
      } else if (expenseType === 'Service Cost' && actualServiceCost > 0 && amount <= 0) {
        amount = actualServiceCost;
      }

      if (!(amount > 0)) {
        return res.status(400).json({ success: false, message: 'Expense amount must be greater than zero.' });
      }

      const gstAmount = Math.max(0, Number(req.body.gstAmount || 0));
      const totalAmount = Number((amount + gstAmount).toFixed(2));
      const categoryName = (req.body.category || (expenseType === 'Petrol' ? 'Fuel' : 'Travel')).trim();
      const catDoc = await ExpenseCategory.findOne({ name: new RegExp(`^${escapeRegex(categoryName)}$`, 'i') });
      const requestedStatus = req.body.approvalStatus === 'Draft' ? 'Draft' : 'Pending Approval';

      const expenseId = await nextSequenceId('TPS-EXP');
      const created = await Expense.create({
        expenseId,
        title: (req.body.title || `${categoryName} Claim`).trim(),
        employee: req.user.employeeObjectId,
        submittedBy: req.user.id,
        employeeId: req.user.employeeId,
        employeeName: req.user.name,
        department: req.body.department || req.user.department,
        category: catDoc?.name || categoryName,
        categoryRef: catDoc?._id || null,
        expenseType,
        kilometresTravelled: km,
        ratePerKmApplied,
        actualServiceCost,
        serviceEnquiry: req.body.serviceEnquiry || null,
        amount,
        gstAmount,
        totalAmount,
        expenseDate: req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(),
        paymentMethod: req.body.paymentMethod || 'Cash',
        vendorPayee: req.body.vendorPayee || '',
        referenceNumber: req.body.referenceNumber || '',
        receiptUrl: req.file ? `/uploads/${req.file.filename}` : req.body.receiptUrl || '',
        description: req.body.description.trim(),
        notes: req.body.notes || '',
        approvalStatus: requestedStatus,
        paymentStatus: 'Unpaid',
        auditHistory: [
          {
            action: requestedStatus === 'Draft' ? 'DRAFT_SAVED' : 'SUBMITTED',
            status: requestedStatus,
            by: req.user.id,
            byName: req.user.name,
            note: req.body.notes || (km > 0 ? `Petrol claim: ${km} km × ₹${ratePerKmApplied}/km` : 'Expense created'),
            timestamp: new Date()
          }
        ]
      });

      await ExpenseApproval.create({
        expense: created._id,
        expenseId,
        decision: 'Submitted',
        previousStatus: '',
        newStatus: requestedStatus,
        actedBy: req.user.id,
        actedByName: req.user.name,
        actedByRole: req.user.role,
        notes: created.title
      });

      await logActivity({
        entityType: 'Expense',
        entityId: created._id.toString(),
        entityRef: expenseId,
        module: 'Expenses',
        action: 'EXPENSE_SUBMIT',
        description: `${req.user.name} submitted ${created.category} claim (${expenseId}) for ₹${created.totalAmount}`,
        newValues: { status: requestedStatus, totalAmount: created.totalAmount, category: created.category },
        user: req.user
      });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.put(
  '/expenses/:id',
  authMiddleware,
  authorizeAny('expenses.createOwn', 'expenses.manage', 'expenses.approve'),
  uploadReceiptOrMedia.single('receipt'),
  async (req, res) => {
    try {
      if (!requireMongo(res)) return;
      const exp = await Expense.findById(req.params.id);
      if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });

      const isSuperAdmin = req.user.role === 'Super Admin';
      const isOwner = String(exp.employee) === String(req.user.employeeObjectId);
      const canManage = (req.user.permissions || []).includes('expenses.manage');

      if (!isSuperAdmin && !isOwner && !canManage) {
        return res.status(403).json({ success: false, message: 'You are not authorized to modify this expense.' });
      }
      // Lock Approved or Paid expenses against unauthorized edits
      if (['Approved', 'Paid'].includes(exp.approvalStatus) && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: `Cannot edit an expense that is already ${exp.approvalStatus}.`
        });
      }

      const prev = {
        title: exp.title,
        category: exp.category,
        amount: exp.amount,
        gstAmount: exp.gstAmount,
        totalAmount: exp.totalAmount,
        approvalStatus: exp.approvalStatus
      };

      if (req.body.title !== undefined) exp.title = req.body.title.trim();
      if (req.body.category !== undefined) {
        exp.category = req.body.category.trim();
        const catDoc = await ExpenseCategory.findOne({ name: new RegExp(`^${escapeRegex(exp.category)}$`, 'i') });
        exp.categoryRef = catDoc?._id || exp.categoryRef;
      }
      if (req.body.expenseType !== undefined && ['Petrol', 'Service Cost', 'Other'].includes(req.body.expenseType)) {
        exp.expenseType = req.body.expenseType;
      }
      if (req.body.actualServiceCost !== undefined) {
        exp.actualServiceCost = Math.max(0, Number(req.body.actualServiceCost));
      }
      if (req.body.kilometresTravelled !== undefined) {
        const km = Math.max(0, Number(req.body.kilometresTravelled));
        exp.kilometresTravelled = km;
        if (km > 0 && (exp.expenseType === 'Petrol' || req.body.expenseType === 'Petrol')) {
          const settings = await CompanySetting.findOne({ key: 'default' }).select('petrolRatePerKm');
          const rate = Number(settings?.petrolRatePerKm ?? 5);
          exp.ratePerKmApplied = rate;
          exp.amount = Number((km * rate).toFixed(2));
        }
      } else if (req.body.amount !== undefined) {
        exp.amount = Number(req.body.amount);
      }
      if (req.body.gstAmount !== undefined) exp.gstAmount = Math.max(0, Number(req.body.gstAmount));
      if (req.body.amount !== undefined || req.body.gstAmount !== undefined || req.body.totalAmount !== undefined || req.body.kilometresTravelled !== undefined) {
        exp.totalAmount = Number((exp.amount + (exp.gstAmount || 0)).toFixed(2));
      }
      if (req.body.expenseDate) exp.expenseDate = new Date(req.body.expenseDate);
      if (req.body.paymentMethod) exp.paymentMethod = req.body.paymentMethod;
      if (req.body.vendorPayee !== undefined) exp.vendorPayee = req.body.vendorPayee;
      if (req.body.referenceNumber !== undefined) exp.referenceNumber = req.body.referenceNumber;
      if (req.body.description !== undefined) exp.description = req.body.description.trim();
      if (req.body.notes !== undefined) exp.notes = req.body.notes;
      if (req.file) exp.receiptUrl = `/uploads/${req.file.filename}`;
      if (req.body.submitForApproval && ['Draft', 'Rejected'].includes(exp.approvalStatus)) {
        exp.approvalStatus = 'Pending Approval';
      }

      exp.auditHistory.push({
        action: 'EDITED',
        status: exp.approvalStatus,
        by: req.user.id,
        byName: req.user.name,
        note: req.body.editNote || 'Expense details updated',
        timestamp: new Date()
      });

      await exp.save();
      await logActivity({
        entityType: 'Expense',
        entityId: exp._id.toString(),
        entityRef: exp.expenseId,
        module: 'Expenses',
        action: 'EXPENSE_UPDATE',
        description: `${req.user.name} updated expense ${exp.expenseId}`,
        previousValues: prev,
        newValues: { title: exp.title, category: exp.category, totalAmount: exp.totalAmount, approvalStatus: exp.approvalStatus },
        user: req.user
      });

      res.json({ success: true, data: exp });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

router.patch('/expenses/:id/decision', authMiddleware, authorizeAny('expenses.approve', 'expenses.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    const { decision, rejectionReason = '', paymentMethod, paymentReference = '', paidAmount, notes = '' } = req.body;
    if (!['Reviewed', 'Approved', 'Rejected', 'Paid'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Invalid expense decision.' });
    }
    if (decision === 'Rejected' && !String(rejectionReason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required when rejecting an expense.' });
    }

    const exp = await Expense.findById(req.params.id);
    if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });

    const previousStatus = exp.approvalStatus;
    const perms = req.user.permissions || [];
    if (decision === 'Paid' && !perms.includes('*') && !perms.includes('expenses.manage') && !perms.includes('financials.manage')) {
      return res.status(403).json({ success: false, message: 'Only Accountant or Super Admin can mark expenses as Paid.' });
    }

    if (decision === 'Reviewed') {
      exp.approvalStatus = 'Pending Approval';
      exp.reviewedBy = req.user.id;
      exp.reviewedByName = req.user.name;
      exp.reviewedAt = new Date();
    } else if (decision === 'Approved') {
      exp.approvalStatus = 'Approved';
      exp.approvedBy = req.user.id;
      exp.approvedByName = req.user.name;
      exp.approvedAt = new Date();
      exp.rejectionReason = '';
    } else if (decision === 'Rejected') {
      exp.approvalStatus = 'Rejected';
      exp.approvedBy = req.user.id;
      exp.approvedByName = req.user.name;
      exp.approvedAt = new Date();
      exp.rejectionReason = rejectionReason.trim();
    } else if (decision === 'Paid') {
      const settledAmount = Number(paidAmount || exp.totalAmount || exp.amount);
      exp.approvalStatus = 'Paid';
      exp.paymentStatus = 'Paid';
      exp.paidAmount = settledAmount;
      exp.paidDate = new Date();
      exp.paymentRef = paymentReference || exp.referenceNumber;
      if (paymentMethod) exp.paymentMethod = paymentMethod;

      const paymentId = await nextSequenceId('TPS-EPY');
      await ExpensePayment.create({
        paymentId,
        expense: exp._id,
        expenseId: exp.expenseId,
        employee: exp.employee,
        employeeName: exp.employeeName,
        amountPaid: settledAmount,
        paymentDate: exp.paidDate,
        paymentMethod: exp.paymentMethod || 'Bank Transfer',
        referenceNumber: exp.paymentRef || paymentId,
        processedBy: req.user.id,
        processedByName: req.user.name,
        notes: notes || `Settlement for ${exp.expenseId}`
      });
    }

    exp.auditHistory.push({
      action: `EXPENSE_${decision.toUpperCase()}`,
      status: exp.approvalStatus,
      by: req.user.id,
      byName: req.user.name,
      note: rejectionReason || notes || `Marked ${decision}`,
      timestamp: new Date()
    });
    await exp.save();

    await ExpenseApproval.create({
      expense: exp._id,
      expenseId: exp.expenseId,
      decision,
      previousStatus,
      newStatus: exp.approvalStatus,
      actedBy: req.user.id,
      actedByName: req.user.name,
      actedByRole: req.user.role,
      reason: rejectionReason,
      notes
    });

    await Notification.create({
      type: 'Expense Update',
      title: `Expense ${exp.expenseId} ${decision}`,
      message: `Your claim (${exp.title || exp.category}) of ₹${exp.totalAmount || exp.amount} was marked ${decision} by ${req.user.name}.`,
      relatedModel: 'Expense',
      relatedId: exp.expenseId,
      recipientEmployee: exp.employee,
      recipientUser: exp.submittedBy || null,
      link: '/employee/expenses'
    });

    await logActivity({
      entityType: 'Expense',
      entityId: exp._id.toString(),
      entityRef: exp.expenseId,
      module: 'Expenses',
      action: `EXPENSE_${decision.toUpperCase()}`,
      description: `${req.user.name} marked expense ${exp.expenseId} as ${decision}`,
      previousValues: { approvalStatus: previousStatus },
      newValues: { approvalStatus: exp.approvalStatus, paidAmount: exp.paidAmount, rejectionReason: exp.rejectionReason },
      user: req.user
    });

    res.json({ success: true, data: exp });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==================== ACCOUNTANT FINANCIAL SUMMARY ====================
router.get('/financial-summary', authMiddleware, authorizeAny('financials.view', 'reports.viewFinancial'), async (_req, res) => {
  try {
    if (!requireMongo(res)) return;
    const [records, payrolls, expenses, payments] = await Promise.all([
      ServiceRecord.find({}).sort({ serviceDate: -1 }),
      Payroll.find({}).sort({ payPeriod: -1 }),
      Expense.find({}).sort({ expenseDate: -1 }),
      ExpensePayment.find({}).sort({ paymentDate: -1 }).limit(30)
    ]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const getExpAmt = (e) => Number(e.totalAmount || e.amount || 0);

    const totalServiceRevenue = records.reduce((s, r) => s + Number(r.totalCharges || 0), 0);
    const collectedRevenue = records
      .filter((r) => r.paymentStatus === 'Paid')
      .reduce((s, r) => s + Number(r.totalCharges || 0), 0);
    const pendingPayments = records
      .filter((r) => ['Pending', 'Partial'].includes(r.paymentStatus))
      .reduce((s, r) => s + Number(r.totalCharges || 0), 0);

    const totalPayrollPaid = payrolls
      .filter((p) => p.paymentStatus === 'Paid')
      .reduce((s, p) => s + Number(p.netSalary || 0), 0);
    const pendingPayroll = payrolls
      .filter((p) => p.paymentStatus !== 'Paid')
      .reduce((s, p) => s + Number(p.netSalary || 0), 0);

    const nonDraft = expenses.filter((e) => e.approvalStatus !== 'Draft');
    const totalExpenses = nonDraft.reduce((s, e) => s + getExpAmt(e), 0);
    const thisMonthExpenses = nonDraft
      .filter((e) => new Date(e.expenseDate || e.createdAt) >= monthStart)
      .reduce((s, e) => s + getExpAmt(e), 0);
    const pendingExpenseClaims = expenses.filter((e) => ['Submitted', 'Pending Approval', 'Pending'].includes(e.approvalStatus)).length;
    const approvedExpensesTotal = expenses
      .filter((e) => ['Approved', 'Paid'].includes(e.approvalStatus))
      .reduce((s, e) => s + getExpAmt(e), 0);
    const paidExpensesTotal = expenses
      .filter((e) => e.approvalStatus === 'Paid')
      .reduce((s, e) => s + getExpAmt(e), 0);
    const outstandingReimbursements = expenses
      .filter((e) => e.approvalStatus === 'Approved')
      .reduce((s, e) => s + getExpAmt(e), 0);

    res.json({
      success: true,
      data: {
        kpis: {
          totalServiceRevenue,
          collectedRevenue,
          pendingPayments,
          totalPayrollPaid,
          pendingPayroll,
          totalExpenses,
          thisMonthExpenses,
          pendingExpenseClaims,
          approvedExpensesTotal,
          paidExpensesTotal,
          outstandingReimbursements
        },
        serviceBillingRecords: records.slice(0, 50),
        recentPayrolls: payrolls.slice(0, 30),
        recentExpenses: expenses.slice(0, 50),
        recentExpensePayments: payments
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== EXPENSE SETTINGS (Petrol Rate) ====================
router.get('/expense-settings', authMiddleware, authorizeAny('expenses.manage', 'settings.view', 'settings.manage', 'financials.view'), async (_req, res) => {
  try {
    if (!requireMongo(res)) return;
    const settings = await CompanySetting.findOne({ key: 'default' }).select('petrolRatePerKm petrolRateUpdatedAt petrolRateUpdatedByName');
    res.json({
      success: true,
      data: {
        petrolRatePerKm: settings?.petrolRatePerKm ?? 5,
        petrolRateUpdatedAt: settings?.petrolRateUpdatedAt || null,
        petrolRateUpdatedByName: settings?.petrolRateUpdatedByName || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/expense-settings', authMiddleware, authorizeAny('expenses.manage', 'settings.manage'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;
    if (!['Super Admin', 'Admin', 'Accountant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only Admin, Accountant, or Super Admin can update expense settings.' });
    }

    const rate = Number(req.body.petrolRatePerKm);
    if (isNaN(rate) || rate < 0) {
      return res.status(400).json({ success: false, message: 'Invalid petrol rate value.' });
    }

    await CompanySetting.updateOne(
      { key: 'default' },
      {
        $set: {
          petrolRatePerKm: rate,
          petrolRateUpdatedAt: new Date(),
          petrolRateUpdatedBy: req.user.id,
          petrolRateUpdatedByName: req.user.name
        }
      },
      { upsert: true }
    );

    res.json({ success: true, message: `Petrol rate updated to ₹${rate}/km.`, data: { petrolRatePerKm: rate } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== DELETE EXPENSE ====================
router.delete('/expenses/:id', authMiddleware, authorizeAny('expenses.manage', 'expenses.viewAll'), async (req, res) => {
  try {
    if (!requireMongo(res)) return;

    const exp = await Expense.findById(req.params.id);
    if (!exp) return res.status(404).json({ success: false, message: 'Expense not found.' });

    // Block deletion of Approved or Paid expenses — protect financial integrity
    if (['Approved', 'Paid'].includes(exp.approvalStatus)) {
      return res.status(403).json({
        success: false,
        message: `Cannot delete an expense with status "${exp.approvalStatus}". Reject it first.`
      });
    }

    // Only Super Admin / Accountant can delete others' expenses
    const isSelf = String(exp.submittedBy) === String(req.user.id);
    const isPrivileged = ['Super Admin', 'Admin', 'Accountant'].includes(req.user.role);
    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'You can only delete your own expense submissions.' });
    }

    await Expense.deleteOne({ _id: exp._id });

    await logActivity({
      entityType: 'Expense',
      entityId: exp._id.toString(),
      entityRef: exp.expenseId,
      module: 'Expenses',
      action: 'EXPENSE_DELETED',
      targetType: 'Expense',
      targetId: exp._id.toString(),
      targetLabel: exp.expenseId,
      description: `Expense ${exp.expenseId} deleted by ${req.user.name}`,
      user: req.user,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Expense deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;