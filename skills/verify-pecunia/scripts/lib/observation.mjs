const jsonSnapshot = (value) => JSON.parse(JSON.stringify(value));

export const snapshotValue = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return jsonSnapshot(value);
  }
};

export const observe = ({ id, operation, value }) => {
  const observation = { id };

  if (operation !== undefined) {
    observation.operation = operation;
  }

  observation.value = snapshotValue(value);

  return observation;
};
