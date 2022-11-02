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

interface DatesBetweenOptions {
  includeFinalPeriod?: boolean;
}

const datesBetween = (
  fromDate: Date,
  toDate: Date,
  options?: DatesBetweenOptions,
): Date[] => {
  let date = new Date(fromDate);
  const dates: Date[] = [date];
  let newDate;

  while (true) {
    newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 1);

    if (newDate > toDate) {
      break;
    }

    dates.push(newDate);
    date = newDate;
  }

  if (options?.includeFinalPeriod && date < toDate) {
    dates.push(new Date(toDate));
  }

  return dates;
};

export { clampTime, datesBetween, tryParse };
