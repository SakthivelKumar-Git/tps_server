import mongoose from 'mongoose';

const amcContractSchema = new mongoose.Schema(
  {
    amcId: { type: String, required: true, unique: true, trim: true },
    agreementNumber: { type: String, required: true, unique: true, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    subcategory: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    serialNumber: { type: String, default: '', trim: true },
    serviceEnquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceEnquiry', default: null },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedEmployeeName: { type: String, default: '', trim: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    serviceDate: { type: Date, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    contractAmount: { type: Number, required: true, default: 0 },
    serviceFrequency: {
      type: String,
      enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual'],
      default: 'Quarterly'
    },
    nextMaintenanceDate: { type: Date, default: null },
    amcStatus: {
      type: String,
      enum: ['Active', 'Expiring Soon', 'Expired', 'Renewed', 'Cancelled'],
      default: 'Active'
    },
    renewalHistory: [
      {
        previousStartDate: { type: Date, default: null },
        previousEndDate: { type: Date, default: null },
        newStartDate: { type: Date, required: true },
        newEndDate: { type: Date, required: true },
        renewalAmount: { type: Number, default: 0 },
        renewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        renewedByName: { type: String, default: '' },
        renewedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' }
      }
    ],
    amcNotificationsSent: [
      {
        intervalKey: { type: String, default: '' },
        sentAt: { type: Date, default: Date.now }
      }
    ],
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'amcContracts' }
);

amcContractSchema.index({ customer: 1 });
amcContractSchema.index({ endDate: 1 });
amcContractSchema.index({ amcStatus: 1 });

amcContractSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('AmcContract', amcContractSchema);
