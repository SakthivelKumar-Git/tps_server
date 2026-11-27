import mongoose from 'mongoose';

const ownedProductSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, trim: true, required: true },
    brand: { type: String, trim: true, default: '' },
    model: { type: String, trim: true, default: '' },
    serialNumber: { type: String, trim: true, default: '' },
    purchaseDate: { type: Date, default: null },
    installationDate: { type: Date, default: null },
    notes: { type: String, default: '' }
  },
  { _id: true }
);

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    addedBy: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    normalizedPhone: { type: String, required: true, unique: true, trim: true },
    altPhone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    company: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: 'Salem', trim: true },
    pincode: { type: String, default: '', trim: true },
    customerType: {
      type: String,
      enum: ['Residential', 'Commercial', 'Industrial', 'Builder', 'Institutional'],
      default: 'Residential'
    },
    referralType: {
      type: String,
      enum: ['None', 'Customer', 'Dealer', 'Employee', 'Website', 'Other', ''],
      default: 'None'
    },
    referralName: { type: String, default: '', trim: true },
    referralMobile: { type: String, default: '', trim: true },
    gstNumber: { type: String, default: '', trim: true },
    assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedEmployeeName: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '', trim: true },
    ownedProducts: [ownedProductSchema],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    notesList: [noteSchema],
    sourceLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null }
  },
  { timestamps: true, collection: 'customers' }
);

customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ createdAt: -1 });

customerSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Customer', customerSchema);
