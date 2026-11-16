import {
  Effect,
  Predicate,
  Result,
  Schema,
  SchemaAST,
  SchemaIssue,
} from "effect";

type Member = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type Codec = Member;

type TypeOf<S> = S extends { readonly Type: infer T } ? T : never;

type KeysOf<T> = T extends unknown ? keyof T : never;

type AllKeys<Members extends readonly Member[]> = KeysOf<
  TypeOf<Members[number]>
>;

type ClosedMember<
  Members extends readonly Member[],
  Index extends keyof Members,
> = TypeOf<Members[Index]> &
  Partial<
    Record<Exclude<AllKeys<Members>, keyof TypeOf<Members[Index]>>, never>
  >;

type ClosedMembers<Members extends readonly Member[]> = {
  [Index in keyof Members]: Members[Index] & {
    readonly Type: ClosedMember<Members, Index>;
  };
};

const CandidateSchema = Schema.Record(Schema.String, Schema.Unknown);

type Candidate = typeof CandidateSchema.Type;

const declaredFields = (
  ast: SchemaAST.Objects
): ReadonlyMap<string, SchemaAST.AST> =>
  new Map(
    ast.propertySignatures.flatMap((signature) =>
      Predicate.isString(signature.name)
        ? [[signature.name, signature.type] as const]
        : []
    )
  );

const matchesTag = (ast: SchemaAST.AST, tag: string): boolean =>
  (Predicate.isTagged(ast, "Literal") && ast.literal === tag) ||
  (Predicate.isTagged(ast, "Union") &&
    ast.types.some(
      (member) =>
        Predicate.isTagged(member, "Literal") && member.literal === tag
    ));

const resolved = (ast: SchemaAST.AST): SchemaAST.AST => {
  if (!Predicate.isTagged(ast, "Declaration")) {
    return ast;
  }

  const [inner] = ast.typeParameters;

  return inner === undefined ? ast : resolved(inner);
};

const branchOf = (
  ast: SchemaAST.AST,
  value: Candidate
): SchemaAST.AST | undefined => {
  if (!Predicate.isTagged(ast, "Union")) {
    return undefined;
  }

  const tag = value._tag;

  if (!Predicate.isString(tag)) {
    return undefined;
  }

  return ast.types.find((candidate) => {
    const member = resolved(candidate);

    if (!Predicate.isTagged(member, "Objects")) {
      return false;
    }

    const declared = declaredFields(member).get("_tag");

    return declared !== undefined && matchesTag(declared, tag);
  });
};

const unionKeys = (ast: SchemaAST.AST): ReadonlySet<string> =>
  new Set(
    Predicate.isTagged(ast, "Union")
      ? ast.types.flatMap((candidate) => {
          const member = resolved(candidate);

          return Predicate.isTagged(member, "Objects")
            ? [...declaredFields(member).keys()]
            : [];
        })
      : []
  );

const strayInUnion = (
  ast: SchemaAST.AST,
  value: Candidate
): string | undefined => {
  const branch = branchOf(ast, value);

  if (branch !== undefined) {
    return strayField(branch, value);
  }

  const known = unionKeys(ast);

  return Object.keys(value).find((key) => !known.has(key));
};

const strayField = (
  ast: SchemaAST.AST,
  value: Candidate
): string | undefined => {
  if (Predicate.isTagged(ast, "Union")) {
    return strayInUnion(ast, value);
  }

  if (Predicate.isTagged(ast, "Declaration")) {
    const [declared] = ast.typeParameters;

    return declared === undefined ? undefined : strayField(declared, value);
  }

  if (!Predicate.isTagged(ast, "Objects") || ast.indexSignatures.length > 0) {
    return undefined;
  }

  const fields = declaredFields(ast);

  for (const key of Object.keys(value)) {
    const field = fields.get(key);

    if (field === undefined) {
      return key;
    }

    if (Predicate.isTagged(field, "Never")) {
      continue;
    }

    const child = value[key];

    if (Predicate.isObject(child)) {
      const nested = strayField(
        field,
        Schema.decodeSync(CandidateSchema)(child)
      );

      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
};

const fromResult = <T>(
  result: Result.Result<T, Schema.SchemaError>
): Effect.Effect<T, SchemaIssue.Issue> =>
  Result.isSuccess(result)
    ? Effect.succeed(result.success)
    : Effect.fail(result.failure.issue);

const strictOptions = (
  options: SchemaAST.ParseOptions
): SchemaAST.ParseOptions => ({
  ...options,
  onExcessProperty: "error",
});

const strayIssue = (
  stray: string,
  cause: unknown,
  options: SchemaAST.ParseOptions
): SchemaIssue.InvalidValue =>
  new SchemaIssue.InvalidValue(
    { message: `unexpected field "${stray}"` },
    cause,
    options
  );

const rejectStray =
  (ast: SchemaAST.AST, options: SchemaAST.ParseOptions) =>
  (input: Candidate): Effect.Effect<void, SchemaIssue.Issue> => {
    const stray = strayField(ast, input);

    return stray === undefined
      ? Effect.void
      : Effect.fail(strayIssue(stray, input, options));
  };

const assertStrayFree = (
  ast: SchemaAST.AST | undefined,
  cause: unknown
): void => {
  if (ast === undefined || !Predicate.isObject(cause)) {
    return;
  }

  const candidate = Schema.decodeSync(CandidateSchema)(cause);

  const stray = strayField(ast, candidate);

  if (stray !== undefined) {
    throw new Error(`Schema validation failed: unexpected field "${stray}"`, {
      cause: strayIssue(stray, cause, { onExcessProperty: "error" }),
    });
  }
};

const isCodec = (value: unknown): value is Codec => Schema.isSchema(value);

const closeDoors = (schema: Codec, wrapped: Codec): void => {
  if (
    Predicate.hasProperty(schema, "cases") &&
    Predicate.isObject(schema.cases)
  ) {
    Object.assign(wrapped, {
      cases: Object.fromEntries(
        Object.entries(schema.cases).flatMap(([tag, member]) =>
          isCodec(member) ? [[tag, closed(member)]] : []
        )
      ),
    });
  }

  if (
    Predicate.hasProperty(schema, "members") &&
    Array.isArray(schema.members)
  ) {
    Object.assign(wrapped, {
      members: schema.members.flatMap((member) =>
        isCodec(member) ? [closed(member)] : []
      ),
    });
  }
};

export const closed = <S extends Codec>(schema: S): S => {
  const encodedAst = Schema.toEncoded(schema).ast;

  const typeAst = Schema.toType(schema).ast;

  const declaresFields =
    Predicate.isTagged(typeAst, "Objects") ||
    Predicate.isTagged(typeAst, "Union");

  const storedAst = Predicate.isTagged(encodedAst, "Objects")
    ? encodedAst
    : undefined;

  const scanAst = declaresFields ? typeAst : storedAst;

  const ast = new SchemaAST.Declaration(
    [encodedAst],
    () => (input, _self, options) => {
      const decode = () =>
        fromResult(
          Schema.decodeUnknownResult(schema, strictOptions(options))(input)
        );

      if (!Predicate.isObject(input)) {
        return decode();
      }

      return rejectStray(
        encodedAst,
        options
      )(Schema.decodeSync(CandidateSchema)(input)).pipe(Effect.flatMap(decode));
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => (input, _self, options) => {
      const encode = () =>
        fromResult(
          Schema.encodeUnknownResult(schema, strictOptions(options))(input)
        );

      if (scanAst === undefined || !Predicate.isObject(input)) {
        return encode();
      }

      return rejectStray(
        scanAst,
        options
      )(Schema.decodeSync(CandidateSchema)(input)).pipe(Effect.flatMap(encode));
    }
  );

  const wrapped = Schema.make<S>(ast);

  Object.defineProperty(wrapped, "make", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: (
      input: Parameters<S["make"]>[0],
      options?: Parameters<S["make"]>[1]
    ) => {
      assertStrayFree(scanAst, input);

      return schema.make(input, options);
    },
  });

  closeDoors(schema, wrapped);

  return wrapped;
};

type ErrorClass = Codec & {
  readonly ast: SchemaAST.AST;
};

interface Factory {
  readonly make: (input: Candidate) => object;
}

const isFactory = (value: Codec): value is Codec & Factory =>
  Predicate.isFunction(value);

export const closedError = <C extends ErrorClass>(errorClass: C): C => {
  const originalAst = errorClass.ast;

  const original = Schema.make<Codec>(originalAst);

  const inherited = (input: Candidate): object => {
    if (!isFactory(errorClass)) {
      throw new TypeError("schema class exposes no make");
    }

    return errorClass.make(input);
  };

  const encodedAst = Schema.toEncoded(original).ast;

  const ast = new SchemaAST.Declaration(
    [originalAst],
    () => (input, _self, options) => {
      const decode = () =>
        fromResult(
          Schema.decodeUnknownResult(original, strictOptions(options))(input)
        );

      if (!Predicate.isObject(input)) {
        return decode();
      }

      return rejectStray(
        encodedAst,
        options
      )(Schema.decodeSync(CandidateSchema)(input)).pipe(Effect.flatMap(decode));
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => (input, _self, options) => {
      const encode = () =>
        fromResult(
          Schema.encodeUnknownResult(original, strictOptions(options))(input)
        );

      if (!Predicate.isObject(input)) {
        return encode();
      }

      return rejectStray(
        encodedAst,
        options
      )(Schema.decodeSync(CandidateSchema)(input)).pipe(Effect.flatMap(encode));
    }
  );

  Object.defineProperty(errorClass, "ast", {
    configurable: true,
    enumerable: false,
    value: ast,
  });

  Object.defineProperty(errorClass, "make", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: (input: Candidate): object => {
      assertStrayFree(encodedAst, input);

      return inherited(input);
    },
  });

  return errorClass;
};

export const closedUnion = <
  const Members extends readonly [Member, ...Member[]],
>(
  members: Members
): Schema.Union<ClosedMembers<Members>> => {
  const union = Schema.make<Schema.Union<ClosedMembers<Members>>>(
    Schema.Union(members).ast
  );

  Object.assign(union, { members });

  return union;
};
