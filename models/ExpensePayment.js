import mongoose from 'mongoose';

const expensePaymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, trim: true },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    expenseId: { type: String, required: true, trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    employeeName: { type: String, default: '' },
    amountPaid: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Corporate Card', 'Other'],
      default: 'Bank Transfer'
    },
    referenceNumber: { type: String, default: '', trim: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    processedByName: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'expensePayments' }
);

expensePaymentSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ExpensePayment', expensePaymentSchema);
