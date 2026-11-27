const safeCreateIndex = async (collection, keys, options = {}) => {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    if (err.code === 85 || err.code === 86 || err.code === 11000) return;
    throw err;
  }
};

export const up = async (db) => {
  const usersCol = db.collection('users');
  const employeesCol = db.collection('employees');
  const rolesCol = db.collection('roles');
  const permissionsCol = db.collection('permissions');
  const attendanceCol = db.collection('attendances');
  const payrollCol = db.collection('payrolls');
  const payslipCol = db.collection('payslips');
  const expenseCol = db.collection('expenses');

  // 1. Ensure RBAC indexes
  await safeCreateIndex(permissionsCol, { key: 1 }, { unique: true, name: 'idx_perm_key_unique' });
  await safeCreateIndex(rolesCol, { name: 1 }, { unique: true, name: 'idx_role_name_unique' });
  await safeCreateIndex(rolesCol, { hierarchyLevel: 1 }, { name: 'idx_role_hierarchy' });
  await safeCreateIndex(usersCol, { role: 1, isActive: 1 }, { name: 'idx_users_role_active' });
  await safeCreateIndex(usersCol, { employeeId: 1 }, { name: 'idx_users_emp_id' });
  await safeCreateIndex(usersCol, { reportingManager: 1 }, { name: 'idx_users_reporting_mgr' });

  // 2. HRMS collection indexes
  await safeCreateIndex(attendanceCol, { employee: 1, date: 1 }, { unique: true, name: 'idx_att_emp_date_unique' });
  await safeCreateIndex(attendanceCol, { date: -1 }, { name: 'idx_att_date' });
  await safeCreateIndex(payrollCol, { employee: 1, payPeriod: 1 }, { unique: true, name: 'idx_payroll_emp_period_unique' });
  await safeCreateIndex(payslipCol, { payslipId: 1 }, { unique: true, name: 'idx_payslip_id_unique' });
  await safeCreateIndex(payslipCol, { payroll: 1 }, { unique: true, name: 'idx_payslip_payroll_unique' });
  await safeCreateIndex(expenseCol, { expenseId: 1 }, { unique: true, name: 'idx_expense_id_unique' });
  await safeCreateIndex(expenseCol, { employee: 1, expenseDate: -1 }, { name: 'idx_expense_emp_date' });

  // 3. Backfill RBAC fields on existing users without destroying credentials
  await usersCol.updateMany(
    { portalAccess: { $exists: false } },
    { $set: { portalAccess: true } }
  );
  await usersCol.updateMany(
    { mustChangePassword: { $exists: false } },
    { $set: { mustChangePassword: false } }
  );
  await usersCol.updateMany(
    { permissions: { $exists: false } },
    { $set: { permissions: [] } }
  );
  await usersCol.updateMany(
    { deniedPermissions: { $exists: false } },
    { $set: { deniedPermissions: [] } }
  );
  await usersCol.updateMany(
    { tokenVersion: { $exists: false } },
    { $set: { tokenVersion: 0 } }
  );

  // 4. Backfill designation & salaryReference cleanly on existing employees
  const empCursor = employeesCol.find({});
  for await (const emp of empCursor) {
    const setOps = {};
    if (!emp.designation) {
      setOps.designation = emp.role || 'Executive';
    }
    if (emp.portalAccess === undefined) {
      setOps.portalAccess = true;
    }
    if (!emp.salaryReference) {
      const base = Number(emp.salary || 0);
      setOps.salaryReference = {
        basicSalary: base,
        allowances: 0,
        incentives: 0,
        deductions: 0
      };
    }
    if (Object.keys(setOps).length > 0) {
      await employeesCol.updateOne({ _id: emp._id }, { $set: setOps });
    }
  }

  // 5. Initialize HRMS counters cleanly
  const countersCol = db.collection('counters');
  const year = new Date().getFullYear();
  for (const prefix of ['TPS-PSL', 'TPS-EXP']) {
    const id = `${prefix}-${year}`;
    await countersCol.updateOne({ _id: id }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  }
};

export const down = async (db) => {
  await db.collection('users').updateMany(
    {},
    { $unset: { deniedPermissions: '', permissionHistory: '', temporaryAccess: '', tokenVersion: '' } }
  );
};
