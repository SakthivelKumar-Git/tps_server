import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, default: '' },
    endpoint: { type: String, required: true, unique: true, trim: true },
    keys: {
      p256dh: { type: String, default: '' },
      auth: { type: String, default: '' }
    },
    deviceType: { type: String, enum: ['desktop', 'mobile', 'pwa'], default: 'desktop' },
    userAgent: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'notificationSubscriptions' }
);

pushSubscriptionSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
