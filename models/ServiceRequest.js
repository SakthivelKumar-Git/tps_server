import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true },
    serviceRequired: { type: String, required: true, trim: true },
    brand: { type: String, default: '' },
    productModel: { type: String, default: '' },
    location: { type: String, default: '' },
    problemDescription: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
    internalNotes: { type: String, default: '' }
  },
  { timestamps: true }
);

serviceRequestSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ServiceRequest', serviceRequestSchema);
