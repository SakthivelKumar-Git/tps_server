import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeId: { type: String, required: true, trim: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },
    payPeriod: { type: String, required: true, trim: true }, // e.g. '2026-11'
    basicSalary: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    incentives: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    netSalary: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Processed', 'Paid'],
      default: 'Pending'
    },
    paymentDate: { type: Date, default: null },
    paymentReference: { type: String, default: '', trim: true },
    notes: { type: String, default: '' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, collection: 'payrolls' }
);

payrollSchema.index({ employee: 1, payPeriod: 1 }, { unique: true });
payrollSchema.index({ payPeriod: -1, paymentStatus: 1 });

payrollSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Payroll', payrollSchema);
