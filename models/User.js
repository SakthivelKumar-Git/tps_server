import mongoose from 'mongoose';

const permissionHistoryEntry = new mongoose.Schema(
  {
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedByName: { type: String, default: 'System' },
    action: { type: String, default: 'UPDATE_ACCESS' },
    permissionsAdded: [{ type: String }],
    permissionsRemoved: [{ type: String }],
    deniedAdded: [{ type: String }],
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true },
    designation: { type: String, default: 'Staff', trim: true },
    employeeId: { type: String, default: '', trim: true },
    department: { type: String, default: 'Operations', trim: true },
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    role: {
      type: String,
      default: 'Sales Executive',
      trim: true
    },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    roleRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    employeeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    portalAccess: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    permissions: [{ type: String }],
    deniedPermissions: [{ type: String }],
    temporaryAccess: {
      permissions: [{ type: String }],
      expiresAt: { type: Date, default: null },
      grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    permissionHistory: [permissionHistoryEntry],
    tokenVersion: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    lastPasswordResetAt: { type: Date, default: null },
    // Forgot-password self-service (token stored as SHA-256 hash — NEVER plain)
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpiresAt: { type: Date, default: null },
    // Per-user UI preferences (synced to DB, restored on login)
    uiPreferences: {
      appearance: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
      theme:      { type: String, enum: ['default', 'bordered', 'semi-dark'], default: 'default' },
      navigation: { type: String, enum: ['expanded', 'collapsed'], default: 'expanded' },
      navbar:     { type: String, enum: ['sticky', 'static', 'hidden'], default: 'sticky' },
      layout:     { type: String, enum: ['compact', 'wide'], default: 'wide' },
      direction:  { type: String, enum: ['ltr', 'rtl'], default: 'ltr' }
    }
  },
  { timestamps: true, collection: 'users' }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ reportingManager: 1 });
userSchema.index({ employeeId: 1 });

const sanitizeUser = (_, ret) => {
  ret.id = ret._id.toString();
  delete ret.passwordHash;
  delete ret.password;
  delete ret.passwordPlain;
  delete ret.resetPasswordTokenHash;
  delete ret.resetPasswordExpiresAt;
  delete ret.__v;
  return ret;
};

userSchema.set('toJSON', { transform: sanitizeUser });
userSchema.set('toObject', { transform: sanitizeUser });

export default mongoose.model('User', userSchema);
