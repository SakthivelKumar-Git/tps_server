import mongoose from 'mongoose';

const payslipSchema = new mongoose.Schema(
  {
    payslipId: { type: String, required: true, unique: true, trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeId: { type: String, required: true, trim: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },
    payroll: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll', required: true },
    payPeriod: { type: String, required: true, trim: true },
    documentUrl: { type: String, default: '', trim: true },
    snapshot: {
      basicSalary: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      incentives: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 },
      netSalary: { type: Number, default: 0 },
      paymentStatus: { type: String, default: 'Paid' },
      paymentDate: { type: Date, default: null },
      paymentReference: { type: String, default: '' }
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    generatedByName: { type: String, default: '' }
  },
  { timestamps: true, collection: 'payslips' }
);

payslipSchema.index({ employee: 1, payPeriod: -1 });
payslipSchema.index({ payroll: 1 }, { unique: true });

payslipSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Payslip', payslipSchema);
