export const BRANCH_STAFF = 'BRANCH_STAFF';
export const BRANCH_HEAD = 'BRANCH_HEAD';
export const GROUP_HEAD = 'GROUP_HEAD';
export const SECTOR_HEAD = 'SECTOR_HEAD';
export const ACCOUNT_OFFICER = 'ACCOUNT_OFFICER';
export const AREA_SALES_HEAD = 'AREA_SALES_HEAD';
export const DEPARTMENT_HEAD = 'DEPARTMENT_HEAD';
export const REGIONAL_SALES_HEAD = 'REGIONAL_SALES_HEAD';
export const SUPERADMIN = 'SUPERADMIN';

export const validStatus = ["Referred","Presented","Closed Pending","Approved","Declined", "Deferred","Lost","Postponed",];

export const sortWhitelist = ["Name", "Email", "ConsentStatus", "Status", "CreatedAt", "StatusDate"];
export const sortDirections = ["ASC", "DESC"];

export const reportGroupBy = ["REGION", "AREA", "BRANCH", "AO"];
export const reportPresets = ["allTime", "thisMonth", "3months", "6months", "thisYear", "custom"];
export const verifiedMap = {
  verified: 1,
  "not-verified": 0
};

export const statusTransitions = {
  "Referred": ["Presented", "Lost", "Deferred"],
  "Deferred": ["Referred", "Presented"],
  "Presented": ["Deferred", "Lost"],
  "Closed Pending": [],
  "Lost": [],
  "Postponed": [],
  "Approved": [],
  "Declined": [],
}

export const underwritingTransitions = {
  "Closed Pending": ["Approved", "Declined", "Postponed"],
  "Presented": ["Closed Pending"],
  "Postponed": ["Approved", "Declined"]
}

export const validConsentStatus = ['CONFIRMED', 'UPLOADED'];

export const SUPERSEDED = 'SUPERSEDED';

export const landBankRoles = [BRANCH_STAFF, BRANCH_HEAD, GROUP_HEAD, SECTOR_HEAD];
export const philLifeRoles = [ACCOUNT_OFFICER, AREA_SALES_HEAD, REGIONAL_SALES_HEAD, DEPARTMENT_HEAD];

export const superadminApprovableRoles = [SECTOR_HEAD, DEPARTMENT_HEAD];

export const topLevelRoles = [SECTOR_HEAD, DEPARTMENT_HEAD];

export const referralCreatorRoles = [BRANCH_STAFF, BRANCH_HEAD, ACCOUNT_OFFICER];

export const approverRoles = [BRANCH_HEAD, GROUP_HEAD, SECTOR_HEAD, DEPARTMENT_HEAD, REGIONAL_SALES_HEAD, AREA_SALES_HEAD, SUPERADMIN];

export const APPROVE = 'APPROVE';
export const REJECT = 'REJECT';
export const DEACTIVATE = 'DEACTIVATE';
export const REACTIVATE = 'REACTIVATE';

export const registrationActions = [APPROVE, REJECT];
export const membershipActions = [DEACTIVATE, REACTIVATE];
export const approvalActions = [...registrationActions, ...membershipActions];

export const minimumLengthPassword = 8;

export const branchListPageSize = 100;

export const API_VERSION_PREFIX = '/api/v1';