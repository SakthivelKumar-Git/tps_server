import mongoose from 'mongoose';

const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    inAppEnabled: { type: Boolean, default: true },
    browserPushEnabled: { type: Boolean, default: true },
    mobilePushEnabled: { type: Boolean, default: true },
    followUpAdvanceMinutes: { type: Number, default: 30, min: 5, max: 1440 },
    amcReminderIntervals: { type: [Number], default: [30, 15, 7, 1] },
    dailyUrgentAmc: { type: Boolean, default: true },
    notifyFollowUps: { type: Boolean, default: true },
    notifyAmcExpiry: { type: Boolean, default: true },
    notifyServiceAssignments: { type: Boolean, default: true },
    notifyExpenseUpdates: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'notificationPreferences' }
);

export default mongoose.model('NotificationPreference', notificationPreferenceSchema);
