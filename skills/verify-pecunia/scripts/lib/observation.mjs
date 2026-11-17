const jsonSnapshot = (value) => {
  const text = JSON.stringify(value);

  return text === undefined ? undefined : JSON.parse(text);
};

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
