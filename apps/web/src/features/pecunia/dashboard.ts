import * as stylex from "@stylexjs/stylex";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { DashboardData } from "../../client/pecunia/dashboard.js";
import type { PecuniaMessage } from "../../client/pecunia/message.js";
import { minorUnits } from "../../client/pecunia/money.js";
import type { Minor } from "../../client/pecunia/money.js";
import { shareOfLargest, trendGeometry, trendViewBox } from "./chart.js";
import { formatMinor } from "./money-format.js";
import { styles } from "./pecunia.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const trendValues = (
  points: DashboardData["balanceTrend"]
): [Minor, ...Minor[]] => {
  const [first, ...rest] = points;

  return [first.balanceMinor, ...rest.map((point) => point.balanceMinor)];
};

const trendEnds = (points: DashboardData["balanceTrend"]) => {
  const [first] = points;
  let last = first;

  for (const point of points) {
    last = point;
  }

  return [first, last] as const;
};

const summaryCards = (
  dashboard: DashboardData,
  h: HtmlBuilder<PecuniaMessage>
): Html => {
  const cards = [
    {
      key: "net-worth",
      label: "Net worth",
      minor: dashboard.summary.netWorthMinor,
    },
    {
      key: "spent",
      label: "Spent this month",
      minor: dashboard.summary.spentThisMonthMinor,
    },
    {
      key: "income",
      label: "Income this month",
      minor: dashboard.summary.incomeThisMonthMinor,
    },
    {
      key: "budget-left",
      label: "Budget left",
      minor: dashboard.summary.budgetLeftMinor,
    },
  ];

  return h.dl(
    [h.Class(className(styles.cardGrid))],
    cards.map((card) =>
      h.div(
        [h.Key(card.key), h.Class(className(styles.card))],
        [
          h.dt([h.Class(className(styles.cardLabel))], [card.label]),
          h.dd(
            [
              h.Class(
                stylex.props(
                  styles.cardValue,
                  card.minor < 0 && styles.valueDebit
                ).className ?? ""
              ),
            ],
            [formatMinor(card.minor, dashboard.currency)]
          ),
        ]
      )
    )
  );
};

const spendBars = (
  dashboard: DashboardData,
  h: HtmlBuilder<PecuniaMessage>
): Html => {
  const largest = minorUnits(
    Math.max(...dashboard.spendByCategory.map((row) => row.spentMinor))
  );

  return h.ul(
    [h.Class(className(styles.barList))],
    dashboard.spendByCategory.map((row) => {
      const share = shareOfLargest(row.spentMinor, largest);

      return h.li(
        [h.Key(row.category), h.Class(className(styles.barRow))],
        [
          h.span([h.Class(className(styles.barLabel))], [row.category]),
          h.svg(
            [
              h.Class(className(styles.barPlot)),
              h.ViewBox("0 0 100 10"),
              h.AriaHidden(true),
              h.PreserveAspectRatio("none"),
            ],
            [
              h.rect([
                h.Class(className(styles.barTrack)),
                h.Height("10"),
                h.Width("100"),
                h.X("0"),
                h.Y("0"),
              ]),
              h.rect([
                h.Class(className(styles.barFill)),
                h.Height("10"),
                h.Width(String(share * 100)),
                h.X("0"),
                h.Y("0"),
              ]),
            ]
          ),
          h.span(
            [h.Class(className(styles.barAmount))],
            [formatMinor(row.spentMinor, dashboard.currency)]
          ),
        ]
      );
    })
  );
};

const trendChart = (
  dashboard: DashboardData,
  h: HtmlBuilder<PecuniaMessage>
): Html => {
  const geometry = trendGeometry(trendValues(dashboard.balanceTrend));
  const [first, last] = trendEnds(dashboard.balanceTrend);

  return h.figure(
    [],
    [
      h.svg(
        [
          h.Class(className(styles.trendPlot)),
          h.Role("img"),
          h.AriaLabel(
            `Balance over the last twelve months, ${formatMinor(first.balanceMinor, dashboard.currency)} in ${first.month} and ${formatMinor(last.balanceMinor, dashboard.currency)} in ${last.month}`
          ),
          h.ViewBox(`0 0 ${trendViewBox.width} ${trendViewBox.height}`),
        ],
        [
          h.path([h.Class(className(styles.trendArea)), h.D(geometry.area)]),
          h.polyline([
            h.Class(className(styles.trendLine)),
            h.Points(geometry.points),
          ]),
        ]
      ),
      h.ul(
        [h.Class(className(styles.trendAxis))],
        dashboard.balanceTrend.map((point) =>
          h.li([h.Key(point.month)], [point.month])
        )
      ),
    ]
  );
};

const accounts = (
  dashboard: DashboardData,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.section(
    [h.AriaLabel("Accounts"), h.Class(className(styles.section))],
    [
      h.h2([h.Class(className(styles.sectionTitle))], ["Accounts"]),
      h.ul(
        [h.Class(className(styles.accountList))],
        dashboard.accounts.map((account) =>
          h.li(
            [h.Key(account.id), h.Class(className(styles.accountRow))],
            [
              h.span(
                [],
                [
                  h.span(
                    [h.Class(className(styles.accountName))],
                    [account.name]
                  ),
                  h.span([], [account.kind]),
                ]
              ),
              h.span(
                [h.Class(className(styles.accountValue))],
                [
                  formatMinor(
                    account.balance.amountMinor,
                    account.balance.currency
                  ),
                ]
              ),
            ]
          )
        )
      ),
    ]
  );

export const dashboardScreen = (
  dashboard: DashboardData,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.section(
    [h.AriaLabel("Dashboard"), h.Class(className(styles.section))],
    [
      h.div(
        [h.Class(className(styles.section))],
        [
          h.h1([h.Class(className(styles.pageTitle))], ["Dashboard"]),
          h.p(
            [h.Class(className(styles.secondaryNote)), h.Role("note")],
            ["Demo data. Every figure on this page is made up for the preview."]
          ),
        ]
      ),
      summaryCards(dashboard, h),
      h.div(
        [h.Class(className(styles.figureColumn))],
        [
          h.figure(
            [
              h.AriaLabel("Spend by category this month"),
              h.Class(className(styles.figure)),
              h.Role("group"),
            ],
            [
              h.p(
                [h.Class(className(styles.chartLabel))],
                ["Spend by category"]
              ),
              spendBars(dashboard, h),
            ]
          ),
          h.figure(
            [h.AriaLabel("Balance trend"), h.Class(className(styles.figure))],
            [
              h.p(
                [h.Class(className(styles.chartLabel))],
                ["Balance, last twelve months"]
              ),
              trendChart(dashboard, h),
            ]
          ),
        ]
      ),
      accounts(dashboard, h),
    ]
  );
