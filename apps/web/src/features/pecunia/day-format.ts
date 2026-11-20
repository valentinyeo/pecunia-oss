const monthNames: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dateOnlyPattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

export const formatDay = (valueDate: string): string => {
  const parsed = dateOnlyPattern.exec(valueDate);

  if (parsed?.groups === undefined) {
    return valueDate;
  }

  const month = monthNames[Number(parsed.groups.month) - 1];

  return month === undefined
    ? valueDate
    : `${Number(parsed.groups.day)} ${month} ${parsed.groups.year}`;
};
