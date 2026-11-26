import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import Service from '../models/Service.js';
import Enquiry from '../models/Enquiry.js';
import ServiceRequest from '../models/ServiceRequest.js';
import { seedBrands, seedProducts, seedServices } from '../data/seedData.js';

let mongoConnected = false;

export const isMongoConnected = () => mongoConnected && mongoose.connection.readyState === 1;

const seedMongoDatabase = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || 'sakthi@gmail.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const adminName = process.env.ADMIN_NAME || 'Sakthi';

  // Ensure configured admin user exists and password matches .env
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await User.findOneAndUpdate(
    { email: adminEmail },
    {
      name: adminName,
      username: adminEmail,
      email: adminEmail,
      passwordHash,
      role: 'admin'
    },
    { upsert: true, new: true }
  );

  // Seed initial catalog if empty
  if ((await Brand.countDocuments()) === 0) {
    await Brand.insertMany(seedBrands);
    console.log(`Seeded ${seedBrands.length} brands into MongoDB`);
  }

  if ((await Product.countDocuments()) === 0) {
    await Product.insertMany(seedProducts);
    console.log(`Seeded ${seedProducts.length} products into MongoDB`);
  }

  if ((await Service.countDocuments()) === 0) {
    await Service.insertMany(seedServices);
    console.log(`Seeded ${seedServices.length} services into MongoDB`);
  }

  if ((await Enquiry.countDocuments()) === 0) {
    await Enquiry.create([
      {
        name: 'Senthil Kumar',
        email: 'senthil.builders@gmail.com',
        phone: '98421 54321',
        subject: 'Grundfos Booster for 4-Floor Villa',
        message: 'We need pressure pump installation for 5 bathrooms in Swarnapuri. Kindly share pricing and technical visit schedule.',
        category: 'Pressure Pumps',
        brand: 'GRUNDFOS',
        status: 'Contacted',
        notes: 'Called customer for site inspection.'
      },
      {
        name: 'Dr. K. Rajasekaran',
        email: 'rajasekaran.ortho@yahoo.com',
        phone: '94432 11987',
        subject: '3M Water Softener for Hard Borewell Water',
        message: 'TDS is around 950 ppm in our hospital residential quarters. Need automatic water softener system sizing.',
        category: 'Water Softeners',
        brand: '3M',
        status: 'New'
      }
    ]);
  }

  if ((await ServiceRequest.countDocuments()) === 0) {
    await ServiceRequest.create({
      customerName: 'Murugesan Textile Mills',
      phone: '98940 76543',
      email: 'maintenance@murugesantextiles.com',
      serviceRequired: 'Pump Motor Servicing',
      brand: 'KOEL Electric',
      productModel: '7.5 HP Centrifugal Monobloc',
      location: 'Kandhampatty, Salem',
      problemDescription: 'Motor humming sound and bearing vibration during operation.',
      status: 'In Progress',
      internalNotes: 'Technician assigned for on-site bearing replacement.'
    });
  }
};

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/true_power_solutions';
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    mongoConnected = true;
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    await seedMongoDatabase();
  } catch (error) {
    mongoConnected = false;
    console.warn(`MongoDB connection unavailable (${error.message}). Running with in-memory store fallback.`);
  }
};
