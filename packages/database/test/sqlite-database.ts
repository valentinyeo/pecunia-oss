import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";

import {
  databaseDemoSeedFile,
  databaseMigrationDirectory,
} from "../src/migrations.js";
import * as schemaModule from "../src/schema/d1.js";

export { schemaModule };

const migrateDatabase = (database: Database) =>
  Effect.gen(function* runMigrations() {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = databaseMigrationDirectory("d1");
    const directories = (yield* fileSystem.readDirectory(root)).toSorted();

    for (const directory of directories) {
      const migration = yield* fileSystem.readFileString(
        path.resolve(root, directory, "migration.sql")
      );

      database.exec(migration);
    }
  });

export const openMigratedDatabase = Effect.gen(function* openDatabase() {
  const SQL = yield* Effect.promise(() => initSqlJs());
  const database = new SQL.Database();

  database.run("PRAGMA foreign_keys = ON");

  yield* migrateDatabase(database);

  return database;
}).pipe(Effect.provide(NodeServices.layer));

export const applyDemoSeed = (database: Database) =>
  Effect.gen(function* applySeed() {
    const fileSystem = yield* FileSystem.FileSystem;
    const seed = yield* fileSystem.readFileString(databaseDemoSeedFile());

    database.exec(seed);
  }).pipe(Effect.provide(NodeServices.layer));

export const rowCount = (database: Database, table: string): number => {
  const [result] = database.exec(`SELECT COUNT(*) AS total FROM "${table}"`);

  return Number(result?.values[0]?.[0] ?? 0);
};

export type Row = Readonly<Record<string, string | number | null | undefined>>;

export interface SqlStep {
  readonly parameters: Record<string, string | number | null>;
  readonly sql: string;
}

export const insertStep = (table: string, row: Row): SqlStep => {
  const columns = Object.keys(row);
  const parameters: Record<string, string | number | null> = {};

  for (const column of columns) {
    parameters[`$${column}`] = row[column] ?? null;
  }

  return {
    parameters,
    sql: `INSERT INTO "${table}" (${columns
      .map((column) => `"${column}"`)
      .join(", ")}) VALUES (${columns
      .map((column) => `$${column}`)
      .join(", ")})`,
  };
};

export const runStep = (database: Database, step: SqlStep): void => {
  database.run(step.sql, step.parameters);
};
