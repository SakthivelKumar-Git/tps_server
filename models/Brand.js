import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    tagline: { type: String, default: '' },
    origin: { type: String, default: '' },
    authorizedPartner: { type: Boolean, default: true },
    logoUrl: { type: String, default: '' },
    categories: [{ type: String }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
  },
  { timestamps: true, collection: 'brands' }
);

brandSchema.index({ name: 1 });

brandSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret.id || ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Brand', brandSchema);
