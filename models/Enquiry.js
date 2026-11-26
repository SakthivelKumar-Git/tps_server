import mongoose from 'mongoose';

const enquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true },
    phone: { type: String, required: true, trim: true },
    subject: { type: String, default: '', trim: true },
    message: { type: String, default: '' },
    category: { type: String, default: 'General' },
    brand: { type: String, default: 'General' },
    status: { type: String, enum: ['New', 'Contacted', 'Closed'], default: 'New' },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

enquirySchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Enquiry', enquirySchema);
