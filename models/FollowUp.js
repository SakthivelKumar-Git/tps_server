import mongoose from 'mongoose';

const followUpSchema = new mongoose.Schema(
  {
    followUpId: { type: String, required: true, unique: true, trim: true },
    category: {
      type: String,
      enum: [
        'Lead Follow-up',
        'Customer Follow-up',
        'Service Follow-up',
        'Quotation Follow-up',
        'Warranty Follow-up',
        'AMC Renewal Follow-up'
      ],
      default: 'Lead Follow-up'
    },
    relatedModel: {
      type: String,
      enum: ['Lead', 'Customer', 'ServiceEnquiry', 'ServiceBooking', 'Warranty', 'AmcContract', 'Other'],
      default: 'Lead'
    },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedRef: { type: String, default: '', trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedEmployeeName: { type: String, default: '', trim: true },
    followUpDate: { type: Date, required: true },
    followUpTime: { type: String, default: '10:30 AM' },
    followUpType: {
      type: String,
      enum: ['Call', 'WhatsApp', 'Site Visit', 'Email', 'Meeting'],
      default: 'Call'
    },
    contactPerson: { type: String, default: '', trim: true },
    notes: { type: String, default: '' },
    outcome: { type: String, default: '' },
    nextFollowUpDate: { type: Date, default: null },
    nextFollowUpType: { type: String, default: '', trim: true },
    rescheduleHistory: [
      {
        previousDate: { type: Date, default: null },
        previousTime: { type: String, default: '' },
        newDate: { type: Date, required: true },
        newTime: { type: String, default: '' },
        rescheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        rescheduledByName: { type: String, default: 'System' },
        reason: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Upcoming', 'Pending', 'Completed', 'Missed', 'Cancelled', 'Rescheduled'],
      default: 'Upcoming'
    },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'followUps' }
);

followUpSchema.index({ followUpDate: 1 });
followUpSchema.index({ status: 1 });
followUpSchema.index({ customer: 1 });

followUpSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('FollowUp', followUpSchema);
