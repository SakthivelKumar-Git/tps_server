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
  if (!uri) {
    console.error('MongoDB Atlas Connection Failed:');
    console.error('MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  try {
    const connection = await mongoose.connect(uri, {
      dbName: 'true_power_solutions',
      serverSelectionTimeoutMS: 10000
    });
    mongoConnected = true;

    console.log(`MongoDB Atlas Connected: ${connection.connection.host}`);
    console.log(`Database: ${connection.connection.name}`);

    await runMigrationsUp(connection.connection.db);
    await initializeCoreConfig();
  } catch (error) {
    mongoConnected = false;
    console.error('MongoDB Atlas Connection Failed:');
    console.error(error.message);
    process.exit(1);
  }
};
