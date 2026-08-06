export const BRANCH_STAFF = 'BRANCH_STAFF';
export const BRANCH_HEAD = 'BRANCH_HEAD';
export const GROUP_HEAD = 'GROUP_HEAD';
export const SECTOR_HEAD = 'SECTOR_HEAD';
export const ACCOUNT_OFFICER = 'ACCOUNT_OFFICER';
export const AREA_SALES_HEAD = 'AREA_SALES_HEAD';
export const DEPARTMENT_HEAD = 'DEPARTMENT_HEAD';
export const REGIONAL_SALES_HEAD = 'REGIONAL_SALES_HEAD';

export const validStatus = ["Referred","Contacted","Presented","Closed Pending","Approved","Declined","Lost","Postponed",];

export const statusTransitions = {
  "Referred": ["Presented", "Lost"],
  "Contacted": ["Presented", "Lost"],
  "Presented": ["Closed Pending", "Lost"],
  "Closed Pending": [],
  "Lost": ["Referred", "Presented"],
  "Postponed": [],
  "Approved": [],
  "Declined": [],
}

export const underwritingTransitions = {
  "Closed Pending": ["Approved", "Declined", "Postponed"],
  "Postponed": ["Approved", "Declined"]
}

export const validConsentStatus = ['CONFIRMED', 'UPLOADED'];

export const landBankRoles = [BRANCH_STAFF, BRANCH_HEAD, GROUP_HEAD];