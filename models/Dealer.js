import mongoose from 'mongoose';

const dealerSchema = new mongoose.Schema(
  {
    dealerId: { type: String, required: true, unique: true, trim: true },
    dealerCode: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
    dealerName: { type: String, required: true, trim: true },
    businessName: { type: String, required: true, trim: true },
    company: { type: String, default: '', trim: true },
    commissionRate: { type: Number, default: 0, min: 0, max: 100 },
    contactPerson: { type: String, default: '', trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: 'Salem', trim: true },
    pincode: { type: String, default: '', trim: true },
    gstNumber: { type: String, default: '', trim: true },
    brandsCarried: [{ type: String }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'dealers' }
);

dealerSchema.index({ phone: 1 });
dealerSchema.index({ email: 1 });
dealerSchema.index({ status: 1 });

dealerSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Dealer', dealerSchema);
