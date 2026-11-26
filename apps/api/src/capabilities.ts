import { d1MembershipLayer } from "@pecunia/access/d1";
import { BankLineService } from "@pecunia/bank-lines";
import { bankLineCapabilities } from "@pecunia/bank-lines/capabilities";
import { d1BankLineStoreLayer } from "@pecunia/bank-lines/d1";
import { flagCapabilities } from "@pecunia/core/flag-capabilities";
import { ReportService } from "@pecunia/reporting";
import { reportCapabilities } from "@pecunia/reporting/capabilities";
import { d1ReportSourceLayer } from "@pecunia/reporting/d1";
import type { D1ReportSourceOptions } from "@pecunia/reporting/d1";
import { settingsCapabilities } from "@pecunia/settings/capabilities";
import { d1SettingsLayer } from "@pecunia/settings/d1";
import { SubscriptionService } from "@pecunia/subscriptions";
import { subscriptionCapabilities } from "@pecunia/subscriptions/capabilities";
import { d1SubscriptionStoreLayer } from "@pecunia/subscriptions/d1";
import { Layer } from "effect";

export const pecuniaCapabilities = [
  ...settingsCapabilities,
  ...bankLineCapabilities,
  ...subscriptionCapabilities,
  ...reportCapabilities,
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
    d1MembershipLayer
  );
