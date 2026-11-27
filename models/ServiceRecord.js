import mongoose from 'mongoose';

const partReplacedSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    unitCost: { type: Number, default: 0 }
  },
  { _id: false }
);

const serviceRecordSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true, unique: true, trim: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceBooking', default: null },
    bookingId: { type: String, default: '', trim: true },
    serviceEnquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceEnquiry', default: null },
    serviceEnquiryId: { type: String, default: '', trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    serialNumber: { type: String, default: '', trim: true },
    technician: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    technicianName: { type: String, default: '', trim: true },
    serviceDate: { type: Date, default: Date.now },
    customerComplaint: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    workPerformed: { type: String, required: true },
    partsReplaced: [partReplacedSchema],
    labourCharges: { type: Number, default: 0 },
    partsCharges: { type: Number, default: 0 },
    totalCharges: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Partial', 'Warranty Covered', 'AMC Covered'],
      default: 'Paid'
    },
    nextServiceDate: { type: Date, default: null },
    technicianRemarks: { type: String, default: '' },
    serviceReportUrl: { type: String, default: '' },
    receiptNumber: { type: String, default: '', trim: true },
    receiptUrl: { type: String, default: '' },
    isClosed: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedByName: { type: String, default: '' }
  },
  { timestamps: true, collection: 'serviceRecords' }
);

serviceRecordSchema.index({ customer: 1 });
serviceRecordSchema.index({ booking: 1 });
serviceRecordSchema.index({ serviceDate: -1 });
serviceRecordSchema.index({ paymentStatus: 1 });

serviceRecordSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ServiceRecord', serviceRecordSchema);
