import mongoose from 'mongoose';

const serviceTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    category: { type: String, required: true, trim: true },
    estimatedDuration: { type: String, default: '2 Hours' },
    basePrice: { type: Number, default: 0 },
    description: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
  },
  { timestamps: true, collection: 'serviceTypes' }
);

serviceTypeSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ServiceType', serviceTypeSchema);
