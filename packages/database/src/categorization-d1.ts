import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { and, asc, desc, eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CategorizationError } from "./categorization-model.js";
import type { PersistedRuleRow } from "./categorization-store.js";
import { categorizationLayer } from "./categorization.js";
import { RuleNotFound } from "./rule-not-found.js";
import { Categories, MerchantAliases, Payees, Rules } from "./schema/d1.js";
import type { DatabaseVendorResource } from "./vendor.js";

type D1Vendor = Extract<DatabaseVendorResource, { readonly _tag: "D1" }>;

const updatedRuleValues = (row: PersistedRuleRow) => ({
  categoryId: row.categoryId,
  clientPayeeId: row.clientPayeeId,
  counterpartProfileId: row.counterpartProfileId,
  direction: row.direction,
  enabled: row.enabled,
  kind: row.kind,
  matchField: row.matchField,
  matchType: row.matchType,
  maxAmountMinor: row.maxAmountMinor,
  minAmountMinor: row.minAmountMinor,
  obligationKind: row.obligationKind,
  pattern: row.pattern,
  priority: row.priority,
  updatedAt: row.updatedAt,
});

export const CategorizationLayer = (vendor: D1Vendor) =>
  Layer.unwrap(
    Effect.gen(function* buildCategorizationLayer() {
      const client = yield* Cloudflare.D1.QueryDatabase(vendor.database);
      const db = yield* Drizzle.D1(client);

      return categorizationLayer(
        Effect.succeed({
          insertAlias: (row) =>
            db
              .insert(MerchantAliases)
              .values({
                createdAt: row.createdAt,
                id: row.id,
                matchType: row.matchType,
                pattern: row.pattern,
                payeeId: row.payeeId,
                profileId: row.profileId,
              })
              .returning()
              .pipe(
                Effect.map(([inserted]) => inserted),
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({ cause, operation: "createAlias" })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          insertCategory: (row) =>
            db
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
              .returning()
              .pipe(
                Effect.map(([inserted]) => inserted),
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({
                      cause,
                      operation: "createCategory",
                    })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          insertPayee: (row) =>
            db
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
              .returning()
              .pipe(
                Effect.map(([inserted]) => inserted),
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({ cause, operation: "createPayee" })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          insertRule: (row) =>
            db
              .insert(Rules)
              .values({
                ...updatedRuleValues(row),
                createdAt: row.createdAt,
                id: row.id,
                profileId: row.profileId,
              })
              .returning()
              .pipe(
                Effect.map(([inserted]) => inserted),
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({ cause, operation: "createRule" })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          listAliases: (profileId) =>
            db
              .select()
              .from(MerchantAliases)
              .where(eq(MerchantAliases.profileId, profileId))
              .orderBy(asc(MerchantAliases.id))
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({
                      cause,
                      operation: "listAliases",
                    })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          listCategories: (profileId) =>
            db
              .select()
              .from(Categories)
              .where(eq(Categories.profileId, profileId))
              .orderBy(asc(Categories.name), asc(Categories.id))
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({
                      cause,
                      operation: "listCategories",
                    })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          listPayees: (profileId) =>
            db
              .select()
              .from(Payees)
              .where(eq(Payees.profileId, profileId))
              .orderBy(asc(Payees.normalizedName))
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({ cause, operation: "listPayees" })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          listRules: (profileId) =>
            db
              .select()
              .from(Rules)
              .where(eq(Rules.profileId, profileId))
              .orderBy(desc(Rules.priority), asc(Rules.id))
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({ cause, operation: "listRules" })
                ),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
          replaceRule: (row) =>
            db
              .update(Rules)
              .set(updatedRuleValues(row))
              .where(
                and(eq(Rules.profileId, row.profileId), eq(Rules.id, row.id))
              )
              .returning()
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new CategorizationError({
                      cause,
                      operation: "replaceRule",
                    })
                ),
                Effect.flatMap((rows) => {
                  const [replaced] = rows;

                  return replaced === undefined
                    ? Effect.fail(
                        new RuleNotFound({
                          profileId: row.profileId,
                          ruleId: row.id,
                        })
                      )
                    : Effect.succeed(replaced);
                }),
                Effect.provide(RuntimeContext.RuntimeContext.phantom)
              ),
        })
      );
    })
  );
