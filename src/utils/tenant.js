export const getTenant = (userCode) => {
  const tenant = ["USR", "PHL"];

  if (!userCode) return null;

  userCode = userCode.toUpperCase();

  const arrOfUserCode = userCode.split("-");

  const tenantPrefix = arrOfUserCode[0];

  if (!tenant.includes(tenantPrefix)) {
    const err = new Error("Invalid company prefix");
    err.statusCode = 400;
    throw err;
  }

  return tenantPrefix;
};
