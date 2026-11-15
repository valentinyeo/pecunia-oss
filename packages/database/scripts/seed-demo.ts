import { tmpdir } from "node:os";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import initSqlJs from "sql.js";

import {
  databaseDemoSeedFile,
  databaseMigrationDirectory,
} from "../src/migrations.ts";

const defaultTarget = ".local/demo.sqlite";

interface Refusal {
  readonly fix: string;
  readonly reason: string;
}

const targetWithin = (path: Path.Path, target: string, root: string) => {
  const resolvedRoot = path.resolve(root);

  return (
    target === resolvedRoot || target.startsWith(`${resolvedRoot}${path.sep}`)
  );
};

const refusalFor = (
  path: Path.Path,
  target: string,
  exists: boolean
): Refusal | undefined => {
  if (
    !(
      targetWithin(path, target, process.cwd()) ||
      targetWithin(path, target, tmpdir())
    )
  ) {
    return {
      fix: "pass an output path inside the current directory, for example `.local/demo.sqlite`",
      reason: `${target} is outside this repository and the system temp directory`,
    };
  }

  if (path.extname(target) !== ".sqlite") {
    return {
      fix: "name the output file with the `.sqlite` extension",
      reason: `${target} is not a .sqlite file`,
    };
  }

  if (exists) {
    return {
      fix: "pass a new path, or delete the demo file and run the seed again",
      reason: `${target} already exists and may hold a real book`,
    };
  }

  return undefined;
};

const program = Effect.gen(function* seedDemoDatabase() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const requested = process.argv[2] ?? defaultTarget;
  const target = path.resolve(process.cwd(), requested);
  const exists = yield* fileSystem.exists(target);
  const refusal = refusalFor(path, target, exists);

  if (refusal !== undefined) {
    process.exitCode = 1;

    yield* Effect.logError(
      `The demo seed writes to a local file only. ${refusal.reason}. Fix: ${refusal.fix}.`
    );

    return;
  }

  const SQL = yield* Effect.promise(() => initSqlJs());
  const database = new SQL.Database();

  database.run("PRAGMA foreign_keys = ON");

  const migrationRoot = databaseMigrationDirectory("d1");

  const migrationDirectories = (yield* fileSystem.readDirectory(
    migrationRoot
  )).toSorted();

  for (const directory of migrationDirectories) {
    const migration = yield* fileSystem.readFileString(
      path.resolve(migrationRoot, directory, "migration.sql")
    );

    database.exec(migration);
  }

  const seed = yield* fileSystem.readFileString(databaseDemoSeedFile());

  database.exec(seed);

  yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
  yield* fileSystem.writeFile(target, database.export());

  const [tables] = database.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  yield* Effect.log(`Wrote the demo book to ${target}`);

  for (const [name] of tables?.values ?? []) {
    const [counts] = database.exec(`SELECT COUNT(*) FROM "${String(name)}"`);
    const total = String(counts?.values[0]?.[0] ?? 0);

    yield* Effect.log(`${String(name)}: ${total} rows`);
  }

  database.close();
}).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
