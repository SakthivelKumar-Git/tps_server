import express from 'express';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import ServiceEnquiry from '../models/ServiceEnquiry.js';
import ServiceBooking from '../models/ServiceBooking.js';
import ServiceRecord from '../models/ServiceRecord.js';
import FollowUp from '../models/FollowUp.js';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import AmcContract from '../models/AmcContract.js';
import Expense from '../models/Expense.js';
import Employee from '../models/Employee.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, getAccessibleEmployeeIds } from '../middleware/auth.js';
import { escapeRegex } from '../utils/crmHelpers.js';

const router = express.Router();

const getDateBounds = (range = 'month', startDate, endDate) => {
  const now = new Date();
  let start;
  let end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'lastMonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (range === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (range === 'custom' && startDate) {
    start = new Date(startDate);
    if (endDate) {
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }
  } else if (range === 'all') {
    start = new Date(2000, 0, 1);
  } else {
    // default: this month
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const durationMs = Math.max(86400000, end.getTime() - start.getTime());
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start, end, prevStart, prevEnd };
};

const calcPctChange = (current, previous) => {
  if (!previous || previous === 0) return null; // Never fabricate when historical baseline is 0
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const monthLabel = (year, month) => {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('en-US', { month: 'short' });
};

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const { range = 'month', startDate, endDate } = req.query;
    const { start, end, prevStart, prevEnd } = getDateBounds(range, startDate, endDate);
    const inCurrent = (d) => {
      const t = new Date(d).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };
    const inPrev = (d) => {
      const t = new Date(d).getTime();
      return t >= prevStart.getTime() && t <= prevEnd.getTime();
    };

    if (isMongoConnected()) {
      const [
        totalLeads,
        newLeads,
        totalCustomers,
        totalServiceEnquiries,
        pendingServiceEnquiries,
        confirmedBookings,
        completedServices,
        upcomingFollowUps,
        curLeads,
        prevLeads,
        curCustomers,
        prevCustomers,
        curSrvEnq,
        prevSrvEnq,
        curCompleted,
        prevCompleted,
        recentLeads,
        recentServiceEnquiries,
        upcomingFollowUpsList
      ] = await Promise.all([
        Lead.countDocuments(),
        Lead.countDocuments({ status: 'New' }),
        Customer.countDocuments(),
        ServiceEnquiry.countDocuments(),
        ServiceEnquiry.countDocuments({ status: { $in: ['New', 'Pending Review', 'Waiting for Parts'] } }),
        ServiceBooking.countDocuments({ status: { $in: ['Confirmed', 'Technician Assigned'] } }),
        ServiceRecord.countDocuments(),
        FollowUp.countDocuments({ status: { $in: ['Upcoming', 'Pending'] } }),
        Lead.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        Lead.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
        Customer.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        Customer.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
        ServiceEnquiry.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        ServiceEnquiry.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
        ServiceRecord.countDocuments({ serviceDate: { $gte: start, $lte: end } }),
        ServiceRecord.countDocuments({ serviceDate: { $gte: prevStart, $lte: prevEnd } }),
        Lead.find().sort({ createdAt: -1 }).limit(6),
        ServiceEnquiry.find().sort({ createdAt: -1 }).limit(6),
        FollowUp.find({ status: { $in: ['Upcoming', 'Pending'] } }).sort({ followUpDate: 1 }).limit(6)
      ]);

      return res.json({
        success: true,
        data: {
          database: 'mongodb',
          kpis: {
            totalLeads: { count: totalLeads, periodCount: curLeads, change: calcPctChange(curLeads, prevLeads) },
            newLeads: { count: newLeads, change: null },
            totalCustomers: { count: totalCustomers, periodCount: curCustomers, change: calcPctChange(curCustomers, prevCustomers) },
            totalServiceEnquiries: { count: totalServiceEnquiries, periodCount: curSrvEnq, change: calcPctChange(curSrvEnq, prevSrvEnq) },
            pendingServiceEnquiries: { count: pendingServiceEnquiries, change: null },
            confirmedBookings: { count: confirmedBookings, change: null },
            completedServices: { count: completedServices, periodCount: curCompleted, change: calcPctChange(curCompleted, prevCompleted) },
            upcomingFollowUps: { count: upcomingFollowUps, change: null }
          },
          recentLeads,
          recentServiceEnquiries,
          upcomingFollowUps: upcomingFollowUpsList
        }
      });
    }

    const curLeads = store.leads.filter((l) => inCurrent(l.createdAt)).length;
    const prevLeads = store.leads.filter((l) => inPrev(l.createdAt)).length;
    const curCustomers = store.customers.filter((c) => inCurrent(c.createdAt)).length;
    const prevCustomers = store.customers.filter((c) => inPrev(c.createdAt)).length;
    const curSrvEnq = store.serviceEnquiries.filter((s) => inCurrent(s.createdAt)).length;
    const prevSrvEnq = store.serviceEnquiries.filter((s) => inPrev(s.createdAt)).length;
    const curCompleted = store.serviceRecords.filter((r) => inCurrent(r.serviceDate)).length;
    const prevCompleted = store.serviceRecords.filter((r) => inPrev(r.serviceDate)).length;

    res.json({
      success: true,
      data: {
        database: 'in-memory-fallback',
        kpis: {
          totalLeads: { count: store.leads.length, periodCount: curLeads, change: calcPctChange(curLeads, prevLeads) },
          newLeads: { count: store.leads.filter((l) => l.status === 'New').length, change: null },
          totalCustomers: { count: store.customers.length, periodCount: curCustomers, change: calcPctChange(curCustomers, prevCustomers) },
          totalServiceEnquiries: { count: store.serviceEnquiries.length, periodCount: curSrvEnq, change: calcPctChange(curSrvEnq, prevSrvEnq) },
          pendingServiceEnquiries: {
            count: store.serviceEnquiries.filter((s) => ['New', 'Pending Review', 'Waiting for Parts'].includes(s.status)).length,
            change: null
          },
          confirmedBookings: {
            count: store.serviceBookings.filter((b) => ['Confirmed', 'Technician Assigned'].includes(b.status)).length,
            change: null
          },
          completedServices: { count: store.serviceRecords.length, periodCount: curCompleted, change: calcPctChange(curCompleted, prevCompleted) },
          upcomingFollowUps: {
            count: store.followUps.filter((f) => ['Upcoming', 'Pending'].includes(f.status)).length,
            change: null
          }
        },
        recentLeads: [...store.leads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
        recentServiceEnquiries: [...store.serviceEnquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
        upcomingFollowUps: store.followUps
          .filter((f) => ['Upcoming', 'Pending'].includes(f.status))
          .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
          .slice(0, 6)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/leads', authMiddleware, async (req, res) => {
  try {
    const { range = 'year', startDate, endDate } = req.query;
    const { start, end } = getDateBounds(range, startDate, endDate);

    if (isMongoConnected()) {
      const match = { createdAt: { $gte: start, $lte: end } };
      const [monthlyAgg, statusAgg, conversionAgg] = await Promise.all([
        Lead.aggregate([
          { $match: match },
          {
            $group: {
              _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
              leads: { $sum: 1 },
              converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } },
              value: { $sum: '$estimatedValue' }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),
        Lead.aggregate([
          { $match: match },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Lead.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);

      const monthly = monthlyAgg.map((m) => ({
        month: `${monthLabel(m._id.year, m._id.month)} ${String(m._id.year).slice(-2)}`,
        leads: m.leads,
        converted: m.converted,
        value: m.value
      }));

      const stages = ['New', 'Contacted', 'Interested', 'Quotation Sent', 'Negotiation', 'Converted'];
      const stageMap = Object.fromEntries(conversionAgg.map((s) => [s._id, s.count]));
      const funnel = stages.map((stage) => ({ stage, count: stageMap[stage] || 0 }));

      return res.json({
        success: true,
        data: {
          monthly,
          byStatus: statusAgg.map((s) => ({ name: s._id || 'Unknown', value: s.count })),
          funnel
        }
      });
    }

    const filtered = store.leads.filter((l) => {
      const t = new Date(l.createdAt).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const monthlyMap = new Map();
    filtered.forEach((l) => {
      const d = new Date(l.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthLabel(d.getFullYear(), d.getMonth() + 1)} ${String(d.getFullYear()).slice(-2)}`;
      const cur = monthlyMap.get(key) || { month: label, leads: 0, converted: 0, value: 0 };
      cur.leads += 1;
      if (l.status === 'Converted') cur.converted += 1;
      cur.value += Number(l.estimatedValue || 0);
      monthlyMap.set(key, cur);
    });

    const stages = ['New', 'Contacted', 'Interested', 'Quotation Sent', 'Negotiation', 'Converted'];
    const funnel = stages.map((stage) => ({
      stage,
      count: store.leads.filter((l) => l.status === stage).length
    }));
    const statusMap = {};
    filtered.forEach((l) => { statusMap[l.status] = (statusMap[l.status] || 0) + 1; });

    res.json({
      success: true,
      data: {
        monthly: Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v),
        byStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
        funnel
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/services', authMiddleware, async (req, res) => {
  try {
    const { range = 'year', startDate, endDate } = req.query;
    const { start, end } = getDateBounds(range, startDate, endDate);

    if (isMongoConnected()) {
      const match = { createdAt: { $gte: start, $lte: end } };
      const [enquiriesTrendAgg, statusDonutAgg, brandWiseAgg, bookingsMonthlyAgg] = await Promise.all([
        ServiceEnquiry.aggregate([
          { $match: match },
          {
            $group: {
              _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
              enquiries: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),
        ServiceEnquiry.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        ServiceEnquiry.aggregate([
          { $match: match },
          { $group: { _id: { $ifNull: ['$brand', 'Other'] }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        ServiceBooking.aggregate([
          { $match: { appointmentDate: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: { year: { $year: '$appointmentDate' }, month: { $month: '$appointmentDate' } },
              bookings: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ])
      ]);

      return res.json({
        success: true,
        data: {
          enquiriesTrend: enquiriesTrendAgg.map((e) => ({
            month: `${monthLabel(e._id.year, e._id.month)} ${String(e._id.year).slice(-2)}`,
            enquiries: e.enquiries
          })),
          statusBreakdown: statusDonutAgg.map((s) => ({ name: s._id || 'Unknown', value: s.count })),
          brandWise: brandWiseAgg.map((b) => ({ brand: b._id || 'Other', count: b.count })),
          bookingsMonthly: bookingsMonthlyAgg.map((b) => ({
            month: `${monthLabel(b._id.year, b._id.month)} ${String(b._id.year).slice(-2)}`,
            bookings: b.bookings,
            completed: b.completed
          }))
        }
      });
    }

    const filteredEnq = store.serviceEnquiries.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const trendMap = new Map();
    filteredEnq.forEach((s) => {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthLabel(d.getFullYear(), d.getMonth() + 1)} ${String(d.getFullYear()).slice(-2)}`;
      const cur = trendMap.get(key) || { month: label, enquiries: 0 };
      cur.enquiries += 1;
      trendMap.set(key, cur);
    });

    const statusMap = {};
    store.serviceEnquiries.forEach((s) => { statusMap[s.status] = (statusMap[s.status] || 0) + 1; });

    const brandMap = {};
    filteredEnq.forEach((s) => {
      const b = s.brand || 'Other';
      brandMap[b] = (brandMap[b] || 0) + 1;
    });

    const bookingsMap = new Map();
    store.serviceBookings.forEach((b) => {
      const d = new Date(b.appointmentDate || b.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthLabel(d.getFullYear(), d.getMonth() + 1)} ${String(d.getFullYear()).slice(-2)}`;
      const cur = bookingsMap.get(key) || { month: label, bookings: 0, completed: 0 };
      cur.bookings += 1;
      if (b.status === 'Completed') cur.completed += 1;
      bookingsMap.set(key, cur);
    });

    res.json({
      success: true,
      data: {
        enquiriesTrend: Array.from(trendMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v),
        statusBreakdown: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
        brandWise: Object.entries(brandMap).map(([brand, count]) => ({ brand, count })),
        bookingsMonthly: Array.from(bookingsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/followups', authMiddleware, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (isMongoConnected()) {
      const [upcoming, today, overdue] = await Promise.all([
        FollowUp.find({ status: { $in: ['Upcoming', 'Pending'] }, followUpDate: { $gt: endOfToday } }).sort({ followUpDate: 1 }).limit(10),
        FollowUp.find({ status: { $in: ['Upcoming', 'Pending'] }, followUpDate: { $gte: startOfToday, $lte: endOfToday } }).sort({ followUpDate: 1 }),
        FollowUp.find({ status: { $in: ['Upcoming', 'Pending'] }, followUpDate: { $lt: startOfToday } }).sort({ followUpDate: 1 })
      ]);
      return res.json({ success: true, data: { upcoming, today, overdue } });
    }

    const active = store.followUps.filter((f) => ['Upcoming', 'Pending'].includes(f.status));
    res.json({
      success: true,
      data: {
        upcoming: active.filter((f) => new Date(f.followUpDate) > endOfToday),
        today: active.filter((f) => {
          const t = new Date(f.followUpDate);
          return t >= startOfToday && t <= endOfToday;
        }),
        overdue: active.filter((f) => new Date(f.followUpDate) < startOfToday)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export const globalSearchHandler = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const rx = new RegExp(escapeRegex(q), 'i');

    if (isMongoConnected()) {
      const [leads, customers, enquiries, bookings, products, brands] = await Promise.all([
        Lead.find({ $or: [{ leadId: rx }, { customerName: rx }, { phone: rx }, { email: rx }] }).limit(5),
        Customer.find({ $or: [{ customerId: rx }, { name: rx }, { phone: rx }, { email: rx }] }).limit(5),
        ServiceEnquiry.find({ $or: [{ enquiryId: rx }, { customerName: rx }, { phone: rx }, { brand: rx }] }).limit(5),
        ServiceBooking.find({ $or: [{ bookingId: rx }, { enquiryId: rx }, { customerName: rx }, { phone: rx }] }).limit(5),
        Product.find({ $or: [{ name: rx }, { brand: rx }, { category: rx }, { model: rx }] }).limit(5),
        Brand.find({ $or: [{ name: rx }, { category: rx }] }).limit(5)
      ]);

      const results = [
        ...leads.map((l) => ({ type: 'Lead', id: l.id, code: l.leadId, title: l.customerName, subtitle: `${l.phone} • ${l.status}`, link: `/admin/leads/${l.id}` })),
        ...customers.map((c) => ({ type: 'Customer', id: c.id, code: c.customerId, title: c.name, subtitle: `${c.phone} • ${c.city}`, link: `/admin/customers/${c.id}` })),
        ...enquiries.map((e) => ({ type: 'Service Enquiry', id: e.id, code: e.enquiryId, title: e.customerName, subtitle: `${e.serviceType} • ${e.status}`, link: `/admin/service-enquiries?id=${e.id}` })),
        ...bookings.map((b) => ({ type: 'Booking', id: b.id, code: b.bookingId, title: b.customerName, subtitle: `${b.serviceType} • ${b.status}`, link: `/admin/service-bookings?id=${b.id}` })),
        ...products.map((p) => ({ type: 'Product', id: p.id, code: p.brand, title: p.name, subtitle: p.category, link: `/admin/products` })),
        ...brands.map((b) => ({ type: 'Brand', id: b.id, code: 'BRAND', title: b.name, subtitle: b.category, link: `/admin/brands` }))
      ];
      return res.json({ success: true, data: results });
    }

    const ql = q.toLowerCase();
    const match = (val) => String(val || '').toLowerCase().includes(ql);
    const results = [
      ...store.leads.filter((l) => match(l.leadId) || match(l.customerName) || match(l.phone)).slice(0, 5)
        .map((l) => ({ type: 'Lead', id: l.id, code: l.leadId, title: l.customerName, subtitle: `${l.phone} • ${l.status}`, link: `/admin/leads/${l.id}` })),
      ...store.customers.filter((c) => match(c.customerId) || match(c.name) || match(c.phone)).slice(0, 5)
        .map((c) => ({ type: 'Customer', id: c.id, code: c.customerId, title: c.name, subtitle: `${c.phone} • ${c.city}`, link: `/admin/customers/${c.id}` })),
      ...store.serviceEnquiries.filter((e) => match(e.enquiryId) || match(e.customerName) || match(e.phone)).slice(0, 5)
        .map((e) => ({ type: 'Service Enquiry', id: e.id, code: e.enquiryId, title: e.customerName, subtitle: `${e.serviceType} • ${e.status}`, link: `/admin/service-enquiries?id=${e.id}` })),
      ...store.serviceBookings.filter((b) => match(b.bookingId) || match(b.enquiryId) || match(b.customerName) || match(b.phone)).slice(0, 5)
        .map((b) => ({ type: 'Booking', id: b.id, code: b.bookingId, title: b.customerName, subtitle: `${b.serviceType} • ${b.status}`, link: `/admin/service-bookings?id=${b.id}` })),
      ...store.products.filter((p) => match(p.name) || match(p.brand) || match(p.category)).slice(0, 5)
        .map((p) => ({ type: 'Product', id: p.id, code: p.brand, title: p.name, subtitle: p.category, link: `/admin/products` })),
      ...store.brands.filter((b) => match(b.name) || match(b.category)).slice(0, 5)
        .map((b) => ({ type: 'Brand', id: b.id, code: 'BRAND', title: b.name, subtitle: b.category, link: `/admin/brands` }))
    ];
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.get('/search', authMiddleware, globalSearchHandler);

// ==================== PHASE 19: ROLE-SPECIFIC REAL MONGODB DASHBOARD ====================
router.get('/role-summary', authMiddleware, async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const role = req.user.role;
    const empId = req.user.employeeObjectId;

    if (role === 'Super Admin' || role === 'Admin') {
      const [
        totalCustomers,
        totalLeads,
        wonLeads,
        pendingFollowUps,
        upcomingFollowUps,
        serviceEnquiries,
        pendingServices,
        amcExpiringSoon,
        monthlyRecs,
        monthlyExps,
        empPerfAgg
      ] = await Promise.all([
        Customer.countDocuments(),
        Lead.countDocuments(),
        Lead.countDocuments({ status: { $in: ['Won', 'Converted'] } }),
        FollowUp.countDocuments({ status: { $in: ['Pending', 'Missed'] } }),
        FollowUp.countDocuments({ status: { $in: ['Upcoming', 'Pending', 'Rescheduled'] }, followUpDate: { $gte: startOfToday } }),
        ServiceEnquiry.countDocuments(),
        ServiceEnquiry.countDocuments({ status: { $nin: ['Completed', 'Cancelled', 'Rejected'] } }),
        AmcContract.countDocuments({ endDate: { $gte: now, $lte: next30Days }, amcStatus: { $nin: ['Renewed', 'Cancelled'] } }),
        ServiceRecord.aggregate([
          { $match: { serviceDate: { $gte: monthStart } } },
          { $group: { _id: null, total: { $sum: '$totalCharges' } } }
        ]),
        Expense.aggregate([
          { $match: { expenseDate: { $gte: monthStart }, approvalStatus: { $ne: 'Draft' } } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', '$amount'] } } } }
        ]),
        Lead.aggregate([
          { $match: { assignedEmployee: { $ne: null } } },
          {
            $group: {
              _id: '$assignedEmployeeName',
              totalLeads: { $sum: 1 },
              won: { $sum: { $cond: [{ $in: ['$status', ['Won', 'Converted']] }, 1, 0] } },
              pipelineValue: { $sum: { $ifNull: ['$estimatedValue', 0] } }
            }
          },
          { $sort: { won: -1, totalLeads: -1 } },
          { $limit: 10 }
        ])
      ]);

      return res.json({
        success: true,
        role,
        data: {
          totalCustomers,
          totalLeads,
          leadConversionRate: totalLeads ? Number(((wonLeads / totalLeads) * 100).toFixed(1)) : 0,
          pendingFollowUps,
          upcomingFollowUps,
          serviceEnquiries,
          pendingServices,
          amcExpiringSoon,
          monthlyRevenue: monthlyRecs[0]?.total || 0,
          monthlyExpenses: monthlyExps[0]?.total || 0,
          employeePerformance: empPerfAgg
        }
      });
    }

    if (role === 'Manager') {
      const teamIds = await getAccessibleEmployeeIds(req.user);
      const [teamLeads, wonTeamLeads, completedFollowUps, totalFollowUps, serviceAssignments, pendingTasks] =
        await Promise.all([
          Lead.countDocuments({ assignedEmployee: { $in: teamIds } }),
          Lead.countDocuments({ assignedEmployee: { $in: teamIds }, status: { $in: ['Won', 'Converted'] } }),
          FollowUp.countDocuments({ assignedEmployee: { $in: teamIds }, status: 'Completed' }),
          FollowUp.countDocuments({ assignedEmployee: { $in: teamIds } }),
          ServiceEnquiry.countDocuments({ assignedTechnician: { $in: teamIds } }),
          FollowUp.countDocuments({ assignedEmployee: { $in: teamIds }, status: { $in: ['Upcoming', 'Pending', 'Missed'] } })
        ]);
      return res.json({
        success: true,
        role,
        data: {
          teamLeads,
          teamConversionRate: teamLeads ? Number(((wonTeamLeads / teamLeads) * 100).toFixed(1)) : 0,
          followUpCompletionRate: totalFollowUps ? Number(((completedFollowUps / totalFollowUps) * 100).toFixed(1)) : 0,
          serviceAssignments,
          pendingTasks
        }
      });
    }

    if (role === 'Accountant') {
      const [allExp, monthExp] = await Promise.all([
        Expense.find({ approvalStatus: { $ne: 'Draft' } }),
        Expense.find({ expenseDate: { $gte: monthStart }, approvalStatus: { $ne: 'Draft' } })
      ]);
      const getAmt = (e) => Number(e.totalAmount || e.amount || 0);
      return res.json({
        success: true,
        role,
        data: {
          totalExpenses: allExp.reduce((s, e) => s + getAmt(e), 0),
          pendingApprovals: allExp.filter((e) => ['Submitted', 'Pending Approval', 'Pending'].includes(e.approvalStatus)).length,
          approvedExpenses: allExp.filter((e) => e.approvalStatus === 'Approved').reduce((s, e) => s + getAmt(e), 0),
          paidExpenses: allExp.filter((e) => e.approvalStatus === 'Paid').reduce((s, e) => s + getAmt(e), 0),
          monthlyExpenseSummary: monthExp.reduce((s, e) => s + getAmt(e), 0)
        }
      });
    }

    // Sales Executive / BDE / Senior Sales Executive / Technician scope
    const [
      myLeads,
      convertedLeads,
      todaysFollowUps,
      upcomingFollowUps,
      assignedServices,
      todaysServices,
      pendingServices,
      completedServices
    ] = await Promise.all([
      empId ? Lead.countDocuments({ assignedEmployee: empId }) : 0,
      empId ? Lead.countDocuments({ assignedEmployee: empId, status: { $in: ['Won', 'Converted'] } }) : 0,
      empId ? FollowUp.countDocuments({ assignedEmployee: empId, followUpDate: { $gte: startOfToday, $lte: endOfToday }, status: { $ne: 'Cancelled' } }) : 0,
      empId ? FollowUp.countDocuments({ assignedEmployee: empId, followUpDate: { $gte: startOfToday }, status: { $in: ['Upcoming', 'Pending', 'Rescheduled'] } }) : 0,
      empId ? ServiceEnquiry.countDocuments({ assignedTechnician: empId }) : 0,
      empId ? ServiceEnquiry.countDocuments({ assignedTechnician: empId, serviceDate: { $gte: startOfToday, $lte: endOfToday } }) : 0,
      empId ? ServiceEnquiry.countDocuments({ assignedTechnician: empId, status: { $nin: ['Completed', 'Cancelled', 'Rejected'] } }) : 0,
      empId ? ServiceEnquiry.countDocuments({ assignedTechnician: empId, status: 'Completed' }) : 0
    ]);

    return res.json({
      success: true,
      role,
      data: {
        myLeads,
        convertedLeads,
        myPerformanceRate: myLeads ? Number(((convertedLeads / myLeads) * 100).toFixed(1)) : 0,
        todaysFollowUps,
        upcomingFollowUps,
        assignedServices,
        todaysServices,
        pendingServices,
        completedServices
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
