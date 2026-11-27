import mongoose from 'mongoose';

const warrantySchema = new mongoose.Schema(
  {
    warrantyId: { type: String, required: true, unique: true, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    subcategory: { type: String, default: '', trim: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, default: '', trim: true },
    serialNumber: { type: String, required: true, trim: true },
    serviceEnquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceEnquiry', default: null },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedEmployeeName: { type: String, default: '', trim: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    inquiryDate: { type: Date, default: null },
    purchaseDate: { type: Date, required: true },
    installationDate: { type: Date, default: null },
    warrantyStart: { type: Date, required: true },
    warrantyEnd: { type: Date, required: true },
    warrantyStatus: {
      type: String,
      enum: ['Active', 'Expiring Soon', 'Expired', 'Void'],
      default: 'Active'
    },
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'warranties' }
);

warrantySchema.index({ customer: 1 });
warrantySchema.index({ warrantyEnd: 1 });
warrantySchema.index({ warrantyStatus: 1 });
warrantySchema.index({ serialNumber: 1 });

warrantySchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Warranty', warrantySchema);
