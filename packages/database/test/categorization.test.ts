import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import {
  CategorizationSchema,
  CategoryIdSchema,
  ClassificationSchema,
  MatchableLineSchema,
  MinorUnitsSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
} from "@pecunia/categorize";
import type { MatchableLine, ProfileId, RuleDraft } from "@pecunia/categorize";
import { eq } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/sql-js";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type { Database } from "sql.js";

import {
  Categorization,
  categorizationLayer,
  CategorizationError,
  InvalidCategorizationInput,
  RuleNotFound,
} from "../src/index.js";
import type {
  CategorizationOperations,
  PersistedRuleRow,
} from "../src/index.js";
import {
  Categories,
  MerchantAliases,
  Payees,
  Rules,
} from "../src/schema/d1.js";
import { applyDemoSeed, openMigratedDatabase } from "./sqlite-database.js";

const profileId = (value: string): ProfileId =>
  Schema.decodeSync(ProfileIdSchema)(value);

const business = profileId("0192f0c1-0001-702d-8484-48490b729601");

const personal = profileId("0192f0c1-0002-7f50-85ff-5ffb4c3ef459");

const cloudCategory = Schema.decodeSync(CategoryIdSchema)(
  "0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba"
);

const travelCategory = Schema.decodeSync(CategoryIdSchema)(
  "0192f0c1-0010-744d-827c-27cf38c20ebb"
);

const subscriptionsCategory = Schema.decodeSync(CategoryIdSchema)(
  "0192f0c1-000f-755b-8ae4-ae47d20b52cf"
);

const cloudRule = Schema.decodeSync(RuleIdSchema)(
  "0192f0c1-0015-727a-8b92-b929ac9448a7"
);

const cloudPayee = Schema.decodeSync(PayeeIdSchema)(
  "0192f0c1-0009-71f7-8998-998f8330df68"
);

const absentRule = Schema.decodeSync(RuleIdSchema)(
  "0192f0c1-0fff-7abc-8abc-000000000000"
);

const line = (overrides: {
  readonly description?: string;
  readonly direction?: "in" | "neutral" | "out";
  readonly merchant?: string;
  readonly minorAmount?: number;
  readonly reference?: string;
}): MatchableLine =>
  Schema.decodeSync(MatchableLineSchema)({
    description: "",
    direction: "out",
    merchant: "",
    minorAmount: 0,
    reference: "",
    ...overrides,
  });

const cloudLine = line({
  description: "Cloud hosting",
  merchant: "Demo Cloud Hosting",
  minorAmount: 299_000,
});

const railLine = line({
  description: "Demo Rail ticket",
  merchant: "Demo Rail",
  minorAmount: 12_000,
});

const seasonLine = line({
  description: "Rail season ticket",
  merchant: "Rail Season Tickets",
  minorAmount: 250_000,
});

const categorizeDraft = (options: {
  readonly categoryId: typeof travelCategory;
  readonly enabled?: boolean;
  readonly matchType?: "contains" | "digits_only" | "exact" | "prefix";
  readonly maxAmount?: number;
  readonly minAmount?: number;
  readonly pattern: string;
  readonly priority: number;
}): RuleDraft => ({
  categoryId: options.categoryId,
  direction: "any",
  enabled: options.enabled ?? true,
  kind: "categorize",
  matchField: "merchant",
  matchType: options.matchType ?? "contains",
  maxAmount:
    options.maxAmount === undefined
      ? Option.none()
      : Option.some(Schema.decodeSync(MinorUnitsSchema)(options.maxAmount)),
  minAmount:
    options.minAmount === undefined
      ? Option.none()
      : Option.some(Schema.decodeSync(MinorUnitsSchema)(options.minAmount)),
  pattern: options.pattern,
  priority: options.priority,
});

class TestDatabase extends Context.Service<
  TestDatabase,
  { readonly connection: Database }
>()("@pecunia/database/test/TestDatabase") {}

const categorizationOperations = (
  db: ReturnType<typeof drizzleSqlite>
): CategorizationOperations => ({
  insertAlias: (row) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "createAlias" }),
      // @effect-diagnostics-next-line asyncFunction:off -- The SQL.js Drizzle adapter exposes Promise-based queries.
      try: async () => {
        const [inserted] = await db
          .insert(MerchantAliases)
          .values({
            createdAt: row.createdAt,
            id: row.id,
            matchType: row.matchType,
            pattern: row.pattern,
            payeeId: row.payeeId,
            profileId: row.profileId,
          })
          .returning();

        return inserted;
      },
    }),
  insertCategory: (row) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "createCategory" }),
      // @effect-diagnostics-next-line asyncFunction:off -- The SQL.js Drizzle adapter exposes Promise-based queries.
      try: async () => {
        const [inserted] = await db
          .insert(Categories)
          .values({
            archivedAt: row.archivedAt,
            color: row.color,
            createdAt: row.createdAt,
            id: row.id,
            name: row.name,
            parentId: row.parentId,
            profileId: row.profileId,
            spendingType: row.spendingType,
          })
          .returning();

        return inserted;
      },
    }),
  insertPayee: (row) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "createPayee" }),
      // @effect-diagnostics-next-line asyncFunction:off -- The SQL.js Drizzle adapter exposes Promise-based queries.
      try: async () => {
        const [inserted] = await db
          .insert(Payees)
          .values({
            archivedAt: row.archivedAt,
            createdAt: row.createdAt,
            defaultCategoryId: row.defaultCategoryId,
            id: row.id,
            kind: row.kind,
            name: row.name,
            normalizedName: row.normalizedName,
            profileId: row.profileId,
          })
          .returning();

        return inserted;
      },
    }),
  insertRule: (row) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "createRule" }),
      // @effect-diagnostics-next-line asyncFunction:off -- The SQL.js Drizzle adapter exposes Promise-based queries.
      try: async () => {
        const [inserted] = await db
          .insert(Rules)
          .values({ ...row })
          .returning();

        return inserted;
      },
    }),
  listAliases: (requested) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "listAliases" }),
      try: () =>
        db
          .select()
          .from(MerchantAliases)
          .where(eq(MerchantAliases.profileId, requested)),
    }),
  listCategories: (requested) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "listCategories" }),
      try: () =>
        db.select().from(Categories).where(eq(Categories.profileId, requested)),
    }),
  listPayees: (requested) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "listPayees" }),
      try: () =>
        db.select().from(Payees).where(eq(Payees.profileId, requested)),
    }),
  listRules: (requested) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "listRules" }),
      try: () => db.select().from(Rules).where(eq(Rules.profileId, requested)),
    }),
  replaceRule: (row) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CategorizationError({ cause, operation: "replaceRule" }),
      // @effect-diagnostics-next-line asyncFunction:off -- The SQL.js Drizzle adapter exposes Promise-based queries.
      try: async () => {
        const [replaced] = await db
          .update(Rules)
          .set(row)
          .where(eq(Rules.id, row.id))
          .returning();

        return replaced;
      },
    }).pipe(
      Effect.filterOrFail(
        (replaced): replaced is PersistedRuleRow => replaced !== undefined,
        () => new RuleNotFound({ profileId: row.profileId, ruleId: row.id })
      )
    ),
});

const testLayer = Layer.unwrap(
  Effect.gen(function* buildCategorizationTestLayer() {
    const database = yield* openMigratedDatabase;

    yield* applyDemoSeed(database);

    const db = drizzleSqlite(database);

    return Layer.merge(
      Layer.provideMerge(
        categorizationLayer(Effect.succeed(categorizationOperations(db))),
        Layer.mergeAll(NodeServices.layer, NodeCrypto.layerSecureRandom)
      ),
      Layer.succeed(TestDatabase, { connection: database })
    );
  })
);

it.layer(testLayer)("Categorization over the migrated D1 schema", (test) => {
  test.effect("reads only the profile it is asked for", () =>
    Effect.gen(function* readProfiles() {
      const categorization = yield* Categorization;

      const businessBook = yield* categorization.snapshot(business);
      const personalBook = yield* categorization.snapshot(personal);

      expect(businessBook.categories).toHaveLength(7);
      expect(businessBook.payees).toHaveLength(5);
      expect(businessBook.aliases).toHaveLength(4);
      expect(businessBook.rules).toHaveLength(7);
      expect(
        businessBook.categories.every((row) => row.profileId === business)
      ).toBe(true);
      expect(
        businessBook.rules.every((row) => row.profileId === business)
      ).toBe(true);

      expect(personalBook.categories.map((row) => row.name)).toEqual([
        "Personal",
      ]);
      expect(personalBook.payees).toEqual([]);
      expect(personalBook.aliases).toEqual([]);
      expect(personalBook.rules).toEqual([]);
    })
  );

  test.effect("sorts a demo line to the demo rule and its aliased payee", () =>
    Effect.gen(function* sortDemoLine() {
      const categorization = yield* Categorization;

      const decision = yield* categorization.decide(business, cloudLine);

      expect(decision.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: cloudCategory,
          ruleId: cloudRule,
        })
      );
      expect(decision.classification).toEqual(
        ClassificationSchema.cases.None.make({})
      );
      expect(decision.payeeId).toBe(cloudPayee);
    })
  );

  test.effect("sorts a demo line by a rule a user just added", () =>
    Effect.gen(function* sortByNewRule() {
      const categorization = yield* Categorization;

      const created = yield* categorization.createRule(
        business,
        categorizeDraft({
          categoryId: travelCategory,
          pattern: "Demo Rail",
          priority: 20,
        })
      );

      const sorted = yield* categorization.decide(business, railLine);

      expect(sorted.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: travelCategory,
          ruleId: created.id,
        })
      );

      const untouched = yield* categorization.decide(business, cloudLine);

      expect(untouched.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: cloudCategory,
          ruleId: cloudRule,
        })
      );
    })
  );

  test.effect("never lets a lower priority rule overtake a higher one", () =>
    Effect.gen(function* respectPriority() {
      const categorization = yield* Categorization;

      const created = yield* categorization.createRule(
        business,
        categorizeDraft({
          categoryId: subscriptionsCategory,
          pattern: "Cloud Hosting",
          priority: 5,
        })
      );

      expect(created.kind).toBe("categorize");
      expect(created).toMatchObject({
        categoryId: subscriptionsCategory,
        priority: 5,
      });

      const decision = yield* categorization.decide(business, cloudLine);

      expect(decision.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: cloudCategory,
          ruleId: cloudRule,
        })
      );
    })
  );

  test.effect("stops sorting by a rule the user turned off", () =>
    Effect.gen(function* turnRuleOff() {
      const categorization = yield* Categorization;

      const created = yield* categorization.createRule(
        business,
        categorizeDraft({
          categoryId: travelCategory,
          pattern: "Rail Season",
          priority: 20,
        })
      );

      const enabled = yield* categorization.decide(business, seasonLine);

      expect(enabled.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: travelCategory,
          ruleId: created.id,
        })
      );

      const disabled = yield* categorization.updateRule(
        business,
        created.id,
        categorizeDraft({
          categoryId: travelCategory,
          enabled: false,
          pattern: "Rail Season",
          priority: 20,
        })
      );

      expect(disabled.enabled).toBe(false);

      const decision = yield* categorization.decide(business, seasonLine);

      expect(decision.categorization).toEqual(
        CategorizationSchema.cases.None.make({})
      );
    })
  );

  test.effect("keeps amount bounds exact through the row round trip", () =>
    Effect.gen(function* boundAmounts() {
      const categorization = yield* Categorization;

      const created = yield* categorization.createRule(
        business,
        categorizeDraft({
          categoryId: subscriptionsCategory,
          minAmount: 200_000,
          pattern: "Demo Cloud Hosting",
          priority: 30,
        })
      );

      const big = yield* categorization.decide(business, cloudLine);

      const small = yield* categorization.decide(
        business,
        line({ merchant: "Demo Cloud Hosting", minorAmount: 5200 })
      );

      expect(big.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: subscriptionsCategory,
          ruleId: created.id,
        })
      );
      expect(small.categorization).toEqual(
        CategorizationSchema.cases.Applied.make({
          categoryId: cloudCategory,
          ruleId: cloudRule,
        })
      );
    })
  );

  test.effect("keeps payees and aliases as rows a user edits", () =>
    Effect.gen(function* addPayeeAndAlias() {
      const categorization = yield* Categorization;

      const payee = yield* categorization.createPayee({
        defaultCategoryId: null,
        kind: "merchant",
        name: "Demo Rail Ltd",
        profileId: business,
      });

      expect(payee.normalizedName).toBe("demo-rail-ltd");

      yield* categorization.createAlias({
        matchType: "exact",
        pattern: "DEMO RAIL LTD",
        payeeId: payee.id,
        profileId: business,
      });

      const decision = yield* categorization.decide(
        business,
        line({ merchant: "demo rail ltd", minorAmount: 1000 })
      );

      expect(decision.payeeId).toBe(payee.id);
    })
  );

  test.effect("refuses a payee name that normalizes to nothing", () =>
    Effect.gen(function* refuseBlankPayee() {
      const categorization = yield* Categorization;

      const error = yield* Effect.flip(
        categorization.createPayee({
          defaultCategoryId: null,
          kind: "merchant",
          name: "!!!",
          profileId: business,
        })
      );

      expect(error).toBeInstanceOf(InvalidCategorizationInput);
    })
  );

  test.effect("names a rule that does not exist", () =>
    Effect.gen(function* missingRule() {
      const categorization = yield* Categorization;

      const error = yield* Effect.flip(
        categorization.updateRule(
          business,
          absentRule,
          categorizeDraft({
            categoryId: travelCategory,
            pattern: "Demo Rail",
            priority: 20,
          })
        )
      );

      expect(error).toBeInstanceOf(RuleNotFound);
    })
  );

  test.effect("refuses a stored rule the domain cannot parse", () =>
    Effect.gen(function* refuseStoredRule() {
      const categorization = yield* Categorization;
      const { connection } = yield* TestDatabase;

      connection.run(
        `INSERT INTO rules (id, profile_id, kind, match_field, match_type, pattern, direction, priority, enabled, category_id, created_at, updated_at)
         VALUES ('0192f0c1-00ff-7abc-8abc-000000000000', '0192f0c1-0001-702d-8484-48490b729601', 'categorize', 'merchant', 'digits_only', 'TAX', 'any', 50, 1, '0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba', 1735722000000, 1735722000000)`
      );

      const error = yield* Effect.flip(categorization.snapshot(business));

      expect(error).toBeInstanceOf(CategorizationError);

      connection.run(
        "DELETE FROM rules WHERE id = '0192f0c1-00ff-7abc-8abc-000000000000'"
      );
    })
  );
});
