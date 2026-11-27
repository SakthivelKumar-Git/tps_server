import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Permission from '../models/Permission.js';
import Employee from '../models/Employee.js';
import { PERMISSIONS_CATALOG, SYSTEM_ROLES, normalizeRoleName } from '../config/rbac.js';
import { nextSequenceId } from '../utils/sequence.js';

const BCRYPT_COST = 12;

export const syncRbacCatalog = async () => {
  for (const perm of PERMISSIONS_CATALOG) {
    await Permission.updateOne(
      { key: perm.key },
      { $set: { module: perm.module, action: perm.action, description: perm.description } },
      { upsert: true }
    );
  }

  for (const r of SYSTEM_ROLES) {
    const existingRole = await Role.findOne({ name: r.name });
    if (!existingRole) {
      await Role.create(r);
    } else {
      // Preserve custom modifications to non-Super Admin roles if already migrated to dot-notation;
      // otherwise populate canonical keys alongside hierarchy metadata cleanly.
      const hasDotPerms = (existingRole.permissions || []).some((p) => p.includes('.') || p === '*');
      await Role.updateOne(
        { _id: existingRole._id },
        {
          $set: {
            slug: r.slug,
            hierarchyLevel: r.hierarchyLevel,
            isSystemRole: true,
            isSystem: true,
            ...(r.name === 'Super Admin' || !hasDotPerms ? { permissions: r.permissions, description: r.description } : {})
          }
        }
      );
    }
  }
};

const ensureEmployeeForSeedUser = async ({ name, email, username, phone, role, designation, department, existingMatch }) => {
  let emp = existingMatch || (await Employee.findOne({ $or: [{ email }, { username }] }));
  if (emp) {
    const updates = {};
    if (!emp.designation && designation) updates.designation = designation;
    if (role && emp.role !== role && ['Super Admin', 'Admin', 'Accountant'].includes(role)) {
      updates.role = role;
      updates.designation = designation;
      if (department) updates.department = department;
    }
    if (email && !emp.email) updates.email = email;
    if (Object.keys(updates).length > 0) {
      await Employee.updateOne({ _id: emp._id }, { $set: updates });
      emp = await Employee.findById(emp._id);
    }
    return emp;
  }

  const employeeId = await nextSequenceId('TPS-EMP');
  emp = await Employee.create({
    employeeId,
    name,
    email,
    username,
    phone: phone || '0000000000',
    designation,
    role,
    department: department || 'Operations',
    status: 'Active',
    portalAccess: true
  });
  return emp;
};

export const seedAdminUser = async () => {
  await syncRbacCatalog();

  const tempPassword = process.env.INITIAL_TEMP_PASSWORD || 'Tps@123';
  const tempPasswordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);

  const initialUsers = [
    {
      name: 'A. Loganathan',
      email: 'loganathan@tps.in',
      username: 'loganathan@tps.in',
      designation: 'Managing Director (MD)',
      role: 'Super Admin',
      department: 'Administration',
      altEmpLookup: { $or: [{ email: 'loganengg@gmail.com' }, { name: /Loganathan/i }] },
      mustChangePassword: true
    },
    {
      name: process.env.ADMIN_NAME || 'Sakthi',
      email: (process.env.ADMIN_EMAIL || 'sakthi@gmail.com').trim().toLowerCase(),
      username: (process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || 'sakthi@gmail.com').trim().toLowerCase(),
      designation: 'Admin',
      role: 'Admin',
      department: 'Operations',
      altEmpLookup: { email: 'sakthi@gmail.com' },
      mustChangePassword: true
    },
    {
      name: 'Sridhar',
      email: 'sridhar@tps.in',
      username: 'sridhar@tps.in',
      designation: 'Accountant',
      role: 'Accountant',
      department: 'Finance & Accounts',
      altEmpLookup: { $or: [{ email: 'sridhar@tps.in' }, { name: /^Sridhar$/i }] },
      mustChangePassword: true
    }
  ];

  const results = [];

  for (const cfg of initialUsers) {
    const roleDoc = await Role.findOne({ name: cfg.role });
    const existingEmp = cfg.altEmpLookup ? await Employee.findOne(cfg.altEmpLookup) : null;
    const emp = await ensureEmployeeForSeedUser({
      name: cfg.name,
      email: cfg.email,
      username: cfg.username,
      phone: existingEmp?.phone || '',
      role: cfg.role,
      designation: cfg.designation,
      department: cfg.department,
      existingMatch: existingEmp
    });

    const existingUser = await User.findOne({
      $or: [{ email: cfg.email }, { username: cfg.username }]
    });

    if (existingUser) {
      // NEVER overwrite existing passwordHash! Synchronize RBAC role/designation/employee linkage only.
      await User.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            role: cfg.role,
            designation: cfg.designation,
            department: cfg.department,
            roleId: roleDoc?._id || existingUser.roleId || null,
            roleRef: roleDoc?._id || existingUser.roleRef || null,
            employeeId: emp.employeeId,
            employeeRef: emp._id
          }
        }
      );
      await Employee.updateOne(
        { _id: emp._id },
        { $set: { userRef: existingUser._id, userId: existingUser._id } }
      );
      results.push({ email: cfg.email, role: cfg.role, status: 'preserved' });
    } else {
      const created = await User.create({
        name: cfg.name,
        username: cfg.username,
        email: cfg.email,
        phone: emp.phone || '',
        passwordHash: tempPasswordHash,
        designation: cfg.designation,
        department: cfg.department,
        employeeId: emp.employeeId,
        role: cfg.role,
        roleId: roleDoc?._id || null,
        roleRef: roleDoc?._id || null,
        employeeRef: emp._id,
        isActive: true,
        portalAccess: true,
        mustChangePassword: cfg.mustChangePassword
      });
      await Employee.updateOne(
        { _id: emp._id },
        { $set: { userRef: created._id, userId: created._id } }
      );
      results.push({ email: cfg.email, role: cfg.role, status: 'created' });
    }
  }

  // Ensure every remaining existing employee has an appropriate non-admin User login (preserving data cleanly)
  const allEmployees = await Employee.find({});
  for (const emp of allEmployees) {
    const email = (emp.email || `${emp.employeeId.toLowerCase()}@tps.local`).trim().toLowerCase();
    const username = (emp.username || email).trim().toLowerCase();
    const mappedRole = normalizeRoleName(emp.role);
    const safeRole =
      mappedRole === 'Super Admin' || mappedRole === 'Admin'
        ? mappedRole
        : mappedRole || 'Sales Executive';
    const roleDoc = await Role.findOne({ name: safeRole });

    const linkedUser =
      (emp.userRef ? await User.findById(emp.userRef) : null) ||
      (await User.findOne({ $or: [{ email }, { username }] }));

    if (!linkedUser) {
      const createdEmpUser = await User.create({
        name: emp.name,
        username,
        email,
        phone: emp.phone || '',
        passwordHash: tempPasswordHash,
        designation: emp.designation || safeRole,
        department: emp.department || 'Operations',
        employeeId: emp.employeeId,
        role: safeRole,
        roleId: roleDoc?._id || null,
        roleRef: roleDoc?._id || null,
        employeeRef: emp._id,
        isActive: emp.status === 'Active',
        portalAccess: emp.portalAccess !== false,
        mustChangePassword: true
      });
      await Employee.updateOne(
        { _id: emp._id },
        { $set: { userRef: createdEmpUser._id, userId: createdEmpUser._id, role: safeRole } }
      );
      results.push({ email, role: safeRole, status: 'created_employee_user' });
    } else if (!emp.userRef || !emp.userId) {
      await Employee.updateOne(
        { _id: emp._id },
        { $set: { userRef: linkedUser._id, userId: linkedUser._id } }
      );
    }
  }

  console.log('[seed:users] RBAC roles & accounts synced:', results.map((r) => `${r.email}(${r.role}:${r.status})`).join(', '));
  return { status: 'synced', results };
};

// Standalone CLI execution: npm run seed:users
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[seed:users] Failed: MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  mongoose
    .connect(uri, { dbName: 'true_power_solutions', serverSelectionTimeoutMS: 10000 })
    .then(async () => {
      await seedAdminUser();
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('[seed:users] Error:', err.message);
      process.exit(1);
    });
}
