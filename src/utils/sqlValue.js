// tedious validates every parameter against its declared type and refuses a
// mismatch outright -- a number for an NVarChar, or a string for an Int, throws
// EPARAM before the query is sent and surfaces as a 500. Values reaching the
// model come from JSON bodies, query strings and JWT payloads, none of which
// preserve the column's type, so coerce at the boundary rather than trusting it.
export const asText = (value) =>
  value === null || value === undefined || value === "" ? null : String(value);

export const asInt = (value) =>
  value === null || value === undefined || value === "" ? null : Number(value);
