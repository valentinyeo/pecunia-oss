import { Schema } from "effect";

export const BooksToolSchema = Schema.Literals(["freeagent"]);

export type BooksTool = typeof BooksToolSchema.Type;
