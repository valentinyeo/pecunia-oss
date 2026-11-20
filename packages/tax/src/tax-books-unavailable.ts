import { Schema } from "effect";

import { BooksToolSchema } from "./books-tool.js";

export class TaxBooksUnavailable extends Schema.TaggedError<
  TaxBooksUnavailable,
  { readonly brand: unique symbol }
>()("TaxBooksUnavailable", {
  booksTool: BooksToolSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}
