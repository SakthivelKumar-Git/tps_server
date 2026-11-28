import mongoose from 'mongoose';
import Counter from '../models/Counter.js';
import { isMongoConnected } from '../config/db.js';

const memoryCounters = new Map();

export const normalizePhone = (phone = '') => {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    return digits.slice(-10);
  }
  return digits || String(phone).trim();
  
};

export const nextSequenceId = async (codePrefix, session = null) => {
  const year = new Date().getFullYear();
  const key = `${codePrefix}-${year}`;

  if (isMongoConnected()) {
    const opts = { upsert: true, new: true };
    if (session) opts.session = session;
    const counter = await Counter.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      opts
    );
    return `${key}-${String(counter.seq).padStart(4, '0')}`;
  }

  const next = (memoryCounters.get(key) || 100) + 1;
  memoryCounters.set(key, next);
  return `${key}-${String(next).padStart(4, '0')}`;
};

export const syncMemoryCounterSeed = (key, value) => {
  const current = memoryCounters.get(key) || 0;
  if (value > current) memoryCounters.set(key, value);
};

export const runInTransaction = async (workFn) => {
  if (!isMongoConnected()) {
    return workFn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    });
    return result;
  } catch (err) {
    // Standalone MongoDB without replica set throws code 20 / IllegalOperation
    const msg = err?.message || '';
    if (
      err?.code === 20 ||
      err?.codeName === 'IllegalOperation' ||
      msg.includes('Transaction numbers are only allowed on a replica set') ||
      msg.includes('replica set')
    ) {
      return workFn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
};
