export const asText = (value) =>
  value === null || value === undefined || value === "" ? null : String(value);

export const asInt = (value) =>
  value === null || value === undefined || value === "" ? null : Number(value);
