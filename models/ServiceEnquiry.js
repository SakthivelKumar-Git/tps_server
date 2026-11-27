import mongoose from 'mongoose';

const serviceEnquirySchema = new mongoose.Schema(
  {
    enquiryId: { type: String, required: true, unique: true, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    company: { type: String, default: '', trim: true },
    altPhone: { type: String, default: '', trim: true },
    referralType: { type: String, default: 'None', trim: true },
    referralName: { type: String, default: '', trim: true },
    referralMobile: { type: String, default: '', trim: true },
    referral: { type: String, default: '', trim: true },
    serviceAddress: { type: String, default: '', trim: true },
    city: { type: String, default: 'Salem', trim: true },
    pincode: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    showPurchasedOnly: { type: Boolean, default: false },
    brand: { type: String, default: '', trim: true },
    productCategory: { type: String, default: 'Pressure Pump Service', trim: true },
    subcategory: { type: String, default: '', trim: true },
    productModel: { type: String, default: '', trim: true },
    serialNumber: { type: String, default: '', trim: true },
    selectedProducts: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
        productName: { type: String, trim: true, default: '' },
        category: { type: String, trim: true, default: '' },
        subcategory: { type: String, trim: true, default: '' },
        brand: { type: String, trim: true, default: '' },
        serialNumber: { type: String, trim: true, default: '' }
      }
    ],
    serviceType: { type: String, required: true, trim: true },
    serviceDate: { type: Date, default: null },
    problemDescription: { type: String, default: '' },
    remarks: { type: String, default: '' },
    specialInstructions: { type: String, default: '' },
    estimatedCost: { type: Number, default: 0 },
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
    dealerName: { type: String, default: '', trim: true },
    preferredDate: { type: Date, default: null },
    preferredTimeSlot: { type: String, default: '' },
    productImage: { type: String, default: '' },
    receiptUrl: { type: String, default: '' },
    additionalNotes: { type: String, default: '' },
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedTechnicianName: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium'
    },
    status: {
      type: String,
      enum: [
        'New',
        'Pending Review',
        'Contacted',
        'Appointment Scheduled',
        'Assigned',
        'Accepted',
        'In Progress',
        'On Hold',
        'Waiting for Parts',
        'Completed',
        'Cancelled',
        'Rejected'
      ],
      default: 'New'
    },
    approvalStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    internalNotes: { type: String, default: '' },
    notesList: [
      {
        text: { type: String, required: true },
        addedBy: { type: String, default: 'Admin' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    source: { type: String, default: 'Website' },
    submissionToken: { type: String, sparse: true, unique: true }
  },
  { timestamps: true, collection: 'serviceEnquiries' }
);

serviceEnquirySchema.index({ phone: 1 });
serviceEnquirySchema.index({ email: 1 });
serviceEnquirySchema.index({ status: 1 });
serviceEnquirySchema.index({ customer: 1 });
serviceEnquirySchema.index({ createdAt: -1 });

serviceEnquirySchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    ret.serviceRequired = ret.serviceType; // compatibility alias
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ServiceEnquiry', serviceEnquirySchema);
