export const BRANCH_STAFF = 'BRANCH_STAFF';
export const BRANCH_HEAD = 'BRANCH_HEAD';
export const GROUP_HEAD = 'GROUP_HEAD';
export const SECTOR_HEAD = 'SECTOR_HEAD';
export const ACCOUNT_OFFICER = 'ACCOUNT_OFFICER';
export const AREA_SALES_HEAD = 'AREA_SALES_HEAD';
export const DEPARTMENT_HEAD = 'DEPARTMENT_HEAD';
export const REGIONAL_SALES_HEAD = 'REGIONAL_SALES_HEAD';

export const validStatus = ["Referred","Presented","Closed Pending","Approved","Declined", "Deferred","Lost","Postponed",];

export const sortWhitelist = ["ReferralNo", "Name", "Email", "ConsentStatus", "Status", "CreatedAt", "StatusDate"];
export const sortDirections = ["ASC", "DESC"];
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

export const landBankRoles = [BRANCH_STAFF, BRANCH_HEAD, GROUP_HEAD];
export const philLifeRoles = [ACCOUNT_OFFICER, AREA_SALES_HEAD, REGIONAL_SALES_HEAD];

export const minimumLengthPassword = 8;