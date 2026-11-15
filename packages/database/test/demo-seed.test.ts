import { expect, it } from "@effect/vitest";
import { getTableName } from "drizzle-orm";
import { Effect } from "effect";

import { RunLogs } from "../src/schema/d1.js";
import {
  applyDemoSeed,
  openMigratedDatabase,
  rowCount,
  schemaModule,
} from "./sqlite-database.js";

const operationalTables = new Set<string>([getTableName(RunLogs)]);

const schemaTables: readonly string[] = Object.values(schemaModule).map(
  (table) => getTableName(table)
);

it.effect("the demo seed fills every product table after the migrations", () =>
  Effect.gen(function* seedDemoBook() {
    const database = yield* openMigratedDatabase;

    yield* applyDemoSeed(database);

    const empty = schemaTables.filter(
      (table) =>
        !operationalTables.has(table) && rowCount(database, table) === 0
    );

    expect(empty).toEqual([]);
  })
);

it.effect("the demo seed carries the two profiles the product ships", () =>
  Effect.gen(function* readDemoProfiles() {
    const database = yield* openMigratedDatabase;

    yield* applyDemoSeed(database);

    const [profiles] = database.exec(
      "SELECT kind, base_currency FROM profiles ORDER BY kind DESC"
    );

    expect(profiles?.values).toEqual([
      ["personal", "EUR"],
      ["business", "EUR"],
    ]);
  })
);
