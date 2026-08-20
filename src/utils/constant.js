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

// These two are the roles that may SELF-REGISTER, not the roles belonging to
// each tenant -- each holds three of its four. SECTOR_HEAD and DEPARTMENT_HEAD
// are absent because nobody sits above them to approve, and SUPERADMIN is absent
// for the same reason plus one more: it belongs to neither company.
export const landBankRoles = [BRANCH_STAFF, BRANCH_HEAD, GROUP_HEAD];
export const philLifeRoles = [ACCOUNT_OFFICER, AREA_SALES_HEAD, REGIONAL_SALES_HEAD];

// SUPERADMIN exists to approve the two roles that have no approver above them,
// and to reach any user regardless of the caller's own scope. It never creates
// or reads a referral, which is why its UserCode carries no tenant prefix.
export const superadminApprovableRoles = [SECTOR_HEAD, DEPARTMENT_HEAD];

// Three roles out of eight may create a referral. The heads above an Account
// Officer supervise and are notified; they do not refer.
export const referralCreatorRoles = [BRANCH_STAFF, BRANCH_HEAD, ACCOUNT_OFFICER];

export const minimumLengthPassword = 8;

// The only prefix. Every route lives under it, and anything the backend
// generates must build from it rather than writing a path by hand.
export const API_VERSION_PREFIX = '/api/v1';