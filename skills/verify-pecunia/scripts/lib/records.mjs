const asRows = (value) => (Array.isArray(value) ? value : []);

const sortKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
};

export const canonicalRecords = (rows) =>
  `[${asRows(rows)
    .map((row) => JSON.stringify(sortKeys(row)))
    .sort()
    .join(",")}]`;

export const parseRecordSet = (text) => {
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("a record set must be a JSON array of rows");
  }

  return parsed;
};
