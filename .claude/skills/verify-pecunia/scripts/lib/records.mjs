import { isBoolean, isNumber, isText } from "./values.mjs";

const asRows = (value) => (Array.isArray(value) ? value : []);

const sortKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (
    value === null ||
    value === undefined ||
    isText(value) ||
    isNumber(value) ||
    isBoolean(value)
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, sortKeys(value[key])])
  );
};

export const canonicalRecords = (rows) =>
  `[${asRows(rows)
    .map((row) => JSON.stringify(sortKeys(row)))
    .toSorted()
    .join(",")}]`;

export const parseRecordSet = (text) => {
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new TypeError("a record set must be a JSON array of rows");
  }

  return parsed;
};
