import mongoose from 'mongoose';

const companySettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    companyName: { type: String, default: 'TRUE POWER SOLUTIONS' },
    proprietor: { type: String, default: 'A. LOGANATHAN B.E.' },
    email: { type: String, default: 'loganengg@gmail.com' },
    primaryPhone: { type: String, default: '9159787878' },
    secondaryPhone: { type: String, default: '9486666645' },
    whatsappNumber: { type: String, default: '919159787878' },
    address: {
      type: String,
      default: '99/87, Swarnapuri Annexe, Near ANS Dhivyam, Omalur Main Road, Kuranguchavadi, Salem – 636 004, Tamil Nadu, India.'
    },
    businessHours: { type: String, default: 'Monday – Saturday: 9:00 AM – 8:00 PM | Sunday: On-Call Support' },
    gstNumber: { type: String, default: '' },
    timeSlots: {
      type: [String],
      default: [
        '09:00 AM - 11:00 AM',
        '11:00 AM - 01:00 PM',
        '02:00 PM - 04:00 PM',
        '04:00 PM - 06:00 PM'
      ]
    },
    warrantyReminderDays: { type: Number, default: 30 },
    amcReminderDays: { type: Number, default: 30 },
    featureFlags: {
      hrManagementEnabled: { type: Boolean, default: false },
      dailyAttendance: { type: Boolean, default: false },
      attendanceReports: { type: Boolean, default: false },
      shiftManagement: { type: Boolean, default: false },
      holidayManagement: { type: Boolean, default: false },
      salaryTemplates: { type: Boolean, default: false },
      payrollGeneration: { type: Boolean, default: false },
      salaryBreakdown: { type: Boolean, default: false },
      myPayslip: { type: Boolean, default: false },
      myAttendance: { type: Boolean, default: false }
    },
    notificationSettings: {
      followUpAdvanceMinutes: { type: Number, default: 30 },
      amcReminderIntervals: { type: [Number], default: [30, 15, 7, 1] },
      dailyUrgentAmc: { type: Boolean, default: true }
    },
    // Petrol reimbursement rate for expense tracking
    petrolRatePerKm: { type: Number, default: 5, min: 0 },
    petrolRateUpdatedAt: { type: Date, default: null },
    petrolRateUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    petrolRateUpdatedByName: { type: String, default: '' }
  },
  { timestamps: true, collection: 'companySettings' }
);

companySettingSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('CompanySetting', companySettingSchema);
