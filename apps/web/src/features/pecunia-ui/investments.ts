import { Command, Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { AssetTypeSchema } from "@pecunia/investments/model";
import type { Gain, HoldingValue, Total } from "@pecunia/investments/model";
import { Match, Option, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  AddHoldingCommand,
  DeleteHoldingCommand,
  ReadPortfolioQuery,
} from "../../client/pecunia-ui/queries.js";
import { formatMinor } from "../pecunia/money-format.js";
import {
  formatQuantityMicros,
  parseMajorToMinor,
  parseQuantityMicros,
} from "./period.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const formatTotal = (total: Total): string =>
  Match.value(total).pipe(
    Match.tags({
      Known: ({ amount }) => formatMinor(amount.minor, amount.currency),
      Unknown: ({ reason }) =>
        reason === "no-value" ? "Unpriced" : "Out of range",
    }),
    Match.exhaustive
  );

const formatHoldingValue = (value: HoldingValue): string =>
  Match.value(value).pipe(
    Match.tags({
      Known: ({ amount }) => formatMinor(amount.minor, amount.currency),
      Unknown: ({ reason }) => {
        if (reason === "no-price") {
          return "Unknown (no price)";
        }

        if (reason === "no-rate") {
          return "Unknown (no FX rate)";
        }

        return "Out of range";
      },
    }),
    Match.exhaustive
  );

const formatGain = (gain: Gain): string =>
  Match.value(gain).pipe(
    Match.tags({
      Known: ({ amount }) =>
        `${amount.minor >= 0 ? "+" : ""}${formatMinor(amount.minor, amount.currency)}`,
      Unknown: ({ reason }) =>
        reason === "no-cost" ? "No cost basis" : "Unknown",
    }),
    Match.exhaustive
  );

export const InvestmentsMessage = UiSchema.TaggedEnum({
  ClickedDelete: { holdingId: Schema.String, symbol: Schema.String },
  FailedAction: { message: Schema.String },
  SubmittedAdd: {},
  SucceededAdd: { symbol: Schema.String },
  SucceededDelete: { symbol: Schema.String },
  UpdatedAssetType: { value: AssetTypeSchema },
  UpdatedCostBasis: { value: Schema.String },
  UpdatedCurrency: { value: Schema.String },
  UpdatedName: { value: Schema.String },
  UpdatedPlatformId: { value: Schema.String },
  UpdatedPrice: { value: Schema.String },
  UpdatedQuantity: { value: Schema.String },
  UpdatedSymbol: { value: Schema.String },
});

export const InvestmentsPage = Html.component({
  message: InvestmentsMessage,
  model: Schema.Struct({
    assetType: AssetTypeSchema,
    costBasis: Schema.String,
    currency: Schema.String,
    feedback: Schema.NullOr(Schema.String),
    name: Schema.String,
    platformId: Schema.String,
    price: Schema.String,
    quantity: Schema.String,
    symbol: Schema.String,
  }),
  name: "InvestmentsPage",
  props: Schema.Struct({
    profileId: Schema.String,
  }),
  queries: {
    portfolio: {
      args: ({ props }) =>
        props.profileId.length === 0
          ? undefined
          : { profileId: props.profileId },
      query: ReadPortfolioQuery,
    },
  },
}).make({
  head: () => [Head.title("Investments")],
  init: () => ({
    assetType: "etf",
    costBasis: "",
    currency: "EUR",
    feedback: null,
    name: "",
    platformId: "manual",
    price: "",
    quantity: "1",
    symbol: "",
  }),
  update: ($, message) =>
    InvestmentsMessage.match(message, {
      ClickedDelete: ({ holdingId, symbol }) =>
        $.evolve({ feedback: null }).run(
          DeleteHoldingCommand.make({
            holdingId,
            profileId: $.props.profileId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                InvestmentsMessage.FailedAction({ message: error.message }),
              onSuccess: () => InvestmentsMessage.SucceededDelete({ symbol }),
            })
          )
        ),
      FailedAction: ({ message: text }) => $.evolve({ feedback: text }),
      SubmittedAdd: () => {
        const symbol = $.model.symbol.trim().toUpperCase();
        const name = $.model.name.trim();
        const quantityMicros = parseQuantityMicros($.model.quantity);

        if (symbol.length === 0 || name.length === 0) {
          return $.evolve({
            feedback: "Enter both a symbol and a holding name.",
          });
        }

        if (quantityMicros === null) {
          return $.evolve({
            feedback:
              "Quantity must be a non-negative decimal (up to 6 places).",
          });
        }

        const priceMinor =
          $.model.price.trim().length === 0
            ? null
            : parseMajorToMinor($.model.price);

        if ($.model.price.trim().length > 0 && priceMinor === null) {
          return $.evolve({
            feedback: "Unit price must be a non-negative amount (e.g. 125.50).",
          });
        }

        const costBasisMinor =
          $.model.costBasis.trim().length === 0
            ? null
            : parseMajorToMinor($.model.costBasis);

        if ($.model.costBasis.trim().length > 0 && costBasisMinor === null) {
          return $.evolve({
            feedback:
              "Cost basis must be a non-negative amount (e.g. 1000.00).",
          });
        }

        return $.evolve({ feedback: null }).run(
          AddHoldingCommand.make({
            assetType: $.model.assetType,
            costBasisMinor,
            currency: $.model.currency.trim().toUpperCase(),
            name,
            platformId: $.model.platformId,
            priceMinor,
            profileId: $.props.profileId,
            quantityMicros,
            symbol,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                InvestmentsMessage.FailedAction({ message: error.message }),
              onSuccess: (created) =>
                InvestmentsMessage.SucceededAdd({ symbol: created.symbol }),
            })
          )
        );
      },
      SucceededAdd: ({ symbol }) =>
        $.evolve({
          costBasis: "",
          feedback: `Added ${symbol} to D1.`,
          name: "",
          price: "",
          quantity: "1",
          symbol: "",
        }),
      SucceededDelete: ({ symbol }) =>
        $.evolve({ feedback: `Deleted ${symbol} from D1.` }),
      UpdatedAssetType: ({ value }) => $.evolve({ assetType: value }),
      UpdatedCostBasis: ({ value }) => $.evolve({ costBasis: value }),
      UpdatedCurrency: ({ value }) => $.evolve({ currency: value }),
      UpdatedName: ({ value }) => $.evolve({ name: value }),
      UpdatedPlatformId: ({ value }) => $.evolve({ platformId: value }),
      UpdatedPrice: ({ value }) => $.evolve({ price: value }),
      UpdatedQuantity: ({ value }) => $.evolve({ quantity: value }),
      UpdatedSymbol: ({ value }) => $.evolve({ symbol: value }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Investments")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.h1.class(sx(styles.pageTitle)).children("Investments"),
        model.feedback === null
          ? null
          : h.p
              .attr("role", "status")
              .class(sx(pecuniaUiStyles.feedback))
              .children(model.feedback),
        AsyncResult.match(h.queries.portfolio, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load portfolio: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading portfolio from /app/rpc…"),
          onSuccess: ({ value: portfolio }) =>
            h.div.class(sx(pecuniaUiStyles.stack)).children(
              h.ul.class(sx(styles.cardGrid)).children(
                h.li
                  .key("total")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children(`Known value (${portfolio.baseCurrency})`),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(formatTotal(portfolio.total))
                  ),
                h.li
                  .key("valued")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children("Valued holdings"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(String(portfolio.valuedCount))
                  ),
                h.li
                  .key("unknown")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children("Unpriced / unknown"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(String(portfolio.unknownCount))
                  )
              ),
              ...portfolio.groups.map((group) =>
                h.div
                  .key(group.platform.id)
                  .class(sx(styles.card))
                  .children(
                    h.div
                      .class(sx(pecuniaUiStyles.toolbar))
                      .children(
                        h.h2
                          .class(sx(styles.sectionTitle))
                          .children(group.platform.label),
                        h.span
                          .class(sx(pecuniaUiStyles.monoValue))
                          .children(formatTotal(group.total))
                      ),
                    group.holdings.length === 0
                      ? h.p
                          .class(sx(pecuniaUiStyles.muted))
                          .children("No holdings on this platform.")
                      : h.table.class(sx(pecuniaUiStyles.table)).children(
                          h.thead.children(
                            h.tr.children(
                              h.th
                                .class(sx(pecuniaUiStyles.tableHeader))
                                .children("Holding"),
                              h.th
                                .class(sx(pecuniaUiStyles.tableHeader))
                                .children("Qty"),
                              h.th
                                .class(
                                  sx(
                                    pecuniaUiStyles.tableHeader,
                                    pecuniaUiStyles.tableCellRight
                                  )
                                )
                                .children("Unit price"),
                              h.th
                                .class(
                                  sx(
                                    pecuniaUiStyles.tableHeader,
                                    pecuniaUiStyles.tableCellRight
                                  )
                                )
                                .children("Value"),
                              h.th
                                .class(
                                  sx(
                                    pecuniaUiStyles.tableHeader,
                                    pecuniaUiStyles.tableCellRight
                                  )
                                )
                                .children("Gain"),
                              h.th
                                .class(sx(pecuniaUiStyles.tableHeader))
                                .children("Actions")
                            )
                          ),
                          h.tbody.children(
                            group.holdings.map((holding) =>
                              h.tr.key(holding.holdingId).children(
                                h.td
                                  .class(sx(pecuniaUiStyles.tableCell))
                                  .children(
                                    h.span
                                      .class(sx(styles.accountName))
                                      .children(holding.symbol),
                                    h.span
                                      .class(sx(pecuniaUiStyles.rowMeta))
                                      .children(
                                        `${holding.name} · ${holding.assetType} · ${holding.state}`
                                      )
                                  ),
                                h.td
                                  .class(
                                    sx(
                                      pecuniaUiStyles.tableCell,
                                      pecuniaUiStyles.monoValue
                                    )
                                  )
                                  .children(
                                    formatQuantityMicros(holding.quantity)
                                  ),
                                h.td
                                  .class(
                                    sx(
                                      pecuniaUiStyles.tableCell,
                                      pecuniaUiStyles.tableCellRight
                                    )
                                  )
                                  .children(
                                    Option.match(holding.price, {
                                      onNone: () => "Unpriced",
                                      onSome: (price) =>
                                        formatMinor(
                                          price.minor,
                                          price.currency
                                        ),
                                    })
                                  ),
                                h.td
                                  .class(
                                    sx(
                                      pecuniaUiStyles.tableCell,
                                      pecuniaUiStyles.tableCellRight
                                    )
                                  )
                                  .children(formatHoldingValue(holding.value)),
                                h.td
                                  .class(
                                    sx(
                                      pecuniaUiStyles.tableCell,
                                      pecuniaUiStyles.tableCellRight
                                    )
                                  )
                                  .children(
                                    Predicate.isTagged(holding.value, "Known")
                                      ? formatGain(holding.value.gain)
                                      : "—"
                                  ),
                                h.td
                                  .class(sx(pecuniaUiStyles.tableCell))
                                  .children(
                                    h.button
                                      .attr("type", "button")
                                      .class(sx(pecuniaUiStyles.button))
                                      .on(
                                        "click",
                                        InvestmentsMessage.ClickedDelete({
                                          holdingId: holding.holdingId,
                                          symbol: holding.symbol,
                                        })
                                      )
                                      .children("Delete")
                                  )
                              )
                            )
                          )
                        )
                  )
              ),
              h.form
                .class(sx(styles.card))
                .on("submit", InvestmentsMessage.SubmittedAdd())
                .children(
                  h.h2
                    .class(sx(styles.sectionTitle))
                    .children("Add manual holding"),
                  h.div.class(sx(pecuniaUiStyles.formGrid)).children(
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Symbol"),
                      h.input
                        .attr("placeholder", "DEMO-BOND")
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.symbol)
                        .on("input", ({ value }) =>
                          InvestmentsMessage.UpdatedSymbol({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Name"),
                      h.input
                        .attr("placeholder", "Demo Bond ETF")
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.name)
                        .on("input", ({ value }) =>
                          InvestmentsMessage.UpdatedName({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Platform"),
                      h.select
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.platformId)
                        .on("change", ({ value }) =>
                          InvestmentsMessage.UpdatedPlatformId({ value })
                        )
                        .children(
                          h.option.attr("value", "manual").children("Manual"),
                          h.option
                            .attr("value", "generic-broker")
                            .children("Generic Broker"),
                          h.option
                            .attr("value", "generic-crypto-exchange")
                            .children("Generic Crypto Exchange")
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Asset type"),
                      h.select
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.assetType)
                        .on("change", ({ value }) =>
                          InvestmentsMessage.UpdatedAssetType({
                            value:
                              value === "stock" ||
                              value === "fund" ||
                              value === "crypto" ||
                              value === "cash"
                                ? value
                                : "etf",
                          })
                        )
                        .children(
                          h.option.attr("value", "etf").children("ETF"),
                          h.option.attr("value", "stock").children("Stock"),
                          h.option.attr("value", "fund").children("Fund"),
                          h.option.attr("value", "crypto").children("Crypto"),
                          h.option.attr("value", "cash").children("Cash")
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Quantity"),
                      h.input
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.quantity)
                        .on("input", ({ value }) =>
                          InvestmentsMessage.UpdatedQuantity({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Currency"),
                      h.input
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.currency)
                        .on("input", ({ value }) =>
                          InvestmentsMessage.UpdatedCurrency({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Unit price (optional)"),
                      h.input
                        .attr("placeholder", "100.00")
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.price)
                        .on("input", ({ value }) =>
                          InvestmentsMessage.UpdatedPrice({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Total cost basis (optional)"),
                      h.input
                        .attr("placeholder", "90.00")
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(model.costBasis)
                        .on("input", ({ value }) =>
                          InvestmentsMessage.UpdatedCostBasis({ value })
                        )
                    )
                  ),
                  h.button
                    .attr("type", "submit")
                    .class(
                      sx(pecuniaUiStyles.button, pecuniaUiStyles.buttonPrimary)
                    )
                    .children("Add holding")
                )
            ),
        })
      ),
});
