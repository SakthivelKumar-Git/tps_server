import express from 'express';
import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import Service from '../models/Service.js';
import ProductCategory from '../models/ProductCategory.js';
import Subcategory from '../models/Subcategory.js';
import ServiceCategory from '../models/ServiceCategory.js';
import ServiceType from '../models/ServiceType.js';
import ServiceArea from '../models/ServiceArea.js';
import Dealer from '../models/Dealer.js';
import Employee from '../models/Employee.js';
import CompanySetting from '../models/CompanySetting.js';
import { isMongoConnected } from '../config/db.js';
import { store } from '../store/inMemoryStore.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { escapeRegex, stripImmutableFields } from '../utils/crmHelpers.js';

const router = express.Router();

const buildIdOrSlugQuery = (param) => {
  const conditions = [{ id: param }, { slug: param }];
  if (mongoose.Types.ObjectId.isValid(param)) conditions.push({ _id: param });
  return { $or: conditions };
};

const buildIdQuery = (param) => {
  const conditions = [{ id: param }];
  if (mongoose.Types.ObjectId.isValid(param)) conditions.push({ _id: param });
  return { $or: conditions };
};

router.get('/company', async (_req, res) => {
  try {
    if (isMongoConnected()) {
      let settings = await CompanySetting.findOne({ key: 'default' });
      if (!settings) settings = await CompanySetting.create({ key: 'default' });
      return res.json({ success: true, data: settings.toJSON() });
    }
    res.json({ success: true, data: store.companySettings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Unified dropdowns from MongoDB so forms never hardcode brands/products/services
router.get('/master/dropdowns', async (_req, res) => {
  try {
    if (isMongoConnected()) {
      const [brands, products, productCategories, subcategories, serviceCategories, serviceTypes, serviceAreas, dealers, employees, settings] =
        await Promise.all([
          Brand.find({ status: { $ne: 'Inactive' } }).sort({ name: 1 }),
          Product.find({ status: { $ne: 'Inactive' } }).sort({ name: 1 }),
          ProductCategory.find({ status: 'Active' }).sort({ name: 1 }),
          Subcategory.find({ status: 'Active' }).sort({ name: 1 }),
          ServiceCategory.find({ status: 'Active' }).sort({ name: 1 }),
          ServiceType.find({ status: 'Active' }).sort({ name: 1 }),
          ServiceArea.find({ status: 'Active' }).sort({ name: 1 }),
          Dealer.find({ status: 'Active' }).sort({ businessName: 1 }),
          Employee.find({ status: 'Active' }).sort({ name: 1 }),
          CompanySetting.findOne({ key: 'default' })
        ]);
      return res.json({
        success: true,
        data: {
          brands,
          products,
          productCategories,
          subcategories,
          serviceCategories,
          serviceTypes,
          serviceAreas,
          dealers,
          employees,
          technicians: employees.filter((e) => e.role === 'Service Technician' || e.department === 'Technical Service'),
          timeSlots: settings?.timeSlots || store.companySettings.timeSlots
        }
      });
    }

    res.json({
      success: true,
      data: {
        brands: store.brands,
        products: store.products,
        productCategories: store.productCategories,
        serviceCategories: store.serviceCategories,
        serviceTypes: store.serviceTypes,
        serviceAreas: store.serviceAreas,
        employees: store.employees,
        technicians: store.employees.filter((e) => e.role === 'Service Technician' || e.department === 'Technical Service'),
        timeSlots: store.companySettings.timeSlots
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== BRANDS ====================
router.get('/brands', async (_req, res) => {
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

router.get('/brands/:id', async (req, res) => {
  try {
    if (isMongoConnected()) {
      const brand = await Brand.findOne({
        $or: [
          { id: req.params.id },
          { name: new RegExp(`^${escapeRegex(req.params.id)}$`, 'i') },
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

router.post('/brands', authMiddleware, requirePermission('master:create'), async (req, res) => {
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

router.put('/brands/:id', authMiddleware, requirePermission('master:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (isMongoConnected()) {
      const brand = await Brand.findOneAndUpdate(buildIdQuery(req.params.id), update, { new: true });
      if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
      return res.json({ success: true, data: brand });
    }
    const brand = store.updateBrand(req.params.id, update);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: brand });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/brands/:id', authMiddleware, requirePermission('master:delete'), async (req, res) => {
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
router.get('/products', async (req, res) => {
  try {
    const { brand, category, search, featured, status } = req.query;
    if (isMongoConnected()) {
      const query = {};
      if (brand && brand !== 'All') query.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
      if (category && category !== 'All') query.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
      if (status && status !== 'All') query.status = status;
      if (featured !== undefined) query.featured = featured === 'true';
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        query.$or = [
          { name: regex },
          { brand: regex },
          { category: regex },
          { model: regex },
          { shortDescription: regex }
        ];
      }
      const products = await Product.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, count: products.length, data: products });
    }
    let products = store.getProducts({ brand, category, search, featured: featured ? featured === 'true' : undefined });
    if (status && status !== 'All') products = products.filter((p) => p.status === status);
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/products/:id', async (req, res) => {
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

router.post('/products', authMiddleware, requirePermission('master:create'), async (req, res) => {
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

router.post('/products/bulk-import', authMiddleware, requirePermission('master:create'), async (req, res) => {
  try {
    if (!isMongoConnected()) return res.status(503).json({ success: false, message: 'MongoDB required' });
    const rows = Array.isArray(req.body.products) ? req.body.products : [];
    if (!rows.length) return res.status(400).json({ success: false, message: 'Provide a non-empty products array.' });
    let created = 0;
    let updated = 0;
    const errors = [];
    for (const row of rows) {
      try {
        const name = String(row.name || '').trim();
        const categoryName = String(row.category || 'Grundfos').trim();
        if (!name) continue;
        const catDoc = await ProductCategory.findOne({ name: new RegExp(`^${escapeRegex(categoryName)}$`, 'i') });
        const subName = String(row.subcategory || '').trim();
        const subDoc = subName && catDoc ? await Subcategory.findOne({ category: catDoc._id, name: new RegExp(`^${escapeRegex(subName)}$`, 'i') }) : null;
        const code = String(row.productCode || '').trim();
        const existing = code
          ? await Product.findOne({ productCode: code })
          : await Product.findOne({ name, category: catDoc?.name || categoryName, subcategory: subName });

        if (existing) {
          // Never overwrite manually maintained non-zero prices
          const patch = {
            productType: row.productType || existing.productType || 'Product',
            category: catDoc?.name || categoryName,
            categoryRef: catDoc?._id || existing.categoryRef,
            subcategory: subDoc?.name || subName || existing.subcategory,
            subcategoryRef: subDoc?._id || existing.subcategoryRef,
            unit: row.unit ?? existing.unit
          };
          if ((existing.price === null || existing.price === 0) && row.price !== undefined && row.price !== null && row.price !== '') {
            patch.price = Number(row.price);
          }
          await Product.updateOne({ _id: existing._id }, { $set: patch });
          updated += 1;
        } else {
          const id = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 5)}`;
          await Product.create({
            id,
            slug,
            productCode: code,
            name,
            productType: row.productType || 'Product',
            brand: row.brand || catDoc?.name || categoryName,
            category: catDoc?.name || categoryName,
            categoryRef: catDoc?._id || null,
            subcategory: subDoc?.name || subName,
            subcategoryRef: subDoc?._id || null,
            unit: row.unit || '',
            price: row.price !== undefined && row.price !== null && row.price !== '' ? Number(row.price) : null,
            status: row.status || 'Active'
          });
          created += 1;
        }
      } catch (e) {
        errors.push({ name: row?.name, error: e.message });
      }
    }
    res.json({ success: true, data: { created, updated, errors } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/products/:id', authMiddleware, requirePermission('master:edit'), async (req, res) => {
  try {
    const update = stripImmutableFields(req.body);
    if (isMongoConnected()) {
      const product = await Product.findOneAndUpdate(buildIdOrSlugQuery(req.params.id), update, { new: true });
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      return res.json({ success: true, data: product });
    }
    const product = store.updateProduct(req.params.id, update);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/products/:id', authMiddleware, requirePermission('master:delete'), async (req, res) => {
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

// ==================== PUBLIC SERVICES ====================
router.get('/services', async (_req, res) => {
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

router.get('/services/:id', async (req, res) => {
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

// ==================== GENERIC MASTER LISTS (Categories, Types, Areas) ====================
const registerMasterCrud = (pathName, Model, storeKey, makeSlug = false) => {
  router.get(`/master/${pathName}`, authMiddleware, async (_req, res) => {
    try {
      if (isMongoConnected()) {
        const list = await Model.find().sort({ name: 1 });
        return res.json({ success: true, data: list });
      }
      res.json({ success: true, data: store[storeKey] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post(`/master/${pathName}`, authMiddleware, requirePermission('master:create'), async (req, res) => {
    try {
      const payload = { ...req.body };
      if (makeSlug && payload.name && !payload.slug) {
        payload.slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }
      if (isMongoConnected()) {
        const created = await Model.create(payload);
        return res.status(201).json({ success: true, data: created });
      }
      const created = { ...payload, id: `${pathName}-${Date.now()}`, status: payload.status || 'Active' };
      store[storeKey].unshift(created);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  router.put(`/master/${pathName}/:id`, authMiddleware, requirePermission('master:edit'), async (req, res) => {
    try {
      const update = stripImmutableFields(req.body);
      if (isMongoConnected()) {
        const updated = await Model.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: 'Record not found' });
        return res.json({ success: true, data: updated });
      }
      const idx = store[storeKey].findIndex((x) => x.id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Record not found' });
      store[storeKey][idx] = { ...store[storeKey][idx], ...update };
      res.json({ success: true, data: store[storeKey][idx] });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  router.delete(`/master/${pathName}/:id`, authMiddleware, requirePermission('master:delete'), async (req, res) => {
    try {
      if (isMongoConnected()) {
        const deleted = await Model.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: 'Record not found' });
        return res.json({ success: true, message: 'Deleted successfully' });
      }
      const idx = store[storeKey].findIndex((x) => x.id === req.params.id);
      if (idx === -1) return res.status(404).json({ success: false, message: 'Record not found' });
      store[storeKey].splice(idx, 1);
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
};

registerMasterCrud('product-categories', ProductCategory, 'productCategories', true);
registerMasterCrud('subcategories', Subcategory, 'productCategories', true);
registerMasterCrud('service-categories', ServiceCategory, 'serviceCategories', true);
registerMasterCrud('service-types', ServiceType, 'serviceTypes', false);
registerMasterCrud('service-areas', ServiceArea, 'serviceAreas', false);

export default router;
