import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeId: { type: String, required: true, trim: true },
    employeeName: { type: String, default: '', trim: true },
    date: { type: String, required: true, trim: true }, // YYYY-MM-DD
    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    workingHours: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Checked In', 'Present', 'Half Day', 'Absent', 'On Leave'],
      default: 'Checked In'
    },
    location: { type: String, default: '', trim: true },
    notes: { type: String, default: '' }
  },
  { timestamps: true, collection: 'attendances' }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: -1 });
attendanceSchema.index({ employeeId: 1, date: -1 });

attendanceSchema.set('toJSON', {
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('Attendance', attendanceSchema);
