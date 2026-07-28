import { throwHttpError } from "./error.js";

export const getTenant = (userCode) => {
  const tenant = ["USR", "PHL"];

  if (!userCode) return null;

  userCode = userCode.toUpperCase();

  const arrOfUserCode = userCode.split("-");

  const tenantPrefix = arrOfUserCode[0];

  if (!tenant.includes(tenantPrefix)) {
    throwHttpError(400, 'Invalid company prefix')
  }

  return tenantPrefix;
};
