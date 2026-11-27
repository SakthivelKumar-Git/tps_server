import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    expenseId: { type: String, required: true, unique: true, trim: true },
    title: { type: String, default: '', trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    employeeId: { type: String, required: true, trim: true },
    employeeName: { type: String, required: true, trim: true },
    department: { type: String, default: '', trim: true },
    category: {
      type: String,
      required: true,
      trim: true,
      default: 'Travel'
    },
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', default: null },
    amount: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    expenseDate: { type: Date, required: true },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Corporate Card', 'Personal Card', 'Other'],
      default: 'Cash'
    },
    vendorPayee: { type: String, default: '', trim: true },
    referenceNumber: { type: String, default: '', trim: true },
    receiptUrl: { type: String, default: '', trim: true },
    description: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    approvalStatus: {
      type: String,
      enum: ['Draft', 'Submitted', 'Pending Approval', 'Pending', 'Approved', 'Rejected', 'Paid'],
      default: 'Pending Approval'
    },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Partial', 'Paid'],
      default: 'Unpaid'
    },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidDate: { type: Date, default: null },
    paymentRef: { type: String, default: '', trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    // Petrol / service cost tracking
    expenseType: {
      type: String,
      enum: ['Petrol', 'Service Cost', 'Other'],
      default: 'Other'
    },
    kilometresTravelled: { type: Number, default: 0, min: 0 },
    ratePerKmApplied: { type: Number, default: 0, min: 0 },
    actualServiceCost: { type: Number, default: 0, min: 0 },
    serviceEnquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceEnquiry', default: null },
    auditHistory: [
      {
        action: { type: String, required: true },
        status: { type: String, default: '' },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byName: { type: String, default: 'System' },
        note: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true, collection: 'expenses' }
);

expenseSchema.index({ employee: 1, expenseDate: -1 });
expenseSchema.index({ approvalStatus: 1, expenseDate: -1 });

expenseSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Expense', expenseSchema);
