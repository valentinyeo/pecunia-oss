import type {
  Gain,
  HoldingValue,
  HoldingView,
  Money,
  PlatformGroup,
  Portfolio,
  UnknownGainReason,
  UnknownValueReason,
} from "@pecunia/investments/model";
import * as stylex from "@stylexjs/stylex";
import { Match, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { PecuniaMessage } from "../../client/pecunia/message.js";
import { formatMinor } from "./money-format.js";
import { styles } from "./pecunia.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const QUANTITY_SCALE = 1_000_000n;

const groupedInt = (digits: string): string =>
  digits.length <= 3
    ? digits
    : `${groupedInt(digits.slice(0, -3))},${digits.slice(-3)}`;

const quantityText = (micros: number): string => {
  const scaled = BigInt(micros);
  const whole = scaled / QUANTITY_SCALE;
  const fraction = scaled % QUANTITY_SCALE;

  return fraction === 0n
    ? groupedInt(whole.toString())
    : `${groupedInt(whole.toString())}.${fraction
        .toString()
        .padStart(6, "0")
        .replace(/0+$/u, "")}`;
};

const moneyText = (money: Money | null): string =>
  money === null ? "Unknown" : formatMinor(money.minor, money.currency);

const valueReason = (reason: UnknownValueReason): string =>
  Match.value(reason).pipe(
    Match.when("no-price", () => "No price yet"),
    Match.when("no-rate", () => "No exchange rate"),
    Match.when("out-of-range", () => "Outside exact range"),
    Match.orElse(() => "Unknown")
  );

const gainReason = (reason: UnknownGainReason): string =>
  Match.value(reason).pipe(
    Match.when("no-cost-basis", () => "Cost basis not tracked"),
    Match.when("no-rate", () => "No exchange rate"),
    Match.when("out-of-range", () => "Outside exact range"),
    Match.orElse(() => "Unknown")
  );

const gainLine = (gain: Gain, h: HtmlBuilder<PecuniaMessage>): Html =>
  Match.value(gain).pipe(
    Match.tag("Known", ({ amount }) =>
      h.span(
        [
          h.Class(
            className(
              amount.minor < 0
                ? [styles.holdingGain, styles.valueDebit]
                : styles.holdingGain
            )
          ),
        ],
        [`Gain ${formatMinor(amount.minor, amount.currency)}`]
      )
    ),
    Match.tag("Unknown", ({ reason }) =>
      h.span(
        [h.Class(className(styles.holdingGain))],
        [`Gain ${gainReason(reason)}`]
      )
    ),
    Match.exhaustive
  );

const valueCell = (value: HoldingValue, h: HtmlBuilder<PecuniaMessage>): Html =>
  Match.value(value).pipe(
    Match.tag("Known", ({ amount, gain }) =>
      h.td(
        [h.Class(className([styles.holdingCell, styles.holdingNumber]))],
        [
          h.span([], [formatMinor(amount.minor, amount.currency)]),
          gainLine(gain, h),
        ]
      )
    ),
    Match.tag("Unknown", ({ reason }) =>
      h.td(
        [h.Class(className(styles.holdingCell))],
        [
          h.span(
            [h.Class(className(styles.unknownValue))],
            [valueReason(reason)]
          ),
        ]
      )
    ),
    Match.exhaustive
  );

const holdingRow = (
  holding: HoldingView,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.tr(
    [h.Key(holding.holdingId)],
    [
      h.td(
        [h.Class(className(styles.holdingCell))],
        [
          h.span([h.Class(className(styles.accountName))], [holding.name]),
          h.span(
            [h.Class(className(styles.holdingSymbol))],
            [`${holding.symbol} · ${holding.assetType} · ${holding.state}`]
          ),
        ]
      ),
      h.td(
        [h.Class(className([styles.holdingCell, styles.holdingNumber]))],
        [quantityText(holding.quantity)]
      ),
      h.td(
        [h.Class(className([styles.holdingCell, styles.holdingNumber]))],
        [moneyText(Option.getOrNull(holding.price))]
      ),
      valueCell(holding.value, h),
    ]
  );

const groupTable = (
  group: PlatformGroup,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.section(
    [
      h.AriaLabel(`Holdings on ${group.platform.label}`),
      h.Class(className(styles.holdingGroup)),
    ],
    [
      h.h2([h.Class(className(styles.sectionTitle))], [group.platform.label]),
      h.table(
        [h.Class(className(styles.holdingTable))],
        [
          h.thead(
            [],
            [
              h.tr(
                [],
                [
                  h.th([h.Scope("col")], ["Holding"]),
                  h.th(
                    [h.Scope("col"), h.Class(className(styles.holdingNumber))],
                    ["Quantity"]
                  ),
                  h.th(
                    [h.Scope("col"), h.Class(className(styles.holdingNumber))],
                    ["Price"]
                  ),
                  h.th([h.Scope("col")], ["Value and gain"]),
                ]
              ),
            ]
          ),
          h.tbody(
            [],
            group.holdings.map((holding) => holdingRow(holding, h))
          ),
        ]
      ),
    ]
  );

const totalLine = (
  portfolio: Portfolio,
  h: HtmlBuilder<PecuniaMessage>
): Html => {
  const total = Option.getOrNull(portfolio.total);

  return h.p(
    [h.Class(className(styles.totalRow))],
    [
      h.span(
        [],
        [
          `${portfolio.valuedCount} valued, ${portfolio.unknownCount} unknown, in ${portfolio.baseCurrency}`,
        ]
      ),
      h.span(
        [h.Class(className(styles.accountValue))],
        [
          total === null
            ? "Total unknown"
            : `Total ${formatMinor(total.minor, total.currency)}`,
        ]
      ),
    ]
  );
};

export const investmentsScreen = (
  portfolio: Portfolio,
  h: HtmlBuilder<PecuniaMessage>
): Html => {
  const groups = portfolio.groups.filter((group) => group.holdings.length > 0);

  return h.section(
    [h.AriaLabel("Investments"), h.Class(className(styles.section))],
    [
      h.h1([h.Class(className(styles.pageTitle))], ["Investments"]),
      totalLine(portfolio, h),
      groups.length === 0
        ? h.p(
            [h.Class(className(styles.placeholder)), h.Role("note")],
            ["No holdings yet. Add one by hand or sync a broker."]
          )
        : h.div(
            [],
            groups.map((group) => groupTable(group, h))
          ),
    ]
  );
};
