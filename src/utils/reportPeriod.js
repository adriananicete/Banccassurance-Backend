import { throwHttpError } from "./error.js";
import { reportPresets } from "./constant.js";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const manilaCalendarDate = (instant) => {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
};

const manilaMidnight = (year, month, day) =>
  new Date(Date.UTC(year, month, day) - MANILA_OFFSET_MS);

const monthsBack = {
  thisMonth: 1,
  "3months": 3,
  "6months": 6,
};

const parseDayOnly = (value, label) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throwHttpError(400, `${label} must be a date in YYYY-MM-DD format`);

  const [year, month, day] = value.split("-").map(Number);
  const midnight = manilaMidnight(year, month - 1, day);

  const roundTrip = manilaCalendarDate(midnight);
  if (roundTrip.year !== year || roundTrip.month !== month - 1 || roundTrip.day !== day)
    throwHttpError(400, `${label} is not a real date`);

  return { year, month: month - 1, day };
};

// allTime needs a lower bound because the procedure takes a range, and we have
// never been told whether it accepts a NULL DateFrom. A floor twenty-six years
// before the first referral is the same answer without the question.
const ALL_TIME_FLOOR = manilaMidnight(2000, 0, 1);

export const resolvePeriod = (query = {}, now = new Date(), fallback = "thisMonth") => {
  const preset = query.preset ?? fallback;

  if (!reportPresets.includes(preset))
    throwHttpError(400, `Invalid preset. Allowed values: ${reportPresets.join(", ")}`);

  if (preset === "custom") {
    if (!query.dateFrom || !query.dateTo)
      throwHttpError(400, "A custom period needs both dateFrom and dateTo");

    const from = parseDayOnly(query.dateFrom, "dateFrom");
    const to = parseDayOnly(query.dateTo, "dateTo");

    const start = manilaMidnight(from.year, from.month, from.day);
    const end = manilaMidnight(to.year, to.month, to.day + 1);

    if (start >= end) throwHttpError(400, "dateFrom must not be after dateTo");

    return { preset, from: start, toExclusive: end };
  }

  const today = manilaCalendarDate(now);
  const end = manilaMidnight(today.year, today.month + 1, 1);

  if (preset === "allTime")
    return { preset, from: ALL_TIME_FLOOR, toExclusive: end };

  const start =
    preset === "thisYear"
      ? manilaMidnight(today.year, 0, 1)
      : manilaMidnight(today.year, today.month - (monthsBack[preset] - 1), 1);

  return { preset, from: start, toExclusive: end };
};

export const asManilaWallTime = (value) =>
  value instanceof Date ? new Date(value.getTime() + MANILA_OFFSET_MS) : value;

export const periodLabel = ({ preset, from, toExclusive }) => {
  if (preset === "allTime") return "all-time";

  const first = manilaCalendarDate(from);
  const last = manilaCalendarDate(new Date(toExclusive.getTime() - 1));
  const pad = (n) => String(n).padStart(2, "0");
  const day = ({ year, month, day: d }) => `${year}-${pad(month + 1)}-${pad(d)}`;

  return `${day(first)}-to-${day(last)}`;
};
