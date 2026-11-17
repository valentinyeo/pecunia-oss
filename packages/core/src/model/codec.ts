// oxlint-disable anti-slop/no-unknown-parameters -- this module is the boundary that parses untrusted values
// oxlint-disable typescript/no-unsafe-type-assertion -- the schema registry is keyed by handles and the AST is reached through one documented lookup
// oxlint-disable typescript/non-nullable-type-assertion-style, typescript/only-throw-error, anti-slop/require-safety-comment-for-type-assertion -- the stray-key failure is built as a SchemaError so callers see one Result channel
// oxlint-disable anti-slop/no-unknown-parameters, no-throw-literal -- verification throws the same SchemaError that decode returns
// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-reflect-get -- a handle and a schema are told apart by their own decode function, which no schema AST can describe
// oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-unknown-returns -- every public function is an overload whose implementation speaks unknown, so the API surface stays named
// oxlint-disable anti-slop/no-object-parameters -- every node the walker inspects is untrusted boundary input, so its owner type is unknown
// oxlint-disable typescript/no-non-null-assertion -- the branch above already proves the schema argument is present
// oxlint-disable anti-slop/no-shape-in-symbol-names -- the one shape gate is named assertNoForeignKeys by the review that asked for it
// oxlint-disable anti-slop/no-index-signature, anti-slop/no-any, anti-slop/no-unsafe-dictionary-type -- the walker reads AST nodes and decoded values that no single declared type describes
// oxlint-disable eslint/func-style, eslint/no-use-before-define -- the shape walk and its branch resolver call each other, so both are hoisted declarations

import type { SchemaAST } from "effect";
import {
  DateTime,
  Option,
  Predicate,
  Result,
  Schema,
  SchemaIssue,
} from "effect";

import { foreignLabel, ownPrototype, seal } from "./registry.js";

type Codec = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type UnionKeys<T> = T extends unknown ? keyof T : never;

type Key = string | number | symbol;

declare const opaque: unique symbol;

export type Opaque<T> = T & { readonly [opaque]: never };

export type Exact<T, AllKeys extends Key = UnionKeys<T>> = T extends unknown
  ? T & Partial<Record<Exclude<AllKeys, keyof T>, never>>
  : never;

export const strictOptions: SchemaAST.ParseOptions = {
  onExcessProperty: "error",
};

export interface Gate {
  readonly domain: string;
  readonly where: string;
}

export interface CodecHandle<T, Encoded> {
  readonly name: string;
  readonly decode: (input: unknown) => Result.Result<T, Schema.SchemaError>;
  readonly encode: (value: T) => Result.Result<Encoded, Schema.SchemaError>;
}

export type ModelCodec<T, Encoded> = CodecHandle<T, Encoded>;

export type Handle = Codec | ModelCodec<unknown, unknown>;

const schemaTable = new WeakMap<object, Codec>();

const kindNames = new WeakMap<object, string>();

const isHandle = (value: Handle): value is ModelCodec<unknown, unknown> =>
  typeof Reflect.get(value, "decode") === "function";

export const schemaOf = (handle: Handle): Codec => {
  if (!isHandle(handle)) {
    return handle;
  }

  const schema = schemaTable.get(handle);

  if (schema === undefined) {
    throw new Error(`${handle.name} is not a model codec.`);
  }

  return schema;
};

type Fields = readonly SchemaAST.PropertySignature[];

type ShapeKind =
  | "array"
  | "datetime"
  | "error"
  | "map"
  | "option-none"
  | "option-none-wire"
  | "option-some"
  | "option-some-wire"
  | "record"
  | "set"
  | "struct";

interface ShapeNode {
  readonly ast: SchemaAST.AST | undefined;
  readonly path: string;
  readonly value: unknown;
}

interface ShapeContext {
  readonly ast: SchemaAST.AST | undefined;
  readonly node: object;
  readonly path: string;
}

interface ShapeRule {
  readonly allowed: (context: ShapeContext) => ReadonlySet<Key> | undefined;
  readonly admits?: (context: ShapeContext, key: Key) => boolean;
  readonly children: (context: ShapeContext) => readonly ShapeNode[];
}

interface Shape {
  readonly ast: SchemaAST.AST | undefined;
  readonly kind: ShapeKind;
}

type Violation =
  | {
      readonly path: string;
      readonly rule: "key";
      readonly key: Key;
      readonly kind?: string;
    }
  | { readonly path: string; readonly rule: "kind"; readonly kind: string }
  | {
      readonly path: string;
      readonly label: string;
      readonly rule: "prototype";
    };

const ownKeysOf = (value: object): readonly Key[] => Reflect.ownKeys(value);

const tagOf = (value: object): string | undefined => {
  const tag: unknown = Reflect.get(value, "_tag");

  return typeof tag === "string" ? tag : undefined;
};

const isTagLiteral = (ast: SchemaAST.AST, tag: string): boolean =>
  Predicate.isTagged(ast, "Literal") &&
  (Array.isArray(ast.literal)
    ? ast.literal.some((literal) => literal === tag)
    : ast.literal === tag);

const suspendOf = (ast: SchemaAST.AST): SchemaAST.AST =>
  Predicate.isTagged(ast, "Suspend") ? suspendOf(ast.thunk()) : ast;

const encodedAstOf = (ast: SchemaAST.AST): SchemaAST.AST | undefined => {
  const [link] = ast.encoding ?? [];

  return link === undefined ? undefined : link.to;
};

const objectsOf = (
  ast: SchemaAST.AST | undefined
): SchemaAST.Objects | undefined => {
  const node = ast === undefined ? undefined : suspendOf(ast);

  return node !== undefined && Predicate.isTagged(node, "Objects")
    ? node
    : undefined;
};

const arraysOf = (
  ast: SchemaAST.AST | undefined
): SchemaAST.Arrays | undefined => {
  const node = ast === undefined ? undefined : suspendOf(ast);

  return node !== undefined && Predicate.isTagged(node, "Arrays")
    ? node
    : undefined;
};

const declarationOf = (
  ast: SchemaAST.AST | undefined
): SchemaAST.Declaration | undefined => {
  const node = ast === undefined ? undefined : suspendOf(ast);

  return node !== undefined && Predicate.isTagged(node, "Declaration")
    ? node
    : undefined;
};

const unionOf = (
  ast: SchemaAST.AST | undefined
): SchemaAST.Union | undefined => {
  const node = ast === undefined ? undefined : suspendOf(ast);

  return node !== undefined && Predicate.isTagged(node, "Union")
    ? node
    : undefined;
};

const structFields = (
  ast: SchemaAST.AST | undefined,
  tag: string | undefined
): Fields | undefined => {
  if (ast === undefined) {
    return undefined;
  }

  const node = suspendOf(ast);

  if (Predicate.isTagged(node, "Objects")) {
    return node.indexSignatures.length === 0
      ? node.propertySignatures
      : undefined;
  }

  if (Predicate.isTagged(node, "Declaration")) {
    const [parameter] = node.typeParameters;

    return parameter === undefined
      ? structFields(encodedAstOf(node), tag)
      : structFields(parameter, tag);
  }

  if (!Predicate.isTagged(node, "Union") || tag === undefined) {
    return undefined;
  }

  const tagged = node.types.find((member) => {
    const candidate = objectsOf(member);

    return (
      candidate !== undefined &&
      candidate.propertySignatures.some(
        (field) => field.name === "_tag" && isTagLiteral(field.type, tag)
      )
    );
  });

  return structFields(tagged, tag);
};

const innerAst = (ast: SchemaAST.AST | undefined): SchemaAST.AST | undefined =>
  ast !== undefined && Predicate.isTagged(ast, "Declaration")
    ? ast.typeParameters[0]
    : undefined;

const elementAst = (
  ast: SchemaAST.AST | undefined
): SchemaAST.AST | undefined => arraysOf(ast)?.rest[0];

const literalNamesOf = (ast: SchemaAST.AST): ReadonlySet<Key> | undefined => {
  const node = suspendOf(ast);

  if (Predicate.isTagged(node, "Literal")) {
    const values: readonly unknown[] = Array.isArray(node.literal)
      ? node.literal
      : [node.literal];

    return new Set(
      values.filter(
        (value): value is Key =>
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "symbol"
      )
    );
  }

  if (!Predicate.isTagged(node, "Union")) {
    return undefined;
  }

  const members = node.types.map(literalNamesOf);

  return members.some((member) => member === undefined)
    ? undefined
    : new Set(members.flatMap((member) => [...(member ?? [])]));
};

const emptyKeys: ReadonlySet<Key> = new Set<Key>();

type PrimitiveType =
  | "bigint"
  | "boolean"
  | "function"
  | "null"
  | "number"
  | "string"
  | "symbol"
  | "undefined";

type Template =
  | { readonly type: PrimitiveType }
  | {
      readonly type: "object";
      readonly fields: ReadonlyMap<Key, Template>;
    };

const templateOf = (value: unknown): Template => {
  if (value === null) {
    return { type: "null" };
  }

  if (typeof value === "object") {
    const fields = new Map<Key, Template>();

    for (const key of ownKeysOf(value)) {
      fields.set(key, templateOf(Reflect.get(value, key)));
    }

    return { type: "object", fields };
  }

  return { type: typeof value as PrimitiveType };
};

const templateMatches = (template: Template, value: unknown): boolean => {
  if (template.type === "null") {
    return value === null;
  }

  if (template.type !== "object") {
    return typeof value === template.type;
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  const own = ownKeysOf(value);

  return (
    own.length === template.fields.size &&
    own.every((key) => {
      const field = template.fields.get(key);

      return (
        field !== undefined && templateMatches(field, Reflect.get(value, key))
      );
    })
  );
};

interface DateTimeAxes {
  readonly keys: ReadonlySet<Key>;
  readonly templates: ReadonlyMap<Key, readonly Template[]>;
}

const attempt = (run: () => unknown): unknown => {
  try {
    return run();
  } catch (error) {
    return error;
  }
};

const dateTimeApis: readonly ((self: object) => unknown)[] = Object.values(
  DateTime as Readonly<Record<string, unknown>>
).filter(
  (value): value is (self: object) => unknown => typeof value === "function"
);

const dateTimeProbe = (seeds: readonly (() => object)[]): DateTimeAxes => {
  const keys = new Set<Key>();
  const templates = new Map<Key, Template[]>();

  const observe = (instance: object): void => {
    for (const key of ownKeysOf(instance)) {
      const seen = templates.get(key) ?? [];
      const value: unknown = Reflect.get(instance, key);

      keys.add(key);

      if (!seen.some((template) => templateMatches(template, value))) {
        seen.push(templateOf(value));
      }

      templates.set(key, seen);
    }
  };

  for (const seed of seeds) {
    observe(seed());
  }

  for (const api of dateTimeApis) {
    for (const seed of seeds) {
      const instance = seed();
      const result = attempt(() => api(instance));

      if (typeof result === "function") {
        attempt(() => (result as (self: object) => unknown)(instance));
      }

      observe(instance);
    }
  }

  return { keys, templates };
};

const utcAxes = dateTimeProbe([
  () => DateTime.makeUnsafe("2024-01-31T10:00:00Z"),
]);

const zonedAxes = dateTimeProbe([
  () => DateTime.makeZonedUnsafe("2024-01-31T10:00:00Z", { timeZone: 0 }),
  () => DateTime.makeZonedUnsafe("2024-01-31T10:00:00Z", { timeZone: "UTC" }),
]);

const dateTimeAxes = (node: object): DateTimeAxes =>
  DateTime.isZoned(node as DateTime.DateTime) ? zonedAxes : utcAxes;

const dateTimeAllowed = (context: ShapeContext): ReadonlySet<Key> =>
  dateTimeAxes(context.node).keys;

const dateTimeAdmits = (context: ShapeContext, key: Key): boolean => {
  const admitted = dateTimeAxes(context.node).templates.get(key);
  const value: unknown = Reflect.get(context.node, key);

  return (
    admitted?.some((template) => templateMatches(template, value)) ?? false
  );
};

const errorInfrastructureKeys: ReadonlySet<Key> = new Set<Key>();

const someKeys: ReadonlySet<Key> = new Set<Key>(
  Reflect.ownKeys(Option.some(null))
);

const noneKeys: ReadonlySet<Key> = new Set<Key>(Reflect.ownKeys(Option.none()));

const someWireKeys: ReadonlySet<Key> = new Set<Key>([
  ...someKeys,
  "_tag",
  "_id",
]);

const noneWireKeys: ReadonlySet<Key> = new Set<Key>([
  ...noneKeys,
  "_tag",
  "_id",
]);

const noChildren = (): readonly ShapeNode[] => [];

const childOf = (
  context: ShapeContext,
  key: Key,
  ast: SchemaAST.AST | undefined
): ShapeNode => ({
  ast,
  path: `${context.path}.${String(key)}`,
  value: Reflect.get(context.node, key),
});

const structAllowed = (context: ShapeContext): ReadonlySet<Key> | undefined => {
  const fields = structFields(context.ast, tagOf(context.node));

  return fields === undefined
    ? undefined
    : new Set<Key>(fields.map((field) => field.name));
};

const structChildren = (context: ShapeContext): readonly ShapeNode[] => {
  const fields = structFields(context.ast, tagOf(context.node));

  return fields === undefined
    ? []
    : fields.flatMap((field) =>
        Object.hasOwn(context.node, field.name)
          ? [childOf(context, field.name, field.type)]
          : []
      );
};

const recordAllowed = (context: ShapeContext): ReadonlySet<Key> | undefined => {
  const node = objectsOf(context.ast);

  if (node === undefined) {
    return undefined;
  }

  const allowed = new Set<Key>(
    node.propertySignatures.map((field) => field.name)
  );

  for (const signature of node.indexSignatures) {
    const declared = literalNamesOf(signature.parameter);

    if (declared === undefined) {
      for (const key of ownKeysOf(context.node)) {
        if (typeof key === "string") {
          allowed.add(key);
        }
      }
    } else {
      for (const key of declared) {
        allowed.add(key);
      }
    }
  }

  return allowed;
};

const recordChildren = (context: ShapeContext): readonly ShapeNode[] => {
  const node = objectsOf(context.ast);

  if (node === undefined) {
    return [];
  }

  const valueAst = node.indexSignatures[0]?.type;

  return ownKeysOf(context.node).flatMap((key) => {
    const field = node.propertySignatures.find(
      (signature) => signature.name === key
    );

    return [childOf(context, key, field === undefined ? valueAst : field.type)];
  });
};

const arrayAllowed = (context: ShapeContext): ReadonlySet<Key> => {
  const allowed = new Set<Key>(["length"]);
  const { length } = context.node as readonly unknown[];

  for (let index = 0; index < length; index += 1) {
    allowed.add(String(index));
  }

  return allowed;
};

const arrayChildren = (context: ShapeContext): readonly ShapeNode[] => {
  const element = elementAst(context.ast);

  return ownKeysOf(context.node).flatMap((key) =>
    key === "length" || typeof key === "symbol"
      ? []
      : [childOf(context, key, element)]
  );
};

const optionSomeChildren = (context: ShapeContext): readonly ShapeNode[] =>
  Object.hasOwn(context.node, "value")
    ? [childOf(context, "value", innerAst(context.ast))]
    : [];

const errorAllowed = (context: ShapeContext): ReadonlySet<Key> | undefined => {
  const fields = structAllowed(context);

  if (fields === undefined) {
    return undefined;
  }

  const allowed = new Set<Key>(errorInfrastructureKeys);

  for (const key of fields) {
    if (key !== "_tag") {
      allowed.add(key);
    }
  }

  return allowed;
};

const shapeTable: Readonly<Record<ShapeKind, ShapeRule>> = {
  array: { allowed: arrayAllowed, children: arrayChildren },
  datetime: {
    admits: dateTimeAdmits,
    allowed: dateTimeAllowed,
    children: noChildren,
  },
  error: { allowed: errorAllowed, children: structChildren },
  map: { allowed: () => emptyKeys, children: noChildren },
  "option-none": { allowed: () => noneKeys, children: noChildren },
  "option-none-wire": { allowed: () => noneWireKeys, children: noChildren },
  "option-some": { allowed: () => someKeys, children: optionSomeChildren },
  "option-some-wire": {
    allowed: () => someWireKeys,
    children: optionSomeChildren,
  },
  record: { allowed: recordAllowed, children: recordChildren },
  set: { allowed: () => emptyKeys, children: noChildren },
  struct: { allowed: structAllowed, children: structChildren },
};

const isOptionPayload = (ast: SchemaAST.AST | undefined): boolean =>
  declarationOf(ast)?.typeParameters.length === 1;

const runtimeKind = (
  value: object,
  ast?: SchemaAST.AST
): ShapeKind | undefined => {
  if (DateTime.isDateTime(value)) {
    return "datetime";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Map) {
    return "map";
  }

  if (value instanceof Set) {
    return "set";
  }

  if (value instanceof Error) {
    return "error";
  }

  if (Option.isOption(value)) {
    return Option.isSome(value) ? "option-some" : "option-none";
  }

  const tag = tagOf(value);

  if ((tag === "Some" || tag === "None") && isOptionPayload(ast)) {
    return tag === "Some" ? "option-some-wire" : "option-none-wire";
  }

  return undefined;
};

const literalScore = (ast: SchemaAST.AST, value: object): number => {
  const fields = structFields(ast, tagOf(value));

  return fields === undefined
    ? 0
    : fields.filter((field) => {
        const literals = literalNamesOf(field.type);
        const actual: unknown = Reflect.get(value, field.name);

        return (
          literals !== undefined &&
          (typeof actual === "string" ||
            typeof actual === "number" ||
            typeof actual === "symbol") &&
          literals.has(actual)
        );
      }).length;
};

const branchFits = (branch: Branch, own: readonly Key[]): boolean =>
  own.every((key) => branch.allowed.has(key));

const betterBranch = (
  candidate: Branch,
  winner: Branch,
  own: readonly Key[]
): boolean => {
  if (candidate.literals !== winner.literals) {
    return candidate.literals > winner.literals;
  }

  const candidateFits = branchFits(candidate, own);
  const winnerFits = branchFits(winner, own);

  if (candidateFits !== winnerFits) {
    return candidateFits;
  }

  return candidate.allowed.size < winner.allowed.size;
};

interface Branch {
  readonly allowed: ReadonlySet<Key>;
  readonly literals: number;
  readonly shape: Shape;
}

function shapeOf(
  value: unknown,
  ast: SchemaAST.AST | undefined,
  path: string
): Shape | undefined {
  const branchOf = (member: SchemaAST.AST): Branch | undefined => {
    const shape = shapeOf(value, member, path);

    if (shape === undefined) {
      return undefined;
    }

    const allowed = shapeTable[shape.kind].allowed({
      ast: shape.ast,
      node: value as object,
      path,
    });

    return allowed === undefined
      ? undefined
      : { allowed, literals: literalScore(member, value as object), shape };
  };

  const resolveBranch = (
    members: readonly SchemaAST.AST[]
  ): Branch | undefined => {
    const own = ownKeysOf(value as object);

    let best: Branch | undefined;

    for (const member of members) {
      const branch = branchOf(member);

      if (
        branch !== undefined &&
        (best === undefined || betterBranch(branch, best, own))
      ) {
        best = branch;
      }
    }

    return best;
  };

  const node = value as object;
  const kind = runtimeKind(node, ast);

  if (kind !== undefined) {
    return { ast, kind };
  }

  if (ast === undefined) {
    return undefined;
  }

  const union = unionOf(ast);

  if (union !== undefined) {
    return resolveBranch(union.types)?.shape;
  }

  const objects = objectsOf(ast);

  if (objects !== undefined) {
    return {
      ast: objects,
      kind: objects.indexSignatures.length === 0 ? "struct" : "record",
    };
  }

  if (arraysOf(ast) !== undefined) {
    return { ast: suspendOf(ast), kind: "array" };
  }

  const declaration = declarationOf(ast);

  if (declaration === undefined) {
    return undefined;
  }

  const [parameter] = declaration.typeParameters;

  return parameter === undefined
    ? shapeOf(value, encodedAstOf(declaration), path)
    : shapeOf(value, parameter, path);
}

const kindName = (ast: SchemaAST.AST | undefined): string =>
  ast === undefined ? "Unknown" : suspendOf(ast)._tag;

const unionStray = (context: ShapeContext): Key | undefined => {
  const union = unionOf(context.ast);

  if (union === undefined) {
    return undefined;
  }

  const own = ownKeysOf(context.node);

  const hitsIn = (allowed: ReadonlySet<Key>): number =>
    own.filter((key) => allowed.has(key)).length;

  let best:
    | {
        readonly allowed: ReadonlySet<Key>;
        readonly literals: number;
      }
    | undefined;

  for (const member of union.types) {
    const shape = shapeOf(context.node, member, context.path);

    if (shape === undefined) {
      continue;
    }

    const allowed = shapeTable[shape.kind].allowed({
      ast: shape.ast,
      node: context.node,
      path: context.path,
    });

    if (allowed === undefined) {
      continue;
    }

    const literals = literalScore(member, context.node);

    if (
      best === undefined ||
      literals > best.literals ||
      (literals === best.literals && hitsIn(allowed) > hitsIn(best.allowed))
    ) {
      best = { allowed, literals };
    }
  }

  return best?.allowed === undefined
    ? undefined
    : own.find((key) => !best?.allowed.has(key));
};

interface DomainConstructor {
  readonly prototype: object;
}

const domainClasses: DomainConstructor[] = [];

export const domainClass = (ctor: DomainConstructor): void => {
  domainClasses.push(ctor);
  ownPrototype(ctor.prototype);
};

const isDomainInstance = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);

  return domainClasses.some((ctor) => ctor.prototype === prototype);
};

const prototypeLabel = (value: object): string => {
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype === null) {
    return "a null-prototype object";
  }

  const constructor: unknown = Reflect.get(prototype as object, "constructor");
  const name = typeof constructor === "function" ? constructor.name : "";

  return typeof name === "string" && name.length > 0
    ? `an instance of ${name}`
    : "a non-plain object";
};

const shapeRefusal = (value: object): string | undefined => {
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return undefined;
  }

  if (runtimeKind(value) !== undefined) {
    return undefined;
  }

  return isDomainInstance(value) ? undefined : prototypeLabel(value);
};

const walkNode = (
  node: ShapeNode,
  seen: WeakSet<object>
): Violation | undefined => {
  const { value } = node;

  if (typeof value === "function") {
    return { label: "a function", path: node.path, rule: "prototype" };
  }

  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }

  const refusal = shapeRefusal(value);

  if (refusal !== undefined) {
    return { label: refusal, path: node.path, rule: "prototype" };
  }

  seen.add(value);

  const shape = shapeOf(value, node.ast, node.path);

  if (shape === undefined) {
    const kind = kindName(node.ast);

    const stray =
      unionStray({ ast: node.ast, node: value, path: node.path }) ??
      ownKeysOf(value)[0];

    return stray === undefined
      ? { kind, path: node.path, rule: "kind" }
      : { key: stray, kind, path: node.path, rule: "key" };
  }

  const context: ShapeContext = {
    ast: shape.ast,
    node: value,
    path: node.path,
  };

  const allowed = shapeTable[shape.kind].allowed(context);

  if (allowed === undefined) {
    const [first] = ownKeysOf(value);

    return first === undefined
      ? { kind: shape.kind, path: node.path, rule: "kind" }
      : { key: first, kind: shape.kind, path: node.path, rule: "key" };
  }

  const stray = ownKeysOf(value).find((key) => {
    const { admits } = shapeTable[shape.kind];

    return !allowed.has(key) || (admits !== undefined && !admits(context, key));
  });

  if (stray !== undefined) {
    return { key: stray, path: node.path, rule: "key" };
  }

  for (const child of shapeTable[shape.kind].children(context)) {
    const violation = walkNode(child, seen);

    if (violation !== undefined) {
      return violation;
    }
  }

  return undefined;
};

const frozenWrapper = (value: object): boolean =>
  Array.isArray(value) || Option.isSome(value as Option.Option<unknown>);

const sealChildren = (
  node: SchemaAST.AST,
  value: object,
  seen: WeakSet<object>,
  inherited: string | undefined
): void => {
  if (Predicate.isTagged(node, "Objects")) {
    for (const field of node.propertySignatures) {
      if (Object.hasOwn(value, field.name)) {
        sealDecoded(
          field.type,
          Reflect.get(value, field.name),
          seen,
          inherited
        );
      }
    }

    for (const signature of node.indexSignatures) {
      for (const key of Reflect.ownKeys(value)) {
        if (!node.propertySignatures.some((field) => field.name === key)) {
          sealDecoded(signature.type, Reflect.get(value, key), seen, inherited);
        }
      }
    }

    return;
  }

  if (Predicate.isTagged(node, "Arrays")) {
    for (const entry of value as readonly unknown[]) {
      sealDecoded(node.rest[0], entry, seen, inherited);
    }

    return;
  }

  if (Predicate.isTagged(node, "Union")) {
    let member: SchemaAST.AST | undefined;

    for (const branch of node.types) {
      if (
        shapeOf(value, branch, "$") !== undefined &&
        (member === undefined ||
          literalScore(branch, value) > literalScore(member, value))
      ) {
        member = branch;
      }
    }

    if (member !== undefined) {
      sealChildren(suspendOf(member), value, seen, inherited);
    }

    return;
  }

  if (Predicate.isTagged(node, "Declaration")) {
    const [parameter] = node.typeParameters;

    if (parameter === undefined) {
      return;
    }

    if (Option.isOption(value)) {
      if (Option.isSome(value)) {
        sealDecoded(parameter, value.value, seen, inherited);
      }

      return;
    }

    sealChildren(suspendOf(parameter), value, seen, inherited);
  }
};

function sealDecoded(
  ast: SchemaAST.AST | undefined,
  value: unknown,
  seen: WeakSet<object>,
  inherited: string | undefined
): void {
  if (ast === undefined || typeof value !== "object" || value === null) {
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);

  const node = suspendOf(ast);
  const kind = kindNames.get(node) ?? kindNames.get(ast) ?? inherited;

  sealChildren(node, value, seen, kind);

  if (kind !== undefined && !Array.isArray(value) && !Option.isOption(value)) {
    seal(kind, value);
  }

  if (frozenWrapper(value)) {
    Object.freeze(value);
  }
}

const violationMessage = (violation: Violation): string => {
  if (violation.rule === "key") {
    const detail =
      violation.kind === undefined
        ? "an unknown key is never stripped"
        : `the "${violation.kind}" node kind has no row in the shape table`;

    return `Expected no "${String(violation.key)}" property at "${violation.path}": ${detail}`;
  }

  if (violation.rule === "prototype") {
    return `Expected a plain object at "${violation.path}": ${violation.label} is never a domain value`;
  }

  return `Expected a known shape at "${violation.path}": the "${violation.kind}" node kind has no row in the shape table`;
};

const shapeFailure = (
  value: unknown,
  schema: Codec
): Schema.SchemaError | undefined => {
  const violation = walkNode(
    { ast: schema.ast, path: "$", value },
    new WeakSet()
  );

  if (violation === undefined) {
    return undefined;
  }

  const message = violationMessage(violation);

  return new Schema.SchemaError(
    new SchemaIssue.InvalidValue({ message }, value)
  );
};

export const assertNoForeignKeys = (
  value: unknown,
  handle: Handle
): Schema.SchemaError | undefined => shapeFailure(value, schemaOf(handle));

const diagnosticOf = (value: unknown, handle: Handle): string | undefined => {
  const violation = walkNode(
    { ast: schemaOf(handle).ast, path: "$", value },
    new WeakSet<object>()
  );

  return violation === undefined ? undefined : violationMessage(violation);
};

export const foreignRefusal = (
  value: unknown,
  handle: Handle,
  gate: Gate
): Schema.SchemaError | undefined => {
  const label = foreignLabel(value);

  if (label === undefined) {
    return undefined;
  }

  const detail =
    diagnosticOf(value, handle) ??
    `${label} at "$" is not something the model made`;

  const message = `${gate.where} expects ${gate.domain}: ${detail} Fix: build it with the factory or codec for ${gate.domain}.`;

  return new Schema.SchemaError(
    new SchemaIssue.InvalidValue({ message }, value)
  );
};

export const nestedRefusal = (
  value: unknown,
  handle: Handle,
  gate: Gate
): Schema.SchemaError | undefined => {
  if (foreignLabel(value) !== undefined) {
    return foreignRefusal(value, handle, gate);
  }

  const detail = diagnosticOf(value, handle);

  if (detail === undefined) {
    return undefined;
  }

  const message = `${gate.where} expects ${gate.domain}: ${detail} Fix: build it with the factory or codec for ${gate.domain}.`;

  return new Schema.SchemaError(
    new SchemaIssue.InvalidValue({ message }, value)
  );
};

export const assertMade = (
  value: unknown,
  handle: Handle,
  gate: Gate
): void => {
  const failure = foreignRefusal(value, handle, gate);

  if (failure !== undefined) {
    throw failure;
  }
};

export const isModelCodec = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  isHandle(value as Handle) &&
  schemaTable.has(value);

const strictResult = <A>(
  failure: Schema.SchemaError | undefined,
  run: () => Result.Result<A, Schema.SchemaError>
): Result.Result<A, Schema.SchemaError> =>
  failure === undefined ? run() : Result.fail(failure);

const ensureExactShape = (value: unknown, handle: Handle): void => {
  const failure = assertNoForeignKeys(value, handle);

  if (failure !== undefined) {
    throw failure;
  }
};

export function codec<S extends Codec>(
  schema: S
): ModelCodec<S["Type"], S["Encoded"]>;

export function codec<S extends Codec>(
  name: string,
  schema: S
): ModelCodec<S["Type"], S["Encoded"]>;
export function codec<S extends Codec>(
  nameOrSchema: string | S,
  maybeSchema?: S
): ModelCodec<S["Type"], S["Encoded"]> {
  const name = typeof nameOrSchema === "string" ? nameOrSchema : "Model";

  const schema = (
    typeof nameOrSchema === "string" ? maybeSchema : nameOrSchema
  )!;

  const handle: ModelCodec<S["Type"], S["Encoded"]> = {
    decode: (input) =>
      strictResult(assertNoForeignKeys(input, handle), () =>
        Result.map(
          Schema.decodeUnknownResult(schema, strictOptions)(input),
          (decoded) => {
            sealDecoded(
              schema.ast,
              decoded,
              new WeakSet<object>(),
              kindNames.get(schema.ast)
            );

            return decoded;
          }
        )
      ),
    encode: (value) =>
      strictResult(
        nestedRefusal(value, handle, {
          domain: name,
          where: `encode of ${name}`,
        }),
        () => Schema.encodeUnknownResult(schema, strictOptions)(value)
      ),
    name,
  };

  schemaTable.set(handle, schema);
  kindNames.set(schema.ast, name);

  return handle;
}

export const decodeModel = <S extends Codec>(
  schema: S,
  input: unknown
): S["Type"] => {
  ensureExactShape(input, schema);

  const decoded = Schema.decodeUnknownSync(schema, strictOptions)(input);

  sealDecoded(
    schema.ast,
    decoded,
    new WeakSet<object>(),
    kindNames.get(schema.ast)
  );

  return decoded;
};

export function parse<T, E>(handle: ModelCodec<T, E>, input: unknown): T;
export function parse(handle: unknown, input: unknown): unknown {
  if (!isModelCodec(handle)) {
    throw new Error(
      "parse takes a model codec handle, not a schema: build the value with the factory or codec for its domain."
    );
  }

  return decodeModel(schemaOf(handle as Handle), input);
}

export function render<S extends Codec>(
  schema: S,
  value: S["Type"]
): S["Encoded"];
export function render<T, E>(handle: ModelCodec<T, E>, value: T): E;
export function render(handle: unknown, value: unknown): unknown {
  const { name } = handle as ModelCodec<unknown, unknown>;

  const gate = { domain: name, where: `render of ${name}` };
  const failure = nestedRefusal(value, handle as Handle, gate);

  if (failure !== undefined) {
    throw failure;
  }

  return Schema.encodeSync(schemaOf(handle as Handle), strictOptions)(value);
}

export function verified<S extends Codec>(schema: S, value: unknown): S["Type"];
export function verified<T, E>(handle: ModelCodec<T, E>, value: unknown): T;
export function verified(handle: unknown, value: unknown): unknown {
  ensureExactShape(value, handle as Handle);

  const schema = schemaOf(handle as Handle);

  return decodeModel(
    schema,
    Schema.encodeUnknownSync(schema, strictOptions)(value)
  );
}
