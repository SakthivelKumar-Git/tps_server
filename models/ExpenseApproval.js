import mongoose from 'mongoose';

const expenseApprovalSchema = new mongoose.Schema(
  {
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', required: true, index: true },
    expenseId: { type: String, required: true, trim: true },
    decision: {
      type: String,
      enum: ['Submitted', 'Reviewed', 'Approved', 'Rejected', 'Paid'],
      required: true
    },
    previousStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' },
    actedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actedByName: { type: String, default: '' },
    actedByRole: { type: String, default: '' },
    reason: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'expenseApprovals' }
);

expenseApprovalSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ExpenseApproval', expenseApprovalSchema);
