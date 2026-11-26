import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    brand: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
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
  { timestamps: true }
);

productSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret.id || ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Product', productSchema);
