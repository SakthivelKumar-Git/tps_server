import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { isMongoConnected } from './config/db.js';
import { sanitizeBody, authMiddleware, authorizeAny, requirePermission, getAccessibleEmployeeIds } from './middleware/auth.js';
import { uploadProductImage } from './middleware/upload.js';

import authRoutes from './routes/authRoutes.js';
import dashboardRoutes, { globalSearchHandler } from './routes/dashboardRoutes.js';
import leadsRoutes, { createLeadHandler } from './routes/leadsRoutes.js';
import customersRoutes from './routes/customersRoutes.js';
import serviceEnquiriesRoutes, { createServiceEnquiryHandler } from './routes/serviceEnquiriesRoutes.js';
import serviceBookingsRoutes from './routes/serviceBookingsRoutes.js';
import serviceRecordsRoutes from './routes/serviceRecordsRoutes.js';
import followUpsRoutes from './routes/followUpsRoutes.js';
import warrantiesAmcRoutes from './routes/warrantiesAmcRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import masterDataRoutes from './routes/masterDataRoutes.js';
import reportsNotificationsSettingsRoutes from './routes/reportsNotificationsSettingsRoutes.js';
import rbacRoutes from './routes/rbacRoutes.js';
import hrmsRoutes from './routes/hrmsRoutes.js';
import systemAdminRoutes from './routes/systemAdminRoutes.js';

import Lead from './models/Lead.js';
import ServiceEnquiry from './models/ServiceEnquiry.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import { store } from './store/inMemoryStore.js';

const __filename = typeof import.meta?.url === 'string' ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

const app = express();

const allowedOrigins = [
  'https://tps-client.pages.dev',
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173'
];

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.pages.dev')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(sanitizeBody);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting (enabled for standalone Node, Cloudflare edge protects workers)
const isWorker = typeof WebSocketPair !== 'undefined' || process.env.CLOUDFLARE_WORKER === 'true';
const noopLimiter = (_req, _res, next) => next();

const apiLimiter = !isWorker
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false
    })
  : noopLimiter;

const authLimiter = !isWorker
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      message: { success: false, message: 'Too many login attempts. Please try again later.' }
    })
  : noopLimiter;

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

// Root & Health check
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    message: 'True Power Solutions API Server',
    database: isMongoConnected() ? 'mongodb' : 'in-memory-fallback',
    docs: '/api/health',
    company: 'TRUE POWER SOLUTIONS'
  });
});

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'healthy',
    database: isMongoConnected() ? 'mongodb' : 'in-memory-fallback',
    timestamp: new Date().toISOString(),
    company: 'TRUE POWER SOLUTIONS'
  });
});

// Modular CRM Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.get('/api/search', authMiddleware, globalSearchHandler);
app.use('/api/leads', leadsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/service-enquiries', serviceEnquiriesRoutes);
app.use('/api/service-bookings', serviceBookingsRoutes);
app.use('/api/service-records', serviceRecordsRoutes);
app.use('/api/followups', followUpsRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/hrms', hrmsRoutes);
app.use('/api/system', systemAdminRoutes);
app.use('/api', warrantiesAmcRoutes);
app.use('/api', orgRoutes);
app.use('/api', masterDataRoutes);
app.use('/api', reportsNotificationsSettingsRoutes);

// ==================== LEGACY PUBLIC & ADMIN COMPATIBILITY ALIASES ====================
// Public product/contact enquiry -> creates Lead in CRM
app.post('/api/enquiries', createLeadHandler);
app.get('/api/enquiries', authMiddleware, requirePermission('leads:view'), async (req, res) => {
  try {
    const { status } = req.query;
    const perms = req.user?.permissions || [];
    const hasAll = perms.includes('*') || perms.includes('leads.viewAll');
    if (isMongoConnected()) {
      const query = status && status !== 'all' ? { status } : {};
      if (!hasAll) {
        const empIds = perms.includes('leads.viewTeam')
          ? await getAccessibleEmployeeIds(req.user)
          : req.user.employeeObjectId
          ? [req.user.employeeObjectId]
          : [];
        query.assignedEmployee = { $in: empIds };
      }
      const list = await Lead.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: list.length, data: list });
    }
    const list = status && status !== 'all' ? store.leads.filter((l) => l.status === status) : store.leads;
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public service request -> creates Customer + ServiceEnquiry + Notification
app.post('/api/service-requests', uploadProductImage.single('productImage'), createServiceEnquiryHandler);
app.get('/api/service-requests', authMiddleware, requirePermission('serviceEnquiries:view'), async (req, res) => {
  try {
    const { status } = req.query;
    const perms = req.user?.permissions || [];
    const hasAll = perms.includes('*') || perms.includes('services.viewAll');
    if (isMongoConnected()) {
      const query = status && status !== 'all' ? { status } : {};
      if (!hasAll) {
        const empIds = perms.includes('employees.viewTeam')
          ? await getAccessibleEmployeeIds(req.user)
          : req.user.employeeObjectId
          ? [req.user.employeeObjectId]
          : [];
        query.assignedTechnician = { $in: empIds };
      }
      const list = await ServiceEnquiry.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: list.length, data: list });
    }
    const list = status && status !== 'all' ? store.serviceEnquiries.filter((s) => s.status === status) : store.serviceEnquiries;
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get(
  '/api/admin/stats',
  authMiddleware,
  authorizeAny('leads.viewAll', 'leads.viewTeam', 'leads.viewOwn', 'services.viewAll', 'services.viewAssigned', 'reports.viewBusiness', 'financials.view', 'system.view'),
  async (req, res) => {
    try {
      const perms = req.user?.permissions || [];
      const hasAllLeads = perms.includes('*') || perms.includes('leads.viewAll');
      const hasAllServices = perms.includes('*') || perms.includes('services.viewAll');
      if (isMongoConnected()) {
        const empIds = (!hasAllLeads || !hasAllServices) ? await getAccessibleEmployeeIds(req.user) : [];
        const leadFilter = hasAllLeads ? {} : { assignedEmployee: { $in: empIds } };
        const serviceFilter = hasAllServices ? {} : { assignedTechnician: { $in: empIds } };
        const [totalProducts, totalBrands, leads, services] = await Promise.all([
          Product.countDocuments(),
          Brand.countDocuments(),
          Lead.find(leadFilter).sort({ createdAt: -1 }),
          ServiceEnquiry.find(serviceFilter).sort({ createdAt: -1 })
        ]);
        return res.json({
          success: true,
          data: {
            totalProducts,
            totalBrands,
            totalEnquiries: leads.length,
            newEnquiries: leads.filter((l) => l.status === 'New').length,
            totalServiceRequests: services.length,
            pendingServices: services.filter((s) => ['New', 'Pending Review'].includes(s.status)).length,
            recentEnquiries: leads.slice(0, 5),
            recentServiceRequests: services.slice(0, 5),
            database: 'mongodb'
          }
        });
      }

      res.json({
        success: true,
        data: {
          totalProducts: store.products.length,
          totalBrands: store.brands.length,
          totalEnquiries: store.leads.length,
          newEnquiries: store.leads.filter((l) => l.status === 'New').length,
          totalServiceRequests: store.serviceEnquiries.length,
          pendingServices: store.serviceEnquiries.filter((s) => ['New', 'Pending Review'].includes(s.status)).length,
          recentEnquiries: store.leads.slice(0, 5),
          recentServiceRequests: store.serviceEnquiries.slice(0, 5),
          database: 'in-memory-fallback'
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Global error handler (including multer file size/type errors)
app.use((err, _req, res, _next) => {
  if (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message || 'Unexpected server error'
    });
  }
});

export default app;
