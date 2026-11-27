import mongoose from 'mongoose';

const serviceAreaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    city: { type: String, default: 'Salem', trim: true },
    pincode: { type: String, default: '', trim: true },
    zone: { type: String, default: 'Salem Metro', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
  },
  { timestamps: true, collection: 'serviceAreas' }
);

serviceAreaSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ServiceArea', serviceAreaSchema);
