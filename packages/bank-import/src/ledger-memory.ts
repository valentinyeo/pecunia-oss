import type {
  ImportTarget,
  ProviderAccountId,
} from "@pecunia/core/bank-import";
import type { ProfileId } from "@pecunia/core/settings";
import { Effect, HashMap, Layer, Option, Ref } from "effect";

import { ImportLedger } from "./import-ledger.js";
import type { RecordedLines } from "./import-ledger.js";
import type { FingerprintedLine } from "./line.js";

const KEY_SEPARATOR = "\u001F";

const lineKey = (
  profileId: ProfileId,
  accountId: ProviderAccountId,
  line: FingerprintedLine
): string => [profileId, accountId, line.fingerprint].join(KEY_SEPARATOR);

const recordOnce = (
  ledger: HashMap.HashMap<string, FingerprintedLine>,
  profileId: ProfileId,
  accountId: ProviderAccountId,
  lines: readonly FingerprintedLine[]
): readonly [RecordedLines, HashMap.HashMap<string, FingerprintedLine>] => {
  let next = ledger;
  let imported = 0;
  let alreadyImported = 0;

  for (const line of lines) {
    const key = lineKey(profileId, accountId, line);

    if (HashMap.has(next, key)) {
      alreadyImported += 1;
      continue;
    }

    next = HashMap.set(next, key, line);
    imported += 1;
  }

  return [{ alreadyImported, imported }, next];
};

const targetFinder =
  (targets: readonly ImportTarget[]) =>
  (profileId: ProfileId, accountId: ProviderAccountId) =>
    Effect.sync(() =>
      Option.fromUndefinedOr(
        targets.find(
          (target) => target.profileId === profileId && target.id === accountId
        )
      )
    );

const targetLister =
  (targets: readonly ImportTarget[]) => (profileId: ProfileId) =>
    Effect.sync(() =>
      targets.filter((target) => target.profileId === profileId)
    );

export const memoryImportLedgerLayer = (targets: readonly ImportTarget[]) => {
  const findTarget = targetFinder(targets);
  const listTargets = targetLister(targets);

  return Layer.effect(
    ImportLedger,
    Effect.gen(function* makeMemoryLedger() {
      const ledger = yield* Ref.make(
        HashMap.empty<string, FingerprintedLine>()
      );

      const record = Effect.fn("ImportLedger.record")(function* record(
        profileId: ProfileId,
        accountId: ProviderAccountId,
        lines: readonly FingerprintedLine[]
      ) {
        return yield* Ref.modify(ledger, (current) =>
          recordOnce(current, profileId, accountId, lines)
        );
      });

      const storedLines = (
        profileId: ProfileId,
        accountId: ProviderAccountId
      ) => {
        const prefix = [profileId, accountId, ""].join(KEY_SEPARATOR);

        return Effect.map(Ref.get(ledger), (current) =>
          HashMap.toEntries(current)
            .filter(([key]) => key.startsWith(prefix))
            .map(([, line]) => line)
        );
      };

      return ImportLedger.of({ findTarget, listTargets, record, storedLines });
    })
  );
};
