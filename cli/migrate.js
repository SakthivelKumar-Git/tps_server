import 'dotenv/config';
import mongoose from 'mongoose';
import { getMigrationStatus, runMigrationsDown, runMigrationsUp } from '../utils/migrator.js';

const command = (process.argv[2] || 'status').toLowerCase();

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Migration Error: MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    dbName: 'true_power_solutions',
    serverSelectionTimeoutMS: 10000
  });

  const db = mongoose.connection.db;

  try {
    if (command === 'status') {
      const list = await getMigrationStatus(db);
      if (list.length === 0) {
        console.log('No migration files found.');
      } else {
        console.table(
          list.map((m) => ({
            Version: m.version,
            Migration: m.name,
            Status: m.status,
            Batch: m.batch ?? '-',
            AppliedAt: m.appliedAt ? new Date(m.appliedAt).toISOString() : '-'
          }))
        );
      }
    } else if (command === 'up') {
      const applied = await runMigrationsUp(db);
      console.log(
        applied.length > 0
          ? `Successfully applied ${applied.length} migration(s).`
          : 'Database schema is already up to date.'
      );
    } else if (command === 'down') {
      const stepsArg = Number(process.argv[3] || 1);
      const rolled = await runMigrationsDown(db, { steps: Number.isFinite(stepsArg) && stepsArg > 0 ? stepsArg : 1 });
      console.log(`Rolled back ${rolled.length} migration(s).`);
    } else {
      console.error(`Unknown migration command "${command}". Use: status | up | down`);
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Migration runner failed:', err.message);
  process.exit(1);
});
