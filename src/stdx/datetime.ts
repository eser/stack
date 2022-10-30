import * as datetime from "https://deno.land/std@0.161.0/datetime/mod.ts";
export * from "https://deno.land/std@0.161.0/datetime/mod.ts";

const tryParse = (
  dateString: unknown | null | undefined,
  formatString: string,
): Date | undefined => {
  if (dateString === undefined || dateString === null) {
    return undefined;
  }

  try {
    return datetime.parse(dateString as string, formatString);
  } catch {
    return undefined;
  }
};

const clampTime = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);

  return newDate;
};

const datesBetween = (fromDate: Date, toDate: Date): Date[] => {
  const dates: Date[] = [];
  const date = new Date(fromDate);

  do {
    dates.push(new Date(date));

    date.setDate(date.getDate() + 1);
  } while (date !== fromDate && date <= toDate);

  return dates;
};

export { clampTime, datesBetween, tryParse };
