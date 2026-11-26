import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { connectDB, isMongoConnected } from './config/db.js';
import { store } from './store/inMemoryStore.js';
import { authMiddleware, getJwtSecret } from './middleware/auth.js';
import { companyDetails } from './data/seedData.js';

import User from './models/User.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';
import Service from './models/Service.js';
import Enquiry from './models/Enquiry.js';
import ServiceRequest from './models/ServiceRequest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true
  })
);
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const buildIdOrSlugQuery = (param) => {
  const conditions = [{ id: param }, { slug: param }];
  if (mongoose.Types.ObjectId.isValid(param)) {
    conditions.push({ _id: param });
  }
  return { $or: conditions };
};

const buildIdQuery = (param) => {
  const conditions = [{ id: param }];
  if (mongoose.Types.ObjectId.isValid(param)) {
    conditions.push({ _id: param });
  }
  return { $or: conditions };
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: isMongoConnected() ? 'mongodb' : 'in-memory-fallback',
    timestamp: new Date().toISOString(),
    company: companyDetails.name
  });
});

// Company details
app.get('/api/company', (req, res) => {
  res.json({ success: true, data: companyDetails });
});

// ==================== BRANDS ====================
app.get('/api/brands', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const brands = await Brand.find().sort({ createdAt: 1 });
      return res.json({ success: true, count: brands.length, data: brands });
    }
    const brands = store.getBrands();
    res.json({ success: true, count: brands.length, data: brands });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/brands/:id', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const brand = await Brand.findOne({
        $or: [
          { id: req.params.id },
          { name: new RegExp(`^${req.params.id}$`, 'i') },
          ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])
        ]
      });
      if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
      return res.json({ success: true, data: brand });
    }
    const brand = store.getBrandById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: brand });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/brands', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const id = req.body.id || req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const brand = await Brand.create({ ...req.body, id });
      return res.status(201).json({ success: true, data: brand });
    }
    const brand = store.addBrand(req.body);
    res.status(201).json({ success: true, data: brand });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/brands/:id', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const brand = await Brand.findOneAndUpdate(buildIdQuery(req.params.id), req.body, { new: true });
      if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
      return res.json({ success: true, data: brand });
    }
    const brand = store.updateBrand(req.params.id, req.body);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: brand });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/brands/:id', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Brand.findOneAndDelete(buildIdQuery(req.params.id));
      if (!deleted) return res.status(404).json({ success: false, message: 'Brand not found' });
      return res.json({ success: true, message: 'Brand deleted successfully' });
    }
    const deleted = store.deleteBrand(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, message: 'Brand deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PRODUCTS ====================
app.get('/api/products', async (req, res) => {
  try {
    const { brand, category, search, featured } = req.query;
    if (isMongoConnected()) {
      const query = {};
      if (brand && brand !== 'All') query.brand = new RegExp(`^${brand}$`, 'i');
      if (category && category !== 'All') query.category = new RegExp(`^${category}$`, 'i');
      if (featured !== undefined) query.featured = featured === 'true';
      if (search) {
        const regex = new RegExp(search, 'i');
        query.$or = [
          { name: regex },
          { brand: regex },
          { category: regex },
          { shortDescription: regex }
        ];
      }
      const products = await Product.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: products.length, data: products });
    }
    const products = store.getProducts({ brand, category, search, featured: featured ? featured === 'true' : undefined });
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const product = await Product.findOne(buildIdOrSlugQuery(req.params.id));
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.json({ success: true, data: product });
    }
    const product = store.getProductById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/products', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const id = req.body.id || 'prod-' + Date.now();
      const slug = req.body.slug || `${req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      const product = await Product.create({ ...req.body, id, slug });
      return res.status(201).json({ success: true, data: product });
    }
    const product = store.addProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const product = await Product.findOneAndUpdate(buildIdOrSlugQuery(req.params.id), req.body, { new: true });
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.json({ success: true, data: product });
    }
    const product = store.updateProduct(req.params.id, req.body);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Product.findOneAndDelete(buildIdOrSlugQuery(req.params.id));
      if (!deleted) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.json({ success: true, message: 'Product deleted successfully' });
    }
    const deleted = store.deleteProduct(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SERVICES ====================
app.get('/api/services', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const services = await Service.find().sort({ createdAt: 1 });
      return res.json({ success: true, count: services.length, data: services });
    }
    const services = store.getServices();
    res.json({ success: true, count: services.length, data: services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/services/:id', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const service = await Service.findOne(buildIdQuery(req.params.id));
      if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
      return res.json({ success: true, data: service });
    }
    const service = store.getServiceById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== ENQUIRIES ====================
app.post('/api/enquiries', async (req, res) => {
  try {
    const { name, email, phone, subject, message, category, brand } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and Phone number are required' });
    }
    if (isMongoConnected()) {
      const enquiry = await Enquiry.create({ name, email, phone, subject, message, category, brand });
      return res.status(201).json({
        success: true,
        message: 'Enquiry received. Our engineering team will contact you shortly.',
        data: enquiry
      });
    }
    const enquiry = store.addEnquiry({ name, email, phone, subject, message, category, brand });
    res.status(201).json({ success: true, message: 'Enquiry received. Our engineering team will contact you shortly.', data: enquiry });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/enquiries', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    if (isMongoConnected()) {
      const query = status && status !== 'all' ? { status: new RegExp(`^${status}$`, 'i') } : {};
      const list = await Enquiry.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: list.length, data: list });
    }
    const list = store.getEnquiries(status);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/enquiries/:id', authMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (isMongoConnected()) {
      const update = {};
      if (status) update.status = status;
      if (notes !== undefined) update.notes = notes;
      const updated = await Enquiry.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Enquiry not found' });
      return res.json({ success: true, data: updated });
    }
    const updated = store.updateEnquiryStatus(req.params.id, status, notes);
    if (!updated) return res.status(404).json({ success: false, message: 'Enquiry not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/enquiries/:id', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Enquiry.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Enquiry not found' });
      return res.json({ success: true, message: 'Enquiry deleted successfully' });
    }
    const deleted = store.deleteEnquiry(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Enquiry not found' });
    res.json({ success: true, message: 'Enquiry deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== SERVICE REQUESTS ====================
app.post('/api/service-requests', async (req, res) => {
  try {
    const { customerName, phone, email, serviceRequired, brand, productModel, location, problemDescription } = req.body;
    if (!customerName || !phone || !serviceRequired) {
      return res.status(400).json({ success: false, message: 'Name, Phone and Service required are mandatory' });
    }
    if (isMongoConnected()) {
      const srv = await ServiceRequest.create({
        customerName,
        phone,
        email,
        serviceRequired,
        brand,
        productModel,
        location,
        problemDescription
      });
      return res.status(201).json({
        success: true,
        message: 'Service request registered. Our certified technician will follow up.',
        data: srv
      });
    }
    const srv = store.addServiceRequest({
      customerName,
      phone,
      email,
      serviceRequired,
      brand,
      productModel,
      location,
      problemDescription
    });
    res.status(201).json({ success: true, message: 'Service request registered. Our certified technician will follow up.', data: srv });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/service-requests', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    if (isMongoConnected()) {
      const query = status && status !== 'all' ? { status: new RegExp(`^${status}$`, 'i') } : {};
      const list = await ServiceRequest.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: list.length, data: list });
    }
    const list = store.getServiceRequests(status);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/service-requests/:id', authMiddleware, async (req, res) => {
  try {
    const { status, internalNotes } = req.body;
    if (isMongoConnected()) {
      const update = {};
      if (status) update.status = status;
      if (internalNotes !== undefined) update.internalNotes = internalNotes;
      const updated = await ServiceRequest.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Service request not found' });
      return res.json({ success: true, data: updated });
    }
    const updated = store.updateServiceRequestStatus(req.params.id, status, internalNotes);
    if (!updated) return res.status(404).json({ success: false, message: 'Service request not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==================== ADMIN AUTH ====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const identifier = (req.body.email || req.body.username || '').trim().toLowerCase();
    const password = req.body.password || '';

    const adminEmail = (process.env.ADMIN_EMAIL || 'sakthi@gmail.com').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminName = process.env.ADMIN_NAME || 'Sakthi';

    if (isMongoConnected()) {
      const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, username: user.username, role: user.role, name: user.name },
        getJwtSecret(),
        { expiresIn: '7d' }
      );
      return res.json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          username: user.username,
          name: user.name,
          role: user.role,
          email: user.email
        }
      });
    }

    // Fallback mode (uses .env credentials)
    if (identifier === adminEmail && password === adminPassword) {
      const token = jwt.sign(
        { email: adminEmail, username: adminEmail, role: 'admin', name: adminName },
        getJwtSecret(),
        { expiresIn: '7d' }
      );
      return res.json({
        success: true,
        token,
        user: {
          username: adminEmail,
          name: adminName,
          role: 'admin',
          email: adminEmail
        }
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ==================== ADMIN STATS ====================
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const [totalProducts, totalBrands, enquiries, services] = await Promise.all([
        Product.countDocuments(),
        Brand.countDocuments(),
        Enquiry.find().sort({ createdAt: -1 }),
        ServiceRequest.find().sort({ createdAt: -1 })
      ]);

      return res.json({
        success: true,
        data: {
          totalProducts,
          totalBrands,
          totalEnquiries: enquiries.length,
          newEnquiries: enquiries.filter((e) => e.status === 'New').length,
          totalServiceRequests: services.length,
          pendingServices: services.filter((s) => s.status === 'Pending').length,
          recentEnquiries: enquiries.slice(0, 5),
          recentServiceRequests: services.slice(0, 5),
          database: 'mongodb'
        }
      });
    }

    const products = store.getProducts();
    const brands = store.getBrands();
    const enquiries = store.getEnquiries();
    const services = store.getServiceRequests();

    res.json({
      success: true,
      data: {
        totalProducts: products.length,
        totalBrands: brands.length,
        totalEnquiries: enquiries.length,
        newEnquiries: enquiries.filter((e) => e.status === 'New').length,
        totalServiceRequests: services.length,
        pendingServices: services.filter((s) => s.status === 'Pending').length,
        recentEnquiries: enquiries.slice(0, 5),
        recentServiceRequests: services.slice(0, 5),
        database: 'in-memory-fallback'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`True Power Solutions API server running on port ${PORT}`);
  });
};

startServer();
