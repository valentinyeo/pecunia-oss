import {
  AliasIdSchema,
  AliasMatchTypeSchema,
  CategoryIdSchema,
  DisplayNameSchema,
  PayeeIdSchema,
  PayeeKindSchema,
  ProfileIdSchema,
  RuleDirectionSchema,
  RuleIdSchema,
  RuleSchema,
  SpendingTypeSchema,
} from "@pecunia/categorize";
import type {
  Category,
  MerchantAlias,
  Payee,
  ProfileId,
  Rule,
} from "@pecunia/categorize";
import { Effect, Option, Schema } from "effect";

import { CategorizationError } from "./categorization-model.js";
import type {
  CategorizationOperation,
  CategorizationSnapshot,
} from "./categorization-model.js";
import type { RuleNotFound } from "./rule-not-found.js";

const enabledFlags = Schema.Literals([0, 1]);

const ruleKinds = Schema.Literals([
  "categorize",
  "exclude",
  "income_client",
  "internal_transfer",
  "refund",
  "self_transfer",
  "tax_payment",
]);

export const PersistedCategoryRowSchema = Schema.Struct({
  archivedAt: Schema.NullOr(Schema.Int),
  color: DisplayNameSchema,
  createdAt: Schema.Int,
  id: CategoryIdSchema,
  name: DisplayNameSchema,
  parentId: Schema.NullOr(CategoryIdSchema),
  profileId: ProfileIdSchema,
  spendingType: SpendingTypeSchema,
});

export type PersistedCategoryRow = typeof PersistedCategoryRowSchema.Type;

export const PersistedPayeeRowSchema = Schema.Struct({
  archivedAt: Schema.NullOr(Schema.Int),
  createdAt: Schema.Int,
  defaultCategoryId: Schema.NullOr(CategoryIdSchema),
  id: PayeeIdSchema,
  kind: PayeeKindSchema,
  name: DisplayNameSchema,
  normalizedName: DisplayNameSchema,
  profileId: ProfileIdSchema,
});

export type PersistedPayeeRow = typeof PersistedPayeeRowSchema.Type;

export const PersistedAliasRowSchema = Schema.Struct({
  createdAt: Schema.Int,
  id: AliasIdSchema,
  matchType: AliasMatchTypeSchema,
  pattern: DisplayNameSchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
});

export type PersistedAliasRow = typeof PersistedAliasRowSchema.Type;

export const PersistedRuleRowSchema = Schema.Struct({
  categoryId: Schema.NullOr(CategoryIdSchema),
  clientPayeeId: Schema.NullOr(PayeeIdSchema),
  counterpartProfileId: Schema.NullOr(ProfileIdSchema),
  createdAt: Schema.Int,
  direction: RuleDirectionSchema,
  enabled: enabledFlags,
  id: RuleIdSchema,
  kind: ruleKinds,
  matchField: Schema.Literals(["description", "merchant", "reference"]),
  matchType: Schema.Literals(["contains", "digits_only", "exact", "prefix"]),
  maxAmountMinor: Schema.NullOr(Schema.Int),
  minAmountMinor: Schema.NullOr(Schema.Int),
  obligationKind: Schema.NullOr(DisplayNameSchema),
  pattern: DisplayNameSchema,
  priority: Schema.Int,
  profileId: ProfileIdSchema,
  updatedAt: Schema.Int,
});

export type PersistedRuleRow = typeof PersistedRuleRowSchema.Type;

export interface CategorizationOperations {
  readonly insertAlias: (
    row: PersistedAliasRow
  ) => Effect.Effect<unknown, CategorizationError>;
  readonly insertCategory: (
    row: PersistedCategoryRow
  ) => Effect.Effect<unknown, CategorizationError>;
  readonly insertPayee: (
    row: PersistedPayeeRow
  ) => Effect.Effect<unknown, CategorizationError>;
  readonly insertRule: (
    row: PersistedRuleRow
  ) => Effect.Effect<unknown, CategorizationError>;
  readonly listAliases: (
    profileId: ProfileId
  ) => Effect.Effect<readonly unknown[], CategorizationError>;
  readonly listCategories: (
    profileId: ProfileId
  ) => Effect.Effect<readonly unknown[], CategorizationError>;
  readonly listPayees: (
    profileId: ProfileId
  ) => Effect.Effect<readonly unknown[], CategorizationError>;
  readonly listRules: (
    profileId: ProfileId
  ) => Effect.Effect<readonly unknown[], CategorizationError>;
  readonly replaceRule: (
    row: PersistedRuleRow
  ) => Effect.Effect<unknown, CategorizationError | RuleNotFound>;
}

export const categoryRow = (
  category: Category,
  createdAt: number
): PersistedCategoryRow => ({
  archivedAt: null,
  color: category.color,
  createdAt,
  id: category.id,
  name: category.name,
  parentId: category.parentId,
  profileId: category.profileId,
  spendingType: category.spendingType,
});

export const payeeRow = (
  payee: Payee,
  createdAt: number
): PersistedPayeeRow => ({
  archivedAt: null,
  createdAt,
  defaultCategoryId: payee.defaultCategoryId,
  id: payee.id,
  kind: payee.kind,
  name: payee.name,
  normalizedName: payee.normalizedName,
  profileId: payee.profileId,
});

export const aliasRow = (
  alias: MerchantAlias,
  createdAt: number
): PersistedAliasRow => ({
  createdAt,
  id: alias.id,
  matchType: alias.matchType,
  pattern: alias.pattern,
  payeeId: alias.payeeId,
  profileId: alias.profileId,
});

export const ruleRow = (
  rule: Rule,
  createdAt: number,
  updatedAt: number
): PersistedRuleRow => ({
  categoryId: rule.kind === "categorize" ? rule.categoryId : null,
  clientPayeeId: rule.kind === "income_client" ? rule.clientPayeeId : null,
  counterpartProfileId:
    rule.kind === "self_transfer"
      ? Option.getOrNull(rule.counterpartProfileId)
      : null,
  createdAt,
  direction: rule.direction,
  enabled: rule.enabled ? 1 : 0,
  id: rule.id,
  kind: rule.kind,
  matchField: rule.matchField,
  matchType: rule.matchType,
  maxAmountMinor: Option.getOrNull(rule.maxAmount),
  minAmountMinor: Option.getOrNull(rule.minAmount),
  obligationKind: rule.kind === "tax_payment" ? rule.obligationKind : null,
  pattern: rule.pattern,
  priority: rule.priority,
  profileId: rule.profileId,
  updatedAt,
});

const failed =
  (operation: CategorizationOperation) =>
  (cause: unknown): CategorizationError =>
    new CategorizationError({ cause, operation });

const categoryFromRow = (row: PersistedCategoryRow): Category => ({
  archived: row.archivedAt !== null,
  color: row.color,
  id: row.id,
  name: row.name,
  parentId: row.parentId,
  profileId: row.profileId,
  spendingType: row.spendingType,
});

const payeeFromRow = (row: PersistedPayeeRow): Payee => ({
  archived: row.archivedAt !== null,
  defaultCategoryId: row.defaultCategoryId,
  id: row.id,
  kind: row.kind,
  name: row.name,
  normalizedName: row.normalizedName,
  profileId: row.profileId,
});

const aliasFromRow = (row: PersistedAliasRow): MerchantAlias => ({
  id: row.id,
  matchType: row.matchType,
  pattern: row.pattern,
  payeeId: row.payeeId,
  profileId: row.profileId,
});

const ruleCandidate = (
  row: PersistedRuleRow
): Schema.Codec.Encoded<typeof RuleSchema> | undefined => {
  const base = {
    direction: row.direction,
    enabled: row.enabled === 1,
    id: row.id,
    matchField: row.matchField,
    matchType: row.matchType,
    maxAmount: row.maxAmountMinor,
    minAmount: row.minAmountMinor,
    pattern: row.pattern,
    priority: row.priority,
    profileId: row.profileId,
  };

  switch (row.kind) {
    case "categorize": {
      return row.categoryId === null
        ? undefined
        : { ...base, categoryId: row.categoryId, kind: row.kind };
    }

    case "income_client": {
      return row.clientPayeeId === null
        ? undefined
        : { ...base, clientPayeeId: row.clientPayeeId, kind: row.kind };
    }

    case "self_transfer": {
      return {
        ...base,
        counterpartProfileId: row.counterpartProfileId,
        kind: row.kind,
      };
    }

    case "tax_payment": {
      return row.obligationKind === null
        ? undefined
        : { ...base, kind: row.kind, obligationKind: row.obligationKind };
    }

    case "exclude":
    case "internal_transfer":
    case "refund": {
      return { ...base, kind: row.kind };
    }

    default: {
      return row.kind satisfies never;
    }
  }
};

const decodeRows = <RowSchema extends Schema.Constraint, Entity>(
  schema: RowSchema,
  rows: readonly unknown[],
  operation: CategorizationOperation,
  toEntity: (row: RowSchema["Type"]) => Entity
): Effect.Effect<
  readonly Entity[],
  CategorizationError,
  RowSchema["DecodingServices"]
> =>
  // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
  Effect.forEach(rows, (row) =>
    Schema.decodeUnknownEffect(schema)(row).pipe(
      Effect.map(toEntity),
      Effect.mapError(failed(operation))
    )
  );

const decodeRule = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Port rows arrive as unknown and this decoder is the boundary that proves their shape.
  row: unknown,
  operation: CategorizationOperation
): Effect.Effect<Rule, CategorizationError> =>
  Schema.decodeUnknownEffect(PersistedRuleRowSchema)(row).pipe(
    Effect.mapError(failed(operation)),
    Effect.flatMap((persisted) => {
      const candidate = ruleCandidate(persisted);

      return candidate === undefined
        ? Effect.fail(
            new CategorizationError({
              cause: new Error("Stored rule has no target for its kind"),
              operation,
            })
          )
        : Schema.decodeEffect(RuleSchema)(candidate).pipe(
            Effect.mapError(failed(operation))
          );
    })
  );

export interface CategorizationRepository {
  readonly recordAlias: (
    alias: MerchantAlias,
    createdAt: number
  ) => Effect.Effect<MerchantAlias, CategorizationError>;
  readonly recordCategory: (
    category: Category,
    createdAt: number
  ) => Effect.Effect<Category, CategorizationError>;
  readonly recordPayee: (
    payee: Payee,
    createdAt: number
  ) => Effect.Effect<Payee, CategorizationError>;
  readonly recordRule: (
    rule: Rule,
    createdAt: number
  ) => Effect.Effect<Rule, CategorizationError | RuleNotFound>;
  readonly replaceRule: (
    rule: Rule,
    updatedAt: number
  ) => Effect.Effect<Rule, CategorizationError | RuleNotFound>;
  readonly snapshot: (
    profileId: ProfileId
  ) => Effect.Effect<CategorizationSnapshot, CategorizationError>;
}

export const categorizationRepository = (
  operations: CategorizationOperations
): CategorizationRepository => ({
  recordAlias: Effect.fn("CategorizationRepository.recordAlias")(
    function* recordAlias(alias, createdAt) {
      const inserted = yield* operations.insertAlias(
        aliasRow(alias, createdAt)
      );

      return yield* Schema.decodeUnknownEffect(PersistedAliasRowSchema)(
        inserted
      ).pipe(Effect.map(aliasFromRow), Effect.mapError(failed("createAlias")));
    }
  ),
  recordCategory: Effect.fn("CategorizationRepository.recordCategory")(
    function* recordCategory(category, createdAt) {
      const inserted = yield* operations.insertCategory(
        categoryRow(category, createdAt)
      );

      return yield* Schema.decodeUnknownEffect(PersistedCategoryRowSchema)(
        inserted
      ).pipe(
        Effect.map(categoryFromRow),
        Effect.mapError(failed("createCategory"))
      );
    }
  ),
  recordPayee: Effect.fn("CategorizationRepository.recordPayee")(
    function* recordPayee(payee, createdAt) {
      const inserted = yield* operations.insertPayee(
        payeeRow(payee, createdAt)
      );

      return yield* Schema.decodeUnknownEffect(PersistedPayeeRowSchema)(
        inserted
      ).pipe(Effect.map(payeeFromRow), Effect.mapError(failed("createPayee")));
    }
  ),
  recordRule: Effect.fn("CategorizationRepository.recordRule")(
    function* recordRule(rule, createdAt) {
      const inserted = yield* operations.insertRule(
        ruleRow(rule, createdAt, createdAt)
      );

      return yield* decodeRule(inserted, "createRule");
    }
  ),
  replaceRule: Effect.fn("CategorizationRepository.replaceRule")(
    function* replaceRule(rule, updatedAt) {
      const replaced = yield* operations.replaceRule(
        ruleRow(rule, updatedAt, updatedAt)
      );

      return yield* decodeRule(replaced, "replaceRule");
    }
  ),
  snapshot: Effect.fn("CategorizationRepository.snapshot")(
    function* snapshot(profileId) {
      const categories = yield* operations.listCategories(profileId);
      const payees = yield* operations.listPayees(profileId);
      const aliases = yield* operations.listAliases(profileId);
      const rules = yield* operations.listRules(profileId);

      return {
        aliases: yield* decodeRows(
          PersistedAliasRowSchema,
          aliases,
          "listAliases",
          aliasFromRow
        ),
        categories: yield* decodeRows(
          PersistedCategoryRowSchema,
          categories,
          "listCategories",
          categoryFromRow
        ),
        payees: yield* decodeRows(
          PersistedPayeeRowSchema,
          payees,
          "listPayees",
          payeeFromRow
        ),
        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
        rules: yield* Effect.forEach(rules, (row) =>
          decodeRule(row, "listRules")
        ),
      };
    }
  ),
});
