import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    shortDescription: { type: String, default: '' },
    description: { type: String, default: '' },
    features: [{ type: String }],
    icon: { type: String, default: 'Wrench' }
  },
  { timestamps: true }
);

serviceSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret.id || ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Service', serviceSchema);
