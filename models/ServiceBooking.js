import mongoose from 'mongoose';

const serviceBookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true, trim: true },
    serviceEnquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceEnquiry', default: null },
    enquiryId: { type: String, default: '', trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    product: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    productModel: { type: String, default: '', trim: true },
    serviceType: { type: String, required: true, trim: true },
    serviceAddress: { type: String, default: '', trim: true },
    city: { type: String, default: 'Salem', trim: true },
    appointmentDate: { type: Date, required: true },
    appointmentTime: { type: String, default: '10:00 AM - 12:00 PM' },
    assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedTechnicianName: { type: String, default: '' },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium'
    },
    estimatedCharges: { type: Number, default: 0 },
    visitNumber: { type: Number, default: 1 },
    status: {
      type: String,
      enum: [
        'Pending Confirmation',
        'Confirmed',
        'Technician Assigned',
        'In Progress',
        'Completed',
        'Rescheduled',
        'Cancelled'
      ],
      default: 'Pending Confirmation'
    },
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'serviceBookings' }
);

serviceBookingSchema.index({ phone: 1 });
serviceBookingSchema.index({ status: 1 });
serviceBookingSchema.index({ appointmentDate: 1 });
serviceBookingSchema.index({ customer: 1 });
serviceBookingSchema.index({ serviceEnquiry: 1 });
serviceBookingSchema.index({ createdAt: -1 });

serviceBookingSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ServiceBooking', serviceBookingSchema);
