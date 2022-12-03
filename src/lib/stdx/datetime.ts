import * as datetime from "https://deno.land/std@0.167.0/datetime/mod.ts";
import {
  DateTimeFormatter,
} from "https://deno.land/std@0.167.0/datetime/formatter.ts";
export * from "https://deno.land/std@0.167.0/datetime/mod.ts";

interface FormatExOptions {
  utc?: boolean;
}

const formatEx = (
  date: Date,
  formatString: string,
  options?: FormatExOptions,
): string => {
  const formatter = new DateTimeFormatter(formatString);

  return formatter.format(date, { timeZone: options?.utc ? "UTC" : undefined });
};

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

interface ClampTimeOptions {
  includeFinalPeriod?: boolean;
  utc?: boolean;
}

const clampTime = (date: Date, options?: ClampTimeOptions): Date => {
  const newDate = new Date(date);
  if (options?.utc ?? false) {
    newDate.setUTCHours(0, 0, 0, 0);
  } else {
    newDate.setHours(0, 0, 0, 0);
  }

  return newDate;
};

interface DatesBetweenOptions {
  includeFinalPeriod?: boolean;
  utc?: boolean;
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
    if (options?.utc ?? false) {
      newDate.setUTCDate(newDate.getUTCDate() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }

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

export {
  clampTime,
  type ClampTimeOptions,
  datesBetween,
  type DatesBetweenOptions,
  DateTimeFormatter,
  formatEx,
  type FormatExOptions,
  tryParse,
};
