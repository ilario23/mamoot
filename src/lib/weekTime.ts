const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const normalizeIsoDate = (value: string): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  return trimmed;
};

const parseIsoUtc = (isoDate: string): Date => {
  const normalized = normalizeIsoDate(isoDate);
  if (!normalized) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return new Date(`${normalized}T12:00:00.000Z`);
};

export const addDaysIso = (isoDate: string, days: number): string => {
  const base = parseIsoUtc(isoDate);
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(
    base.getUTCDate(),
  )}`;
};

export const getMondayIsoForDate = (isoDate: string): string => {
  const base = parseIsoUtc(isoDate);
  const weekdayMon0 = (base.getUTCDay() + 6) % 7; // 0=Mon ... 6=Sun
  return addDaysIso(isoDate, -weekdayMon0);
};

export const getSundayIsoForMonday = (mondayIso: string): string => {
  return addDaysIso(mondayIso, 6);
};

export const getWeekDatesFromMonday = (
  mondayIso: string,
): Array<{day: string; date: string}> => {
  const dayNames = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  return dayNames.map((day, offset) => ({
    day,
    date: addDaysIso(mondayIso, offset),
  }));
};

export const getTodayIsoInTimeZone = (timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to resolve date for timezone: ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
};

export const getCurrentMondayInTimeZone = (timeZone: string): string => {
  const todayIso = getTodayIsoInTimeZone(timeZone);
  return getMondayIsoForDate(todayIso);
};

export const getNextMondayInTimeZone = (timeZone: string): string => {
  return addDaysIso(getCurrentMondayInTimeZone(timeZone), 7);
};
