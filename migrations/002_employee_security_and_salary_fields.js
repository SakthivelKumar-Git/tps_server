const safeCreateIndex = async (collection, keys, options = {}) => {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    if (err.code === 85 || err.code === 86 || err.code === 11000) return;
    throw err;
  }
};

export const up = async (db) => {
  const employeesCol = db.collection('employees');
  const usersCol = db.collection('users');

  // 1. Add missing salary, username, lastPasswordResetAt fields cleanly on existing employee records
  const empCursor = employeesCol.find({});
  for await (const emp of empCursor) {
    const setOps = {};
    if (typeof emp.salary !== 'number') {
      setOps.salary = 0;
    }
    if (!emp.username) {
      const base = emp.email
        ? String(emp.email).trim().toLowerCase()
        : String(emp.employeeId || emp.name || 'emp')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '.');
      setOps.username = base;
    }
    if (!emp.status) {
      setOps.status = 'Active';
    }
    if (!('lastPasswordResetAt' in emp)) {
      setOps.lastPasswordResetAt = null;
    }

    const updateDoc = {};
    if (Object.keys(setOps).length > 0) updateDoc.$set = setOps;
    // Ensure zero plaintext passwords ever linger in existing employee records
    if ('password' in emp || 'passwordPlain' in emp || 'passwordHash' in emp) {
      updateDoc.$unset = { password: '', passwordPlain: '', passwordHash: '' };
    }
    if (Object.keys(updateDoc).length > 0) {
      await employeesCol.updateOne({ _id: emp._id }, updateDoc);
    }
  }

  // 2. Scrub any legacy plaintext password fields from users (preserving passwordHash)
  await usersCol.updateMany(
    { $or: [{ password: { $exists: true } }, { passwordPlain: { $exists: true } }] },
    { $unset: { password: '', passwordPlain: '' } }
  );
  await usersCol.updateMany(
    { lastPasswordResetAt: { $exists: false } },
    { $set: { lastPasswordResetAt: null } }
  );

  // 3. Employee indexes for fast directory search & sorting
  await safeCreateIndex(employeesCol, { employeeId: 1 }, { unique: true, name: 'idx_employees_empid_unique' });
  await safeCreateIndex(employeesCol, { username: 1 }, { name: 'idx_employees_username' });
  await safeCreateIndex(employeesCol, { salary: 1 }, { name: 'idx_employees_salary' });

  // 4. Sync atomic sequence counters so generated IDs never collide with imported records
  const countersCol = db.collection('counters');
  const year = new Date().getFullYear();
  const prefixes = [
    { prefix: 'TPS-EMP', col: 'employees', field: 'employeeId' },
    { prefix: 'TPS-DLR', col: 'dealers', field: 'dealerId' },
    { prefix: 'TPS-CUS', col: 'customers', field: 'customerId' },
    { prefix: 'TPS-LD', col: 'leads', field: 'leadId' },
    { prefix: 'TPS-SRV', col: 'serviceEnquiries', field: 'enquiryId' },
    { prefix: 'TPS-BKG', col: 'serviceBookings', field: 'bookingId' },
    { prefix: 'TPS-REC', col: 'serviceRecords', field: 'serviceId' },
    { prefix: 'TPS-FLW', col: 'followUps', field: 'followUpId' },
    { prefix: 'TPS-WRN', col: 'warranties', field: 'warrantyId' },
    { prefix: 'TPS-AMC', col: 'amcContracts', field: 'amcId' }
  ];

  for (const item of prefixes) {
    const docs = await db.collection(item.col).find({}, { projection: { [item.field]: 1 } }).toArray();
    let maxSeq = 10;
    for (const d of docs) {
      const val = String(d[item.field] || '');
      const m = val.match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    const counterId = `${item.prefix}-${year}`;
    const existing = await countersCol.findOne({ _id: counterId });
    if (!existing) {
      await countersCol.insertOne({ _id: counterId, seq: maxSeq });
    } else if (existing.seq < maxSeq) {
      await countersCol.updateOne({ _id: counterId }, { $set: { seq: maxSeq } });
    }
  }
};

export const down = async (db) => {
  await db.collection('employees').updateMany({}, { $unset: { lastPasswordResetAt: '' } });
  await db.collection('users').updateMany({}, { $unset: { lastPasswordResetAt: '' } });
  for (const idx of ['idx_employees_username', 'idx_employees_salary']) {
    try {
      await db.collection('employees').dropIndex(idx);
    } catch {
      // Ignore
    }
  }
};
