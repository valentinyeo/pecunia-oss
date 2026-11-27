import { d1MembershipLayer } from "@pecunia/access/d1";
import { bankImportCapabilities } from "@pecunia/bank-import/capabilities";
import { d1ImportLedgerLayer } from "@pecunia/bank-import/d1";
import { BankLineService } from "@pecunia/bank-lines";
import { bankLineCapabilities } from "@pecunia/bank-lines/capabilities";
import { d1BankLineStoreLayer } from "@pecunia/bank-lines/d1";
import { flagCapabilities } from "@pecunia/core/flag-capabilities";
import {
  BrokerHoldings,
  BrokerUnavailable,
  InvestmentService,
  priceBookLayer,
  recordedCryptoQuotes,
  recordedMarketQuotes,
} from "@pecunia/investments";
import { investmentCapabilities } from "@pecunia/investments/capabilities";
import { d1InvestmentsLayer } from "@pecunia/investments/d1";
import { ReportService } from "@pecunia/reporting";
import { reportCapabilities } from "@pecunia/reporting/capabilities";
import { d1ReportSourceLayer } from "@pecunia/reporting/d1";
import type { D1ReportSourceOptions } from "@pecunia/reporting/d1";
import { settingsCapabilities } from "@pecunia/settings/capabilities";
import { d1SettingsLayer } from "@pecunia/settings/d1";
import { SubscriptionService } from "@pecunia/subscriptions";
import { subscriptionCapabilities } from "@pecunia/subscriptions/capabilities";
import { d1SubscriptionStoreLayer } from "@pecunia/subscriptions/d1";
import { Effect, Layer } from "effect";
import { Digest, WebCrypto } from "effect/crypto";

const unconfiguredBrokerLayer = Layer.succeed(BrokerHoldings, {
  fetch: (accountId) =>
    Effect.fail(
      new BrokerUnavailable({
        accountId,
        message: "No live broker credentials are configured for this worker.",
        repair:
          "Configure a broker adapter before running syncInvestmentHoldings, or manage holdings manually.",
      })
    ),
});

const defaultPriceBookLayer = priceBookLayer.pipe(
  Layer.provide(
    Layer.mergeAll(recordedMarketQuotes([]), recordedCryptoQuotes([]))
  )
);

export const pecuniaCapabilities = [
  ...settingsCapabilities,
  ...bankLineCapabilities,
  ...subscriptionCapabilities,
  ...reportCapabilities,
  ...investmentCapabilities,
  ...bankImportCapabilities,
] as const;

export const pecuniaRpcCapabilities = [
  ...flagCapabilities,
  ...pecuniaCapabilities,
] as const;

export const pecuniaServicesLayer = (options?: D1ReportSourceOptions) =>
  Layer.mergeAll(
    d1SettingsLayer,
    BankLineService.layer.pipe(Layer.provide(d1BankLineStoreLayer)),
    SubscriptionService.layer.pipe(Layer.provide(d1SubscriptionStoreLayer)),
    ReportService.layer.pipe(Layer.provide(d1ReportSourceLayer(options))),
    InvestmentService.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          d1InvestmentsLayer,
          defaultPriceBookLayer,
          unconfiguredBrokerLayer
        )
      )
    ),
    d1ImportLedgerLayer,
    Digest.layerWebCrypto.pipe(
      Layer.provide(WebCrypto.layer(globalThis.crypto))
    ),
    d1MembershipLayer
  );
