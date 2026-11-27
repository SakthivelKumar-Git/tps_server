import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = typeof import.meta?.url === 'string' ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

const computeChecksum = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
};

export const loadMigrationFiles = (migrationsDir = DEFAULT_MIGRATIONS_DIR) => {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.*\.js$/i.test(file))
    .sort()
    .map((file) => {
      const fullPath = path.join(migrationsDir, file);
      const version = file.split('_')[0];
      return {
        version,
        name: file,
        fullPath,
        checksum: computeChecksum(fullPath)
      };
    });
};

const getMigrationsCollection = (db) => db.collection('migrations');

export const ensureMigrationsCollection = async (db) => {
  const col = getMigrationsCollection(db);
  await col.createIndex({ version: 1 }, { unique: true });
  return col;
};

export const getMigrationStatus = async (db, migrationsDir = DEFAULT_MIGRATIONS_DIR) => {
  const col = await ensureMigrationsCollection(db);
  const files = loadMigrationFiles(migrationsDir);
  const applied = await col.find({}).sort({ version: 1 }).toArray();
  const appliedMap = new Map(applied.map((item) => [item.version, item]));

  return files.map((file) => {
    const rec = appliedMap.get(file.version);
    return {
      version: file.version,
      name: file.name,
      status: rec ? 'applied' : 'pending',
      appliedAt: rec?.appliedAt || null,
      batch: rec?.batch || null,
      checksumMatch: rec ? rec.checksum === file.checksum : null
    };
  });
};

export const runMigrationsUp = async (db, migrationsDir = DEFAULT_MIGRATIONS_DIR) => {
  const col = await ensureMigrationsCollection(db);
  const files = loadMigrationFiles(migrationsDir);
  const applied = await col.find({}).toArray();
  const appliedVersions = new Set(applied.map((a) => a.version));
  const lastBatchDoc = await col.find({}).sort({ batch: -1 }).limit(1).toArray();
  const nextBatch = (lastBatchDoc[0]?.batch || 0) + 1;

  const executed = [];
  for (const file of files) {
    if (appliedVersions.has(file.version)) continue;

    const mod = await import(pathToFileURL(file.fullPath).href);
    if (typeof mod.up !== 'function') {
      throw new Error(`Migration ${file.name} does not export an up(db) function.`);
    }

    console.log(`[migrate:up] Applying ${file.name}...`);
    await mod.up(db);

    await col.insertOne({
      version: file.version,
      name: file.name,
      checksum: file.checksum,
      batch: nextBatch,
      appliedAt: new Date()
    });
    executed.push(file.name);
    console.log(`[migrate:up] Applied ${file.name}`);
  }

  return executed;
};

export const runMigrationsDown = async (db, { steps = 1 } = {}, migrationsDir = DEFAULT_MIGRATIONS_DIR) => {
  const col = await ensureMigrationsCollection(db);
  const applied = await col.find({}).sort({ version: -1 }).limit(steps).toArray();
  if (applied.length === 0) {
    console.log('[migrate:down] No applied migrations to rollback.');
    return [];
  }

  const filesMap = new Map(loadMigrationFiles(migrationsDir).map((f) => [f.version, f]));
  const rolledBack = [];

  for (const rec of applied) {
    const file = filesMap.get(rec.version);
    if (!file) {
      throw new Error(`Migration file missing for version ${rec.version} (${rec.name})`);
    }
    const mod = await import(pathToFileURL(file.fullPath).href);
    if (typeof mod.down !== 'function') {
      throw new Error(`Migration ${file.name} does not export a down(db) function.`);
    }

    console.log(`[migrate:down] Rolling back ${file.name}...`);
    await mod.down(db);
    await col.deleteOne({ version: rec.version });
    rolledBack.push(file.name);
    console.log(`[migrate:down] Rolled back ${file.name}`);
  }

  return rolledBack;
};
