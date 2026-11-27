import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    slug: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    permissions: [{ type: String }],
    hierarchyLevel: { type: Number, default: 5, min: 1 },
    isSystemRole: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false }
  },
  { timestamps: true, collection: 'roles' }
);

roleSchema.index({ hierarchyLevel: 1 });

roleSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Role', roleSchema);
