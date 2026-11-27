import mongoose from 'mongoose';

const communicationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Call', 'WhatsApp', 'Email', 'Site Visit', 'Note'], default: 'Note' },
    summary: { type: String, required: true },
    by: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    leadId: { type: String, required: true, unique: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    normalizedPhone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    company: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: 'Salem', trim: true },
    referralType: { type: String, default: 'None', trim: true },
    referralName: { type: String, default: '', trim: true },
    referralMobile: { type: String, default: '', trim: true },
    enquiryType: {
      type: String,
      enum: ['Product Enquiry', 'Project Consultation', 'Quotation Request', 'Dealer Enquiry', 'General'],
      default: 'Product Enquiry'
    },
    category: { type: String, default: 'Pressure Pumps', trim: true },
    subcategory: { type: String, default: '', trim: true },
    subcategoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', default: null },
    brand: { type: String, default: 'GRUNDFOS', trim: true },
    product: { type: String, default: '', trim: true },
    productRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
    dealerName: { type: String, default: '', trim: true },
    inquiryDate: { type: Date, default: Date.now },
    subject: { type: String, default: '', trim: true },
    message: { type: String, default: '' },
    leadSource: {
      type: String,
      enum: ['Website', 'WhatsApp', 'Phone Call', 'Walk-in', 'Referral', 'Dealer', 'IndiaMART', 'Direct'],
      default: 'Website'
    },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedEmployeeName: { type: String, default: '' },
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
        'Contacted',
        'Qualified',
        'Interested',
        'Quotation',
        'Quotation Sent',
        'Negotiation',
        'Won',
        'Converted',
        'Lost',
        'Cancelled'
      ],
      default: 'New'
    },
    estimatedValue: { type: Number, default: 0 },
    expectedCloseDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    notesList: [
      {
        text: { type: String, required: true },
        addedBy: { type: String, default: 'Admin' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    communications: [communicationSchema],
    convertedCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    convertedAt: { type: Date, default: null },
    submissionToken: { type: String, sparse: true, unique: true }
  },
  { timestamps: true, collection: 'leads' }
);

leadSchema.index({ phone: 1 });
leadSchema.index({ normalizedPhone: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: -1 });

leadSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    ret.name = ret.customerName;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Lead', leadSchema);
