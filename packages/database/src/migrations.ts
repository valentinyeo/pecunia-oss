import { fileURLToPath } from "node:url";

export type DatabaseMigrationVendor = "d1" | "postgres";

export const databaseMigrationDirectory = (
  vendor: DatabaseMigrationVendor
): string =>
  fileURLToPath(new URL(`../migrations/${vendor}/`, import.meta.url));

export const databaseDemoSeedFile = (): string =>
  fileURLToPath(new URL("../demo/seed.sql", import.meta.url));

export const databaseSchemaFile = (vendor: DatabaseMigrationVendor): string =>
  fileURLToPath(new URL(`../src/schema/${vendor}.ts`, import.meta.url));
