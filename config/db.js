import mongoose from 'mongoose';
import CompanySetting from '../models/CompanySetting.js';
import { seedAdminUser } from '../seeders/userSeeder.js';
import { runMigrationsUp } from '../utils/migrator.js';

let mongoConnected = false;

export const isMongoConnected = () => mongoConnected && mongoose.connection.readyState === 1;

const initializeCoreConfig = async () => {
  await seedAdminUser();

  if ((await CompanySetting.countDocuments()) === 0) {
    await CompanySetting.create({ key: 'default' });
  }
};

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('127.0.0.1') || uri.includes('localhost')) {
    console.warn('MongoDB URI not configured or using local loopback. Running in-memory fallback.');
    mongoConnected = false;
    return;
  }

  try {
    const connection = await mongoose.connect(uri, {
      dbName: 'true_power_solutions',
      serverSelectionTimeoutMS: 5000
    });
    mongoConnected = true;

    console.log(`MongoDB Atlas Connected: ${connection.connection.host}`);
    console.log(`Database: ${connection.connection.name}`);

    await runMigrationsUp(connection.connection.db);
    await initializeCoreConfig();
  } catch (error) {
    mongoConnected = false;
    console.warn('MongoDB Atlas Connection Warning:', error.message);
  }
};
