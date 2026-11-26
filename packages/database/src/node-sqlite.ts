// @effect-diagnostics nodeBuiltinImport:off -- Node's built-in sqlite, fs, and path modules back local dev and tests only; Cloudflare Workers use d1SqliteClientLayer.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Effect, Layer } from "effect";

import {
  databaseDemoSeedFile,
  databaseMigrationDirectory,
} from "./migrations.js";
import { nodeSqliteClientLayer } from "./sqlite-client.js";
import type { SqliteClient } from "./sqlite-client.js";

const migrate = (database: DatabaseSync) => {
  const root = databaseMigrationDirectory("d1");
  const directories = readdirSync(root).toSorted();

  for (const directory of directories) {
    const migration = readFileSync(
      path.resolve(root, directory, "migration.sql"),
      "utf-8"
    );

    database.exec(migration);
  }
};

const openDatabase = (location: string, seedDemo: boolean) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const database = new DatabaseSync(location);

      database.exec("PRAGMA foreign_keys = ON");
      migrate(database);

      if (seedDemo) {
        database.exec(readFileSync(databaseDemoSeedFile(), "utf-8"));
      }

      return database;
    }),
    (database) =>
      Effect.sync(() => {
        database.close();
      })
  );

export const openMigratedSqliteLayer = (
  location = ":memory:"
): Layer.Layer<SqliteClient> =>
  Layer.unwrap(
    openDatabase(location, false).pipe(Effect.map(nodeSqliteClientLayer))
  );

export const openDemoSqliteLayer = (
  location = ":memory:"
): Layer.Layer<SqliteClient> =>
  Layer.unwrap(
    openDatabase(location, true).pipe(Effect.map(nodeSqliteClientLayer))
  );
