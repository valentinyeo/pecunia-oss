// oxlint-disable anti-slop/no-reflect-get, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-object-parameters, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- this module is the one identity boundary: it labels what the model made and names what it did not
const madeKind = new WeakMap<object, string>();

const ownPrototypes = new WeakSet<object>();

export const ownPrototype = (prototype: object): void => {
  ownPrototypes.add(prototype);
};

const isPlain = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);

  return (
    Array.isArray(value) || prototype === Object.prototype || prototype === null
  );
};

const isOwnInstance = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);

  return (
    typeof prototype === "object" &&
    prototype !== null &&
    ownPrototypes.has(prototype)
  );
};

const visit = (value: unknown, kind: string, seen: WeakSet<object>): void => {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return;
  }

  seen.add(value);

  if (!madeKind.has(value)) {
    madeKind.set(value, kind);
  }

  const owned = isPlain(value) || isOwnInstance(value);

  if (!owned) {
    return;
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);

    if (descriptor !== undefined && "value" in descriptor) {
      visit(descriptor.value, kind, seen);
    }
  }

  Object.freeze(value);
};

export const register = <T>(kind: string, value: T): T => {
  visit(value, kind, new WeakSet<object>());

  return value;
};

export const isMade = (value: unknown): boolean =>
  typeof value === "object" && value !== null && madeKind.has(value);

export const madeAs = (value: object): string | undefined =>
  madeKind.get(value);

const constructorName = (value: object): string | undefined => {
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype === null) {
    return undefined;
  }

  const constructor: unknown = Reflect.get(prototype as object, "constructor");

  return typeof constructor === "function" ? constructor.name : undefined;
};

export const foreignLabel = (value: unknown): string | undefined => {
  if (typeof value === "function") {
    return "a function";
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if (isMade(value)) {
    return undefined;
  }

  if (value instanceof Map) {
    return "a Map";
  }

  if (value instanceof Set) {
    return "a Set";
  }

  if (Array.isArray(value)) {
    return "an array the model did not make";
  }

  if (Object.getPrototypeOf(value) === null) {
    return "a null-prototype object";
  }

  const constructor = constructorName(value);

  if (
    Object.getPrototypeOf(value) === Object.prototype ||
    constructor === "Object"
  ) {
    return "a copy the model did not make";
  }

  return constructor === undefined || constructor.length === 0
    ? "a non-plain object the model did not make"
    : `an instance of ${constructor} that the model did not make`;
};
