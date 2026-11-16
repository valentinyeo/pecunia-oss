import {
  AliasIdSchema,
  CategoryIdSchema,
  DisplayNameSchema,
  PayeeIdSchema,
  RuleDraftSchema,
  RuleIdSchema,
  RuleSchema,
  normalizeName,
  sortLine,
} from "@pecunia/categorize";
import type {
  Category,
  LineDecision,
  MatchableLine,
  MerchantAlias,
  Payee,
  ProfileId,
  Rule,
  RuleDraft,
} from "@pecunia/categorize";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import {
  CategorizationError,
  CreateAliasInputSchema,
  CreateCategoryInputSchema,
  CreatePayeeInputSchema,
} from "./categorization-model.js";
import type {
  CategorizationOperation,
  CategorizationSnapshot,
  CreateAliasInput,
  CreateCategoryInput,
  CreatePayeeInput,
} from "./categorization-model.js";
import { categorizationRepository } from "./categorization-store.js";
import type { CategorizationOperations } from "./categorization-store.js";
import { InvalidCategorizationInput } from "./invalid-categorization-input.js";
import type { RuleNotFound } from "./rule-not-found.js";

type ServiceFailure =
  | CategorizationError
  | InvalidCategorizationInput
  | RuleNotFound;

export class Categorization extends Context.Service<
  Categorization,
  {
    readonly createAlias: (
      input: CreateAliasInput
    ) => Effect.Effect<MerchantAlias, ServiceFailure>;
    readonly createCategory: (
      input: CreateCategoryInput
    ) => Effect.Effect<Category, ServiceFailure>;
    readonly createPayee: (
      input: CreatePayeeInput
    ) => Effect.Effect<Payee, ServiceFailure>;
    readonly createRule: (
      profileId: ProfileId,
      draft: RuleDraft
    ) => Effect.Effect<Rule, ServiceFailure>;
    readonly decide: (
      profileId: ProfileId,
      line: MatchableLine
    ) => Effect.Effect<LineDecision, CategorizationError>;
    readonly snapshot: (
      profileId: ProfileId
    ) => Effect.Effect<CategorizationSnapshot, CategorizationError>;
    readonly updateRule: (
      profileId: ProfileId,
      ruleId: Rule["id"],
      draft: RuleDraft
    ) => Effect.Effect<Rule, ServiceFailure>;
  }
>()("@pecunia/database/Categorization") {}

const decodeInput = <SchemaType extends Schema.Constraint>(
  schema: SchemaType,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Capability input arrives as unknown and this decoder is the boundary that proves its shape.
  input: unknown,
  operation: CategorizationOperation
): Effect.Effect<
  SchemaType["Type"],
  InvalidCategorizationInput,
  SchemaType["DecodingServices"]
> =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      (cause) => new InvalidCategorizationInput({ cause, operation })
    )
  );

const payeeName = (
  name: CreatePayeeInput["name"]
): Effect.Effect<string, InvalidCategorizationInput> =>
  Schema.decodeEffect(DisplayNameSchema)(normalizeName(name)).pipe(
    Effect.mapError(
      (cause) =>
        new InvalidCategorizationInput({ cause, operation: "createPayee" })
    )
  );

const encodeDraft = (
  profileId: ProfileId,
  ruleId: Rule["id"],
  draft: RuleDraft
): Schema.Codec.Encoded<typeof RuleSchema> => {
  const base = {
    direction: draft.direction,
    enabled: draft.enabled,
    id: ruleId,
    matchField: draft.matchField,
    matchType: draft.matchType,
    maxAmount: Option.getOrNull(draft.maxAmount),
    minAmount: Option.getOrNull(draft.minAmount),
    pattern: draft.pattern,
    priority: draft.priority,
    profileId,
  };

  switch (draft.kind) {
    case "categorize": {
      return { ...base, categoryId: draft.categoryId, kind: draft.kind };
    }

    case "income_client": {
      return { ...base, clientPayeeId: draft.clientPayeeId, kind: draft.kind };
    }

    case "self_transfer": {
      return {
        ...base,
        counterpartProfileId: Option.getOrNull(draft.counterpartProfileId),
        kind: draft.kind,
      };
    }

    case "tax_payment": {
      return {
        ...base,
        kind: draft.kind,
        obligationKind: draft.obligationKind,
      };
    }

    case "exclude":
    case "internal_transfer":
    case "refund": {
      return { ...base, kind: draft.kind };
    }

    default: {
      return draft satisfies never;
    }
  }
};

const ruleFromDraft = (
  profileId: ProfileId,
  ruleId: Rule["id"],
  draft: RuleDraft,
  operation: CategorizationOperation
): Effect.Effect<Rule, InvalidCategorizationInput> =>
  decodeInput(
    RuleDraftSchema,
    {
      ...draft,
      maxAmount: Option.getOrNull(draft.maxAmount),
      minAmount: Option.getOrNull(draft.minAmount),
    },
    operation
  ).pipe(
    Effect.flatMap((validated) =>
      decodeInput(
        RuleSchema,
        encodeDraft(profileId, ruleId, validated),
        operation
      )
    )
  );

const makeCategorizationService = (
  store: ReturnType<typeof categorizationRepository>,
  crypto: SecureRandom.SecureRandom["Service"]
) => {
  const newId = <SchemaType extends Schema.Constraint>(
    schema: SchemaType,
    operation: CategorizationOperation
  ): Effect.Effect<
    SchemaType["Type"],
    CategorizationError,
    SchemaType["DecodingServices"]
  > =>
    crypto.uuidV7().pipe(
      Effect.flatMap((value) => Schema.decodeEffect(schema)(value)),
      Effect.mapError((cause) => new CategorizationError({ cause, operation }))
    );

  return Categorization.of({
    createAlias: Effect.fn("Categorization.createAlias")(
      function* createAlias(input) {
        const parsed = yield* decodeInput(
          CreateAliasInputSchema,
          input,
          "createAlias"
        );

        return yield* store.recordAlias(
          {
            id: yield* newId(AliasIdSchema, "createAlias"),
            matchType: parsed.matchType,
            pattern: parsed.pattern,
            payeeId: parsed.payeeId,
            profileId: parsed.profileId,
          },
          yield* Clock.currentTimeMillis
        );
      }
    ),
    createCategory: Effect.fn("Categorization.createCategory")(
      function* createCategory(input) {
        const parsed = yield* decodeInput(
          CreateCategoryInputSchema,
          input,
          "createCategory"
        );

        return yield* store.recordCategory(
          {
            archived: false,
            color: parsed.color,
            id: yield* newId(CategoryIdSchema, "createCategory"),
            name: parsed.name,
            parentId: parsed.parentId,
            profileId: parsed.profileId,
            spendingType: parsed.spendingType,
          },
          yield* Clock.currentTimeMillis
        );
      }
    ),
    createPayee: Effect.fn("Categorization.createPayee")(
      function* createPayee(input) {
        const parsed = yield* decodeInput(
          CreatePayeeInputSchema,
          input,
          "createPayee"
        );

        return yield* store.recordPayee(
          {
            archived: false,
            defaultCategoryId: parsed.defaultCategoryId,
            id: yield* newId(PayeeIdSchema, "createPayee"),
            kind: parsed.kind,
            name: parsed.name,
            normalizedName: yield* payeeName(parsed.name),
            profileId: parsed.profileId,
          },
          yield* Clock.currentTimeMillis
        );
      }
    ),
    createRule: Effect.fn("Categorization.createRule")(
      function* createRule(profileId, draft) {
        const rule = yield* ruleFromDraft(
          profileId,
          yield* newId(RuleIdSchema, "createRule"),
          draft,
          "createRule"
        );

        return yield* store.recordRule(rule, yield* Clock.currentTimeMillis);
      }
    ),
    decide: Effect.fn("Categorization.decide")(
      function* decide(profileId, line) {
        const snapshot = yield* store.snapshot(profileId);

        return sortLine(line, {
          aliases: snapshot.aliases,
          rules: snapshot.rules,
        });
      }
    ),
    snapshot: Effect.fn("Categorization.snapshot")((profileId) =>
      store.snapshot(profileId)
    ),
    updateRule: Effect.fn("Categorization.updateRule")(
      function* updateRule(profileId, ruleId, draft) {
        const rule = yield* ruleFromDraft(
          profileId,
          ruleId,
          draft,
          "replaceRule"
        );

        return yield* store.replaceRule(rule, yield* Clock.currentTimeMillis);
      }
    ),
  });
};

export const categorizationLayer = <Failure, Requirements>(
  operations: Effect.Effect<CategorizationOperations, Failure, Requirements>
) =>
  Layer.effect(
    Categorization,
    Effect.gen(function* buildCategorizationLayer() {
      const storeOperations = yield* operations;
      const crypto = yield* SecureRandom.SecureRandom;

      return makeCategorizationService(
        categorizationRepository(storeOperations),
        crypto
      );
    })
  );
