import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    productCode: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    productType: { type: String, enum: ['Product', 'Spares', 'Accessory', 'Service', ''], default: 'Product' },
    brand: { type: String, default: '', trim: true },
    category: { type: String, required: true, trim: true },
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', default: null },
    subcategory: { type: String, default: '', trim: true },
    subcategoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', default: null },
    model: { type: String, default: '', trim: true },
    unit: { type: String, default: '', trim: true },
    price: { type: Number, default: null },
    availability: {
      type: String,
      enum: ['In Stock', 'Made to Order', 'Out of Stock'],
      default: 'In Stock'
    },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    featured: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    image: { type: String, default: '/assets/images/pump-hero.jpg' },
    shortDescription: { type: String, default: '' },
    overview: { type: String, default: '' },
    keyFeatures: [{ type: String }],
    technicalSpecifications: { type: mongoose.Schema.Types.Mixed, default: {} },
    applications: [{ type: String }],
    installationInfo: { type: String, default: '' },
    warrantyInfo: { type: String, default: '' }
  },
  { timestamps: true, collection: 'products' }
);

productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });

productSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret.id || ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Product', productSchema);
