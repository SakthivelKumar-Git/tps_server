import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    username: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    designation: { type: String, default: 'Executive', trim: true },
    role: {
      type: String,
      enum: [
        'Super Admin',
        'Admin',
        'Manager',
        'Senior Sales Executive',
        'Sales Executive',
        'Business Development Executive',
        'Accountant',
        'System Admin',
        'Sales Employee',
        'Service Technician'
      ],
      default: 'Sales Executive'
    },
    department: {
      type: String,
      enum: ['Administration', 'Sales', 'Business Development', 'Finance & Accounts', 'IT & Systems', 'Technical Service', 'Operations'],
      default: 'Operations'
    },
    serviceArea: { type: String, default: 'Salem City', trim: true },
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    salary: { type: Number, default: 0, min: 0 },
    salaryReference: {
      basicSalary: { type: Number, default: 0, min: 0 },
      allowances: { type: Number, default: 0, min: 0 },
      incentives: { type: Number, default: 0, min: 0 },
      deductions: { type: Number, default: 0, min: 0 }
    },
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Active', 'On Leave', 'Inactive'], default: 'Active' },
    portalAccess: { type: Boolean, default: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastPasswordResetAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'employees' }
);

employeeSchema.index({ phone: 1 });
employeeSchema.index({ email: 1 });
employeeSchema.index({ username: 1 });
employeeSchema.index({ role: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ reportingManager: 1 });

const sanitizeEmployee = (_, ret) => {
  ret.id = ret._id.toString();
  delete ret.password;
  delete ret.passwordHash;
  delete ret.passwordPlain;
  delete ret.__v;
  return ret;
};

employeeSchema.set('toJSON', { transform: sanitizeEmployee });
employeeSchema.set('toObject', { transform: sanitizeEmployee });

export default mongoose.model('Employee', employeeSchema);
