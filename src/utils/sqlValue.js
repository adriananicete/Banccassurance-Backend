export const asText = (value) =>
  value === null || value === undefined || value === "" ? null : String(value);

export const asInt = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
