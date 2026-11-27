export const ROLE_HIERARCHY = {
  'Super Admin': 1,
  Admin: 2,
  Manager: 3,
  'Senior Sales Executive': 4,
  'Sales Executive': 5,
  'Business Development Executive': 6,
  'Service Technician': 6,
  'Data Entry': 6,
  Accountant: 7,
  'System Admin': 8
};

export const EMPLOYEE_PORTAL_ROLES = [
  'Senior Sales Executive',
  'Sales Executive',
  'Business Development Executive',
  'Service Technician',
  'Data Entry'
];

export const PERMISSIONS_CATALOG = [
  // Users
  { key: 'users.view', module: 'Users', action: 'view', description: 'View user accounts and roles' },
  { key: 'users.create', module: 'Users', action: 'create', description: 'Create user accounts' },
  { key: 'users.edit', module: 'Users', action: 'edit', description: 'Edit authorised user profiles' },
  { key: 'users.delete', module: 'Users', action: 'delete', description: 'Delete non-Super Admin user accounts' },
  { key: 'users.assignRole', module: 'Users', action: 'assignRole', description: 'Assign or change user roles' },
  { key: 'users.resetPassword', module: 'Users', action: 'resetPassword', description: 'Reset user/employee passwords' },
  { key: 'users.activate', module: 'Users', action: 'activate', description: 'Activate or deactivate user accounts' },

  // Permissions & Roles
  { key: 'permissions.manage', module: 'Permissions', action: 'manage', description: 'Configure roles, permission matrices, and user access overrides' },

  // Leads
  { key: 'leads.viewAll', module: 'Leads', action: 'viewAll', description: 'View all company leads' },
  { key: 'leads.viewTeam', module: 'Leads', action: 'viewTeam', description: 'View direct/reporting team leads' },
  { key: 'leads.viewOwn', module: 'Leads', action: 'viewOwn', description: 'View own assigned/created leads' },
  { key: 'leads.create', module: 'Leads', action: 'create', description: 'Create new leads' },
  { key: 'leads.editOwn', module: 'Leads', action: 'editOwn', description: 'Edit own leads' },
  { key: 'leads.editAll', module: 'Leads', action: 'editAll', description: 'Edit all company leads' },
  { key: 'leads.delete', module: 'Leads', action: 'delete', description: 'Delete lead records' },
  { key: 'leads.assign', module: 'Leads', action: 'assign', description: 'Assign lead ownership' },

  // Customers & Dealers
  { key: 'customers.viewAll', module: 'Customers', action: 'viewAll', description: 'View all customer accounts' },
  { key: 'customers.viewAssigned', module: 'Customers', action: 'viewAssigned', description: 'View assigned team/own customers' },
  { key: 'customers.create', module: 'Customers', action: 'create', description: 'Create customer accounts' },
  { key: 'customers.edit', module: 'Customers', action: 'edit', description: 'Edit customer records' },
  { key: 'customers.delete', module: 'Customers', action: 'delete', description: 'Delete customer records' },
  { key: 'dealers.view', module: 'Dealers', action: 'view', description: 'View dealer directory' },
  { key: 'dealers.create', module: 'Dealers', action: 'create', description: 'Create dealers' },
  { key: 'dealers.edit', module: 'Dealers', action: 'edit', description: 'Edit dealers' },
  { key: 'dealers.delete', module: 'Dealers', action: 'delete', description: 'Delete dealers' },

  // Employees
  { key: 'employees.view', module: 'Employees', action: 'view', description: 'View all employees' },
  { key: 'employees.viewTeam', module: 'Employees', action: 'viewTeam', description: 'View assigned/reporting team employees' },
  { key: 'employees.create', module: 'Employees', action: 'create', description: 'Create employee records' },
  { key: 'employees.edit', module: 'Employees', action: 'edit', description: 'Edit employee details' },
  { key: 'employees.delete', module: 'Employees', action: 'delete', description: 'Delete employee records' },
  { key: 'employees.activate', module: 'Employees', action: 'activate', description: 'Activate/deactivate employees' },

  // Services (Enquiries, Bookings, Records)
  { key: 'services.viewAll', module: 'Services', action: 'viewAll', description: 'View all service enquiries, bookings, and records' },
  { key: 'services.viewAssigned', module: 'Services', action: 'viewAssigned', description: 'View assigned services only' },
  { key: 'services.create', module: 'Services', action: 'create', description: 'Create service enquiries, bookings, or records' },
  { key: 'services.assign', module: 'Services', action: 'assign', description: 'Assign technicians to service enquiries/bookings' },
  { key: 'services.updateStatus', module: 'Services', action: 'updateStatus', description: 'Update service status, progress notes, and completion' },
  { key: 'services.delete', module: 'Services', action: 'delete', description: 'Delete service records/enquiries' },

  // Follow-ups
  { key: 'followups.viewAll', module: 'Follow-ups', action: 'viewAll', description: 'View all follow-ups' },
  { key: 'followups.viewOwn', module: 'Follow-ups', action: 'viewOwn', description: 'View own/assigned follow-ups' },
  { key: 'followups.create', module: 'Follow-ups', action: 'create', description: 'Schedule follow-ups' },
  { key: 'followups.edit', module: 'Follow-ups', action: 'edit', description: 'Edit/complete follow-ups' },
  { key: 'followups.approve', module: 'Follow-ups', action: 'approve', description: 'Approve assigned team follow-ups' },
  { key: 'followups.delete', module: 'Follow-ups', action: 'delete', description: 'Delete follow-ups' },

  // Attendance
  { key: 'attendance.viewOwn', module: 'HR & Attendance', action: 'viewOwn', description: 'View own attendance and check-in/out' },
  { key: 'attendance.viewTeam', module: 'HR & Attendance', action: 'viewTeam', description: 'View team attendance records' },
  { key: 'attendance.viewAll', module: 'HR & Attendance', action: 'viewAll', description: 'View company-wide attendance records' },
  { key: 'attendance.manage', module: 'HR & Attendance', action: 'manage', description: 'Manage/override attendance logs' },

  // Payroll & Payslips
  { key: 'payroll.viewOwn', module: 'Payroll', action: 'viewOwn', description: 'View own salary breakdown' },
  { key: 'payroll.viewAll', module: 'Payroll', action: 'viewAll', description: 'View all employee payroll and salaries' },
  { key: 'payroll.manage', module: 'Payroll', action: 'manage', description: 'Create and edit payroll and salary structures' },
  { key: 'payslips.viewOwn', module: 'Payslips', action: 'viewOwn', description: 'View and download own payslips' },
  { key: 'payslips.generate', module: 'Payslips', action: 'generate', description: 'Generate monthly payslips' },

  // Expenses
  { key: 'expenses.createOwn', module: 'Expenses', action: 'createOwn', description: 'Submit own expense claims' },
  { key: 'expenses.viewOwn', module: 'Expenses', action: 'viewOwn', description: 'View own submitted expense claims' },
  { key: 'expenses.viewTeam', module: 'Expenses', action: 'viewTeam', description: 'View team expense claims' },
  { key: 'expenses.viewAll', module: 'Expenses', action: 'viewAll', description: 'View all employee expense claims' },
  { key: 'expenses.approve', module: 'Expenses', action: 'approve', description: 'Approve or reject expense claims' },
  { key: 'expenses.manage', module: 'Expenses', action: 'manage', description: 'Mark expenses paid & manage settlement' },

  // Financials & Billing
  { key: 'financials.view', module: 'Financials', action: 'view', description: 'View billing, service charges, invoices, and payments' },
  { key: 'financials.manage', module: 'Financials', action: 'manage', description: 'Update payment statuses and financial transactions' },

  // Master Catalog & Warranties/AMC
  { key: 'master.view', module: 'Master Data', action: 'view', description: 'View brands, products, service types, warranties, AMC' },
  { key: 'master.create', module: 'Master Data', action: 'create', description: 'Create master data / warranty / AMC records' },
  { key: 'master.edit', module: 'Master Data', action: 'edit', description: 'Edit master data / warranty / AMC records' },
  { key: 'master.delete', module: 'Master Data', action: 'delete', description: 'Delete master data / warranty / AMC records' },

  // Reports
  { key: 'reports.viewBusiness', module: 'Reports', action: 'viewBusiness', description: 'View business analytics & lead/service reports' },
  { key: 'reports.viewTeam', module: 'Reports', action: 'viewTeam', description: 'View team sales & service performance' },
  { key: 'reports.viewFinancial', module: 'Reports', action: 'viewFinancial', description: 'View financial & expense statements' },
  { key: 'reports.export', module: 'Reports', action: 'export', description: 'Export CSV/printable reports' },

  // Settings, System & Notifications
  { key: 'settings.view', module: 'Settings', action: 'view', description: 'View company settings' },
  { key: 'settings.manage', module: 'Settings', action: 'manage', description: 'Modify company & workflow settings' },
  { key: 'system.view', module: 'System Admin', action: 'view', description: 'View API health, DB status, backups, and diagnostics' },
  { key: 'system.manage', module: 'System Admin', action: 'manage', description: 'Configure storage, integrations, and notification gateways' },
  { key: 'audit.view', module: 'Audit', action: 'view', description: 'View audit & employee activity logs' },
  { key: 'notifications.viewOwn', module: 'Notifications', action: 'viewOwn', description: 'View personal/system notifications' },
  { key: 'notifications.manage', module: 'Notifications', action: 'manage', description: 'Configure or test notifications' },
  { key: 'portal.access', module: 'Portal', action: 'access', description: 'Access Employee Web & Mobile Portal' }
];

export const ALL_PERMISSION_KEYS = PERMISSIONS_CATALOG.map((p) => p.key);

export const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    slug: 'super-admin',
    hierarchyLevel: 1,
    isSystemRole: true,
    isSystem: true,
    description: 'Managing Director — Complete unrestricted enterprise authority across CRM, HRMS, RBAC, Payroll, and System Settings.',
    permissions: ['*', ...ALL_PERMISSION_KEYS]
  },
  {
    name: 'Admin',
    slug: 'admin',
    hierarchyLevel: 2,
    isSystemRole: true,
    isSystem: true,
    description: 'Operations Administrator — Full business, lead, customer, employee, service, and reporting control (excluding Super Admin & global RBAC overrides).',
    permissions: [
      'users.view', 'users.create', 'users.edit', 'users.assignRole', 'users.resetPassword', 'users.activate',
      'leads.viewAll', 'leads.create', 'leads.editAll', 'leads.delete', 'leads.assign',
      'customers.viewAll', 'customers.create', 'customers.edit', 'customers.delete',
      'dealers.view', 'dealers.create', 'dealers.edit', 'dealers.delete',
      'employees.view', 'employees.create', 'employees.edit', 'employees.delete', 'employees.activate',
      'services.viewAll', 'services.create', 'services.assign', 'services.updateStatus', 'services.delete',
      'followups.viewAll', 'followups.create', 'followups.edit', 'followups.approve', 'followups.delete',
      'attendance.viewOwn', 'attendance.viewAll', 'attendance.manage',
      'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn', 'expenses.viewAll', 'expenses.approve',
      'financials.view',
      'master.view', 'master.create', 'master.edit', 'master.delete',
      'reports.viewBusiness', 'reports.viewTeam', 'reports.export',
      'settings.view', 'settings.manage',
      'audit.view', 'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Manager',
    slug: 'manager',
    hierarchyLevel: 3,
    isSystemRole: true,
    isSystem: true,
    description: 'Department / Team Manager — Manage assigned team members, leads, customers, service follow-ups, and team attendance.',
    permissions: [
      'leads.viewTeam', 'leads.viewOwn', 'leads.create', 'leads.editOwn', 'leads.editAll', 'leads.assign',
      'customers.viewAssigned', 'customers.viewAll', 'customers.create', 'customers.edit',
      'dealers.view',
      'employees.viewTeam', 'employees.edit', 'employees.activate',
      'services.viewAll', 'services.viewAssigned', 'services.create', 'services.assign', 'services.updateStatus',
      'followups.viewAll', 'followups.viewOwn', 'followups.create', 'followups.edit', 'followups.approve',
      'attendance.viewOwn', 'attendance.viewTeam',
      'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn', 'expenses.viewTeam', 'expenses.approve',
      'master.view', 'reports.viewTeam', 'reports.viewBusiness', 'reports.export',
      'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Senior Sales Executive',
    slug: 'senior-sales-executive',
    hierarchyLevel: 4,
    isSystemRole: true,
    isSystem: true,
    description: 'Senior Sales Executive — Manage own & assigned team leads, customers, follow-ups, and personal HRMS.',
    permissions: [
      'leads.viewOwn', 'leads.viewTeam', 'leads.create', 'leads.editOwn', 'leads.assign',
      'customers.viewAssigned', 'customers.create', 'customers.edit',
      'services.viewAssigned', 'services.create',
      'followups.viewOwn', 'followups.create', 'followups.edit',
      'attendance.viewOwn', 'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn',
      'reports.viewTeam', 'master.view', 'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Sales Executive',
    slug: 'sales-executive',
    hierarchyLevel: 5,
    isSystemRole: true,
    isSystem: true,
    description: 'Sales Executive — Manage own leads, assigned customers, follow-ups, services, attendance, payslips, and expenses.',
    permissions: [
      'leads.viewOwn', 'leads.create', 'leads.editOwn',
      'customers.viewAssigned', 'customers.create', 'customers.edit',
      'services.viewAssigned', 'services.create', 'services.updateStatus',
      'followups.viewOwn', 'followups.create', 'followups.edit',
      'attendance.viewOwn', 'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn',
      'master.view', 'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Business Development Executive',
    slug: 'business-development-executive',
    hierarchyLevel: 6,
    isSystemRole: true,
    isSystem: true,
    description: 'Business Development Executive — Create prospects, manage own leads/follow-ups, assigned enquiries, and personal HRMS.',
    permissions: [
      'leads.viewOwn', 'leads.create', 'leads.editOwn',
      'customers.viewAssigned', 'customers.create',
      'services.viewAssigned',
      'followups.viewOwn', 'followups.create', 'followups.edit',
      'attendance.viewOwn', 'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn',
      'master.view', 'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Accountant',
    slug: 'accountant',
    hierarchyLevel: 7,
    isSystemRole: true,
    isSystem: true,
    description: 'Financial & Payroll Specialist — Manage billing, payments, employee salaries, payroll generation, payslips, and expense approvals.',
    permissions: [
      'customers.viewAll', 'services.viewAll', 'dealers.view',
      'employees.view',
      'attendance.viewOwn', 'attendance.viewAll',
      'payroll.viewOwn', 'payroll.viewAll', 'payroll.manage',
      'payslips.viewOwn', 'payslips.generate',
      'expenses.createOwn', 'expenses.viewOwn', 'expenses.viewAll', 'expenses.approve', 'expenses.manage',
      'financials.view', 'financials.manage',
      'reports.viewFinancial', 'reports.export',
      'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'System Admin',
    slug: 'system-admin',
    hierarchyLevel: 8,
    isSystemRole: true,
    isSystem: true,
    description: 'Technical System Administrator — Application health, DB & storage monitoring, system logs, and notification/integration diagnostics.',
    permissions: [
      'users.view', 'users.resetPassword',
      'system.view', 'system.manage',
      'audit.view', 'settings.view', 'settings.manage',
      'notifications.viewOwn', 'notifications.manage',
      'attendance.viewOwn', 'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Service Technician',
    slug: 'service-technician',
    hierarchyLevel: 6,
    isSystemRole: true,
    isSystem: true,
    description: 'Service Technician — View and update assigned service enquiries, records, attend to customer sites, log expenses.',
    permissions: [
      'services.viewAssigned', 'services.create', 'services.updateStatus',
      'customers.viewAssigned',
      'followups.viewOwn', 'followups.create', 'followups.edit',
      'attendance.viewOwn', 'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn',
      'master.view', 'notifications.viewOwn', 'portal.access'
    ]
  },
  {
    name: 'Data Entry',
    slug: 'data-entry',
    hierarchyLevel: 6,
    isSystemRole: true,
    isSystem: true,
    description: 'Data Entry Operator — Create and edit leads, customers, service enquiries, and master data entries.',
    permissions: [
      'leads.viewOwn', 'leads.create', 'leads.editOwn',
      'customers.viewAssigned', 'customers.create', 'customers.edit',
      'services.viewAssigned', 'services.create',
      'followups.viewOwn', 'followups.create',
      'master.view', 'master.create', 'master.edit',
      'attendance.viewOwn', 'payroll.viewOwn', 'payslips.viewOwn',
      'expenses.createOwn', 'expenses.viewOwn',
      'notifications.viewOwn', 'portal.access'
    ]
  }
];

export const LEGACY_ROLE_MAP = {
  'super admin': 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  'senior sales executive': 'Senior Sales Executive',
  'sales executive': 'Sales Executive',
  'sales employee': 'Sales Executive',
  staff: 'Sales Executive',
  'business development executive': 'Business Development Executive',
  accountant: 'Accountant',
  'system admin': 'System Admin',
  'service technician': 'Service Technician',
  'data entry': 'Data Entry'
};

export const normalizeRoleName = (role = '') => {
  const key = String(role || '').trim().toLowerCase();
  return LEGACY_ROLE_MAP[key] || role || 'Sales Executive';
};

export const ROLE_DEFAULTS_BY_NAME = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.name, r.permissions]));

// Map legacy colon permission strings on existing routes -> canonical RBAC keys
export const LEGACY_PERMISSION_ALIASES = {
  'dashboard:view': ['leads.viewOwn', 'leads.viewTeam', 'leads.viewAll', 'services.viewAssigned', 'services.viewAll', 'financials.view', 'system.view'],
  'leads:view': ['leads.viewOwn', 'leads.viewTeam', 'leads.viewAll'],
  'leads:create': ['leads.create'],
  'leads:edit': ['leads.editOwn', 'leads.editAll'],
  'leads:delete': ['leads.delete'],
  'customers:view': ['customers.viewAssigned', 'customers.viewAll'],
  'customers:create': ['customers.create'],
  'customers:edit': ['customers.edit'],
  'customers:delete': ['customers.delete'],
  'dealers:view': ['dealers.view'],
  'dealers:create': ['dealers.create'],
  'dealers:edit': ['dealers.edit'],
  'dealers:delete': ['dealers.delete'],
  'employees:view': ['employees.view', 'employees.viewTeam'],
  'employees:create': ['employees.create'],
  'employees:edit': ['employees.edit'],
  'employees:delete': ['employees.delete'],
  'serviceEnquiries:view': ['services.viewAssigned', 'services.viewAll'],
  'serviceEnquiries:create': ['services.create'],
  'serviceEnquiries:edit': ['services.updateStatus', 'services.assign'],
  'serviceEnquiries:delete': ['services.delete'],
  'serviceBookings:view': ['services.viewAssigned', 'services.viewAll'],
  'serviceBookings:create': ['services.create'],
  'serviceBookings:edit': ['services.updateStatus', 'services.assign'],
  'serviceBookings:delete': ['services.delete'],
  'serviceRecords:view': ['services.viewAssigned', 'services.viewAll'],
  'serviceRecords:create': ['services.create', 'services.updateStatus'],
  'serviceRecords:edit': ['services.updateStatus'],
  'serviceRecords:delete': ['services.delete'],
  'followUps:view': ['followups.viewOwn', 'followups.viewAll'],
  'followUps:create': ['followups.create'],
  'followUps:edit': ['followups.edit', 'followups.approve'],
  'followUps:delete': ['followups.delete'],
  'warranties:view': ['master.view'],
  'warranties:create': ['master.create'],
  'warranties:edit': ['master.edit'],
  'warranties:delete': ['master.delete'],
  'amc:view': ['master.view'],
  'amc:create': ['master.create'],
  'amc:edit': ['master.edit'],
  'amc:delete': ['master.delete'],
  'master:view': ['master.view'],
  'master:create': ['master.create'],
  'master:edit': ['master.edit'],
  'master:delete': ['master.delete'],
  'reports:view': ['reports.viewBusiness', 'reports.viewTeam', 'reports.viewFinancial']
};

export const computeEffectivePermissions = ({
  roleName,
  rolePermissions = [],
  userPermissions = [],
  deniedPermissions = [],
  temporaryAccess = null
}) => {
  const normalizedRole = normalizeRoleName(roleName);
  if (normalizedRole === 'Super Admin') {
    return ['*', ...ALL_PERMISSION_KEYS];
  }

  const base =
    Array.isArray(rolePermissions) && rolePermissions.length > 0
      ? rolePermissions
      : ROLE_DEFAULTS_BY_NAME[normalizedRole] || [];

  const set = new Set([...base, ...(userPermissions || [])]);

  if (temporaryAccess?.permissions?.length && temporaryAccess?.expiresAt) {
    if (new Date(temporaryAccess.expiresAt) > new Date()) {
      temporaryAccess.permissions.forEach((p) => set.add(p));
    }
  }

  (deniedPermissions || []).forEach((p) => set.delete(p));
  return Array.from(set);
};

export const userHasPermission = (userPerms = [], requiredKey) => {
  if (!requiredKey) return true;
  if (userPerms.includes('*')) return true;
  if (userPerms.includes(requiredKey)) return true;
  const aliases = LEGACY_PERMISSION_ALIASES[requiredKey];
  if (aliases && aliases.some((a) => userPerms.includes(a))) return true;
  return false;
};

export const getHierarchyLevel = (roleName) => ROLE_HIERARCHY[normalizeRoleName(roleName)] ?? 99;

export const canManageTargetUser = (actorUser, targetUser) => {
  const actorRole = normalizeRoleName(actorUser?.role);
  const targetRole = normalizeRoleName(targetUser?.role);

  if (actorRole === 'Super Admin') return true;
  // Nobody else can touch Super Admin
  if (targetRole === 'Super Admin') return false;

  if (actorRole === 'Admin') {
    return targetRole !== 'Super Admin';
  }

  if (actorRole === 'Manager') {
    // Manager may only manage roles strictly below Manager in sales/field hierarchy (not Admin, Super Admin, other Managers, Accountant, System Admin)
    return ['Senior Sales Executive', 'Sales Executive', 'Business Development Executive'].includes(targetRole);
  }

  return false;
};
