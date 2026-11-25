const tagOf = (value) => Object.prototype.toString.call(value);

export const isText = (value) => tagOf(value) === "[object String]";

export const isNumber = (value) => tagOf(value) === "[object Number]";

export const isBoolean = (value) => tagOf(value) === "[object Boolean]";

export const parseJson = (value) => {
  if (!isText(value)) {
    throw new TypeError("proof text must be a string");
  }

  return JSON.parse(value);
};
