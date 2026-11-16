import type { SchemaAST } from "effect";

export const strictParseOptions = {
  onExcessProperty: "error",
} satisfies SchemaAST.ParseOptions;
