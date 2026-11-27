import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    entityRef: { type: String, default: '', trim: true },
    module: { type: String, default: 'CRM', trim: true },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, default: '', trim: true },
    targetId: { type: String, default: '', trim: true },
    targetLabel: { type: String, default: '', trim: true },
    description: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    performedByName: { type: String, default: 'System' },
    userRole: { type: String, default: '' },
    previousValues: { type: mongoose.Schema.Types.Mixed, default: null },
    newValues: { type: mongoose.Schema.Types.Mixed, default: null },
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '' }
  },
  { timestamps: true, collection: 'activityLogs' }
);

activityLogSchema.index({ entityType: 1, entityId: 1 });
activityLogSchema.index({ module: 1, action: 1 });
activityLogSchema.index({ performedBy: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

activityLogSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ActivityLog', activityLogSchema);
