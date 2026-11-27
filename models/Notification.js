import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'New Lead',
        'New Service Enquiry',
        'New Booking',
        'Appointment Reminder',
        'Follow-up Due',
        'Follow-up Reminder',
        'Follow-up Rescheduled',
        'Overdue Follow-up',
        'Warranty Expiring',
        'Warranty Expired',
        'AMC Expiring',
        'AMC Expired',
        'Service Completed',
        'Service Assigned',
        'Payslip Available',
        'Expense Update',
        'Payroll Updated',
        'Permission Updated',
        'System Alert',
        'System Test'
      ],
      required: true
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    relatedModel: { type: String, default: '' },
    relatedId: { type: String, default: '' },
    link: { type: String, default: '/admin/dashboard' },
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    recipientEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    targetRoles: [{ type: String }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    scheduledFor: { type: Date, default: null },
    isCancelled: { type: Boolean, default: false },
    pushDispatched: { type: Boolean, default: false },
    isRead: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dedupeKey: { type: String, sparse: true, unique: true }
  },
  { timestamps: true, collection: 'notifications' }
);

notificationSchema.index({ isRead: 1, createdAt: -1 });

notificationSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Notification', notificationSchema);
