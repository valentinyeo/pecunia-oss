import type { ProfileId, TaxProfileId } from "@pecunia/core/model";
import { Context } from "effect";
import type { Effect } from "effect";

import type { BooksTool } from "./books-tool.js";
import type { DuesAnswer } from "./model.js";
import type { TaxBooksUnavailable } from "./tax-books-unavailable.js";
import type { TaxDuesRejected } from "./tax-due-rejected.js";

export interface DuesRequest {
  readonly profileId: ProfileId;
  readonly taxProfileId: TaxProfileId;
}

export interface TaxBooksService {
  readonly booksTool: BooksTool;
  readonly fetchDues: (
    request: DuesRequest
  ) => Effect.Effect<DuesAnswer, TaxBooksUnavailable | TaxDuesRejected>;
}

export class TaxBooks extends Context.Service<TaxBooks, TaxBooksService>()(
  "@pecunia/tax/TaxBooks"
) {}
