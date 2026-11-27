import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import ProductCategory from '../models/ProductCategory.js';
import Subcategory from '../models/Subcategory.js';
import Product from '../models/Product.js';

export const SUPPLIED_CATEGORIES = [
  'Grundfos',
  'TPS SPARES',
  'Save On',
  'DANFOS',
  'Wisy',
  'Other Brand',
  'Other Brand pressure pump',
  'AUTOFIL',
  'Circulation panel',
  'SINICON WLC'
];

// Confirmed subcategories explicitly present in prompt message (additional subcategories can be appended via --subcategories=file.json)
export const KNOWN_SUPPLIED_SUBCATEGORIES = [
  { name: 'CM 5-5 With 60 ltr', categoryName: 'Grundfos' },
  { name: '1 hp 1 Ph Open well Pump', categoryName: 'Other Brand pressure pump' },
  { name: 'CM 5-6 Pressure Booster Pump', categoryName: 'Grundfos' },
  { name: 'CM 3-5 Booster Pump', categoryName: 'Grundfos' },
  { name: 'GASCUT', categoryName: 'TPS SPARES' },
  { name: 'NRV 1"', categoryName: 'TPS SPARES' },
  { name: 'UPS 25-60', categoryName: 'Grundfos' },
  { name: 'CM 5-6 With 60 ltr', categoryName: 'Grundfos' },
  { name: 'Scala 1', categoryName: 'Grundfos' },
  { name: 'Twin booster panel', categoryName: 'Circulation panel' },
  { name: 'Scala2 3-45', categoryName: 'Grundfos' },
  { name: 'CMBE 3-62', categoryName: 'Grundfos' },
  { name: 'CM1-3 with 24 Ltr', categoryName: 'Grundfos' },
  { name: 'CH 2-60', categoryName: 'Grundfos' },
  { name: 'CR5-36 Vertical pump', categoryName: 'Grundfos' },
  { name: 'CR-10-6 vertical pump', categoryName: 'Grundfos' },
  { name: 'Racold heat pump 500ltr', categoryName: 'Other Brand' },
  { name: 'CM 5-5 Twin booster with 100ltrs', categoryName: 'Grundfos' },
  { name: 'Cm1-3 (928893731)', categoryName: 'Grundfos' }
];

// Exact 12 supplied products from the table (never inventing unspecified prices or codes)
export const SUPPLIED_PRODUCTS = [
  { productCode: 'KP 35', name: 'Pressure Switch', productType: 'Product', categoryName: 'TPS SPARES', subcategoryName: '', price: 1800 },
  { productCode: 'NRV', name: '1" M * F Non return value', productType: 'Spares', categoryName: 'TPS SPARES', subcategoryName: '', price: 1150 },
  { productCode: 'SES', name: 'Service Charges', productType: 'Spares', categoryName: 'TPS SPARES', subcategoryName: '', price: 700 },
  { productCode: '96939776P122400111', name: 'CM5-5 WITH 60LTR', productType: 'Product', categoryName: 'Grundfos', subcategoryName: 'CM 5-5 With 60 ltr', price: null },
  { productCode: '96939715', name: 'Cm3-5 24ltr', productType: 'Spares', categoryName: 'Grundfos', subcategoryName: 'CM 3-5 Booster Pump', price: 8720 },
  { productCode: '96939775', name: 'Cm5-4', productType: 'Product', categoryName: 'Grundfos', subcategoryName: '', price: null },
  { productCode: '96939722', name: 'Cm5-4 24ltr', productType: 'Spares', categoryName: 'Grundfos', subcategoryName: '', price: null },
  { productCode: '', name: 'Grundfos', productType: 'Product', categoryName: 'Grundfos', subcategoryName: 'Cm1-3 (928893731)', price: null },
  { productCode: '96939776', name: 'Cm5-5 60ltr', productType: 'Product', categoryName: 'Grundfos', subcategoryName: 'CM 5-5 With 60 ltr', price: null },
  { productCode: '93013371', name: 'Scala2', productType: 'Product', categoryName: 'Grundfos', subcategoryName: '', price: null },
  { productCode: '96939721', name: 'Cm5-4', productType: 'Product', categoryName: 'Grundfos', subcategoryName: '', price: null },
  { productCode: '001', name: 'CR1-27 Vertical pump', productType: 'Product', categoryName: 'Grundfos', subcategoryName: '', price: null }
];

const toSlug = (str) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const runMasterDataImport = async ({ subcategoriesOverride = null } = {}) => {
  const report = {
    categories: { created: 0, existing: 0 },
    subcategories: { created: 0, existing: 0, invalidParent: [] },
    products: { created: 0, updated: 0, pricesPreserved: 0, errors: [] }
  };

  const categoryMap = {};
  for (const name of SUPPLIED_CATEGORIES) {
    const slug = toSlug(name);
    let doc = await ProductCategory.findOne({ $or: [{ name }, { slug }] });
    if (!doc) {
      doc = await ProductCategory.create({ name, slug, status: 'Active' });
      report.categories.created += 1;
    } else {
      report.categories.existing += 1;
    }
    categoryMap[name] = doc;
  }

  const subList = Array.isArray(subcategoriesOverride) && subcategoriesOverride.length
    ? subcategoriesOverride
    : KNOWN_SUPPLIED_SUBCATEGORIES;

  const subcategoryMap = {};
  for (const sub of subList) {
    const parentName = sub.categoryName || sub.category || 'Grundfos';
    const parentDoc = categoryMap[parentName] || (await ProductCategory.findOne({ name: parentName }));
    if (!parentDoc) {
      report.subcategories.invalidParent.push(sub.name);
      continue;
    }
    const existingSub = await Subcategory.findOne({ category: parentDoc._id, name: sub.name });
    if (!existingSub) {
      const createdSub = await Subcategory.create({
        name: sub.name,
        slug: toSlug(`${parentDoc.slug}-${sub.name}`),
        category: parentDoc._id,
        categoryName: parentDoc.name,
        description: sub.description || '',
        status: 'Active'
      });
      report.subcategories.created += 1;
      subcategoryMap[`${parentDoc.name}::${sub.name}`] = createdSub;
    } else {
      report.subcategories.existing += 1;
      subcategoryMap[`${parentDoc.name}::${sub.name}`] = existingSub;
    }
  }

  for (const item of SUPPLIED_PRODUCTS) {
    const catDoc = categoryMap[item.categoryName];
    if (!catDoc) {
      report.products.errors.push(`Missing parent category ${item.categoryName} for ${item.name}`);
      continue;
    }
    const subDoc = item.subcategoryName ? subcategoryMap[`${catDoc.name}::${item.subcategoryName}`] : null;
    const matchQuery = item.productCode
      ? { productCode: item.productCode, name: item.name, category: catDoc.name }
      : { name: item.name, category: catDoc.name, subcategory: item.subcategoryName };

    const existing = await Product.findOne(matchQuery);
    if (existing) {
      const patch = {
        productType: item.productType,
        categoryRef: catDoc._id,
        subcategory: subDoc?.name || item.subcategoryName || existing.subcategory || '',
        subcategoryRef: subDoc?._id || existing.subcategoryRef || null
      };
      // Preserve manually maintained price!
      if (existing.price !== null && existing.price > 0) {
        report.products.pricesPreserved += 1;
      } else if (item.price !== null) {
        patch.price = item.price;
      }
      await Product.updateOne({ _id: existing._id }, { $set: patch });
      report.products.updated += 1;
    } else {
      const uniqueSuffix = `${toSlug(item.productCode || item.subcategoryName || item.name)}-${Math.random().toString(36).slice(2, 6)}`;
      await Product.create({
        id: `tps-prod-${uniqueSuffix}`,
        slug: `${toSlug(item.name) || 'product'}-${uniqueSuffix}`,
        productCode: item.productCode || '',
        name: item.name,
        productType: item.productType,
        brand: catDoc.name,
        category: catDoc.name,
        categoryRef: catDoc._id,
        subcategory: subDoc?.name || item.subcategoryName || '',
        subcategoryRef: subDoc?._id || null,
        price: item.price,
        unit: '',
        status: 'Active'
      });
      report.products.created += 1;
    }
  }

  const [totalCategories, totalSubcategories, totalProducts] = await Promise.all([
    ProductCategory.countDocuments({}),
    Subcategory.countDocuments({}),
    Product.countDocuments({})
  ]);

  report.counts = { totalCategories, totalSubcategories, totalProducts };
  return report;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[import:master] MONGODB_URI missing in .env');
    process.exit(1);
  }
  const argPath = process.argv.find((a) => a.startsWith('--subcategories='));
  let subOverride = null;
  if (argPath) {
    const file = argPath.split('=')[1];
    subOverride = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  mongoose
    .connect(uri, { dbName: 'true_power_solutions', serverSelectionTimeoutMS: 10000 })
    .then(async () => {
      const report = await runMasterDataImport({ subcategoriesOverride: subOverride });
      console.log('[import:master] Report:', JSON.stringify(report, null, 2));
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('[import:master] Error:', err.message);
      process.exit(1);
    });
}
