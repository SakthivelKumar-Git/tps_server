import mongoose from 'mongoose';

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', required: true, index: true },
    categoryName: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
  },
  { timestamps: true, collection: 'subcategories' }
);

subcategorySchema.index({ category: 1, name: 1 }, { unique: true });

subcategorySchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Subcategory', subcategorySchema);
