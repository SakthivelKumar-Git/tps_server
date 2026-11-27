export const DEFAULT_FEATURE_FLAGS = {
  hrManagementEnabled: false,
  dailyAttendance: false,
  attendanceReports: false,
  shiftManagement: false,
  holidayManagement: false,
  salaryTemplates: false,
  payrollGeneration: false,
  salaryBreakdown: false,
  myPayslip: false,
  myAttendance: false
};

export const getFeatureFlags = async (CompanySettingModel = null) => {
  const envEnabled = process.env.FEATURE_HR_MANAGEMENT === 'true';
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  if (CompanySettingModel) {
    try {
      const settings = await CompanySettingModel.findOne({ key: 'default' }).lean();
      if (settings?.featureFlags && typeof settings.featureFlags === 'object') {
        Object.assign(flags, settings.featureFlags);
      }
    } catch {
      // fall back safely
    }
  }
  if (envEnabled) {
    Object.keys(flags).forEach((k) => {
      flags[k] = true;
    });
  }
  return flags;
};

export const requireHrFeatureEnabled = (CompanySettingModel) => async (_req, res, next) => {
  const flags = await getFeatureFlags(CompanySettingModel);
  if (!flags.hrManagementEnabled) {
    return res.status(403).json({
      success: false,
      featureDisabled: true,
      message: 'HR Management modules are temporarily disabled pending future release.'
    });
  }
  next();
};
