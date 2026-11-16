import type {
  ImportTarget,
  ImportUnavailable,
  ProviderAccountId,
} from "@pecunia/core/bank-import";
import type { ProfileId } from "@pecunia/core/settings";
import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { FingerprintedLine } from "./line.js";

export interface RecordedLines {
  readonly alreadyImported: number;
  readonly imported: number;
}

export class ImportLedger extends Context.Service<
  ImportLedger,
  {
    readonly findTarget: (
      profileId: ProfileId,
      accountId: ProviderAccountId
    ) => Effect.Effect<Option.Option<ImportTarget>, ImportUnavailable>;
    readonly listTargets: (
      profileId: ProfileId
    ) => Effect.Effect<readonly ImportTarget[], ImportUnavailable>;
    readonly record: (
      profileId: ProfileId,
      accountId: ProviderAccountId,
      lines: readonly FingerprintedLine[]
    ) => Effect.Effect<RecordedLines, ImportUnavailable>;
  }
>()("@pecunia/bank-import/ImportLedger") {}
