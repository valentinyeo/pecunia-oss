import {
  ImportTargetSchema,
  ProviderAccountIdSchema,
} from "@pecunia/core/bank-import";
import type {
  ImportTarget,
  ProviderAccountId,
} from "@pecunia/core/bank-import";
import { CurrencyCodeSchema, ProfileIdSchema } from "@pecunia/core/settings";
import type { CurrencyCode, ProfileId } from "@pecunia/core/settings";
import { Layer, Schema } from "effect";
import { Digest, WebCrypto } from "effect/crypto";

import { memoryImportLedgerLayer } from "../src/ledger-memory.js";

export const demoProfileId: ProfileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

export const demoAccountId: ProviderAccountId = Schema.decodeSync(
  ProviderAccountIdSchema
)("0192f0c1-0006-7b7b-8ffd-ffde623dd8df");

export const demoEuro: CurrencyCode =
  Schema.decodeSync(CurrencyCodeSchema)("EUR");

export const demoTarget: ImportTarget = Schema.decodeSync(ImportTargetSchema)({
  baseCurrency: "EUR",
  id: demoAccountId,
  kind: "bank",
  label: "Everyday Current",
  profileId: demoProfileId,
  providerLabel: "Demo Bank",
});

export const digestLayer = Digest.layerWebCrypto.pipe(
  Layer.provide(WebCrypto.layer(globalThis.crypto))
);

export const ledgerLayer = (targets: readonly ImportTarget[]) =>
  Layer.mergeAll(memoryImportLedgerLayer(targets), digestLayer);

export const demoLedgerLayer = ledgerLayer([demoTarget]);
