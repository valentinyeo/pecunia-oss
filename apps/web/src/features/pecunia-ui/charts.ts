import type { Html } from "@effect/ui/html";
import type { DailySpend, StackedMonth } from "@pecunia/reporting";

import { formatMinor } from "../pecunia/money-format.js";
import { categoryLabelOf } from "./period.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

export const chartPalette = [
  "#1e6091",
  "#2a9d8f",
  "#e9c46a",
  "#e76f51",
  "#6d597a",
  "#457b9d",
] as const;

export const paletteColor = (index: number): string =>
  chartPalette[index % chartPalette.length] ?? "#1e6091";

export const horizontalShareBar = <Msg>(
  h: Html.H<Msg>,
  basisPoints: number,
  color?: string
) => {
  const clamped = Math.max(0, Math.min(10_000, basisPoints));

  const fillWidth = Math.max(clamped > 0 ? 1 : 0, Math.round(clamped / 100));

  return h
    .el("svg")
    .attr("aria-hidden", "true")
    .attr("class", sx(styles.barPlot))
    .attr("preserveAspectRatio", "none")
    .attr("viewBox", "0 0 100 6")
    .children(
      h
        .el("rect")
        .attr("class", sx(styles.barTrack))
        .attr("height", "6")
        .attr("rx", "3")
        .attr("width", "100")
        .attr("x", "0")
        .attr("y", "0"),
      h
        .el("rect")
        .attr("class", color === undefined ? sx(styles.barFill) : "")
        .attr("fill", color ?? "currentColor")
        .attr("height", "6")
        .attr("rx", "3")
        .attr("width", String(fillWidth))
        .attr("x", "0")
        .attr("y", "0")
    );
};

export const dailyBarChart = <Msg>(
  h: Html.H<Msg>,
  points: readonly DailySpend[],
  currency: string,
  label: string
) => {
  const active = points.filter((point) => point.spendMinor > 0);

  if (points.length === 0 || active.length === 0) {
    return h.p
      .class(sx(pecuniaUiStyles.muted))
      .children("No daily spend recorded in this period.");
  }

  const displayed = points.length > 31 ? points.slice(-31) : points;
  const maxMinor = Math.max(...displayed.map((point) => point.spendMinor), 1);
  const viewWidth = 600;
  const viewHeight = 140;
  const plotHeight = 104;
  const step = viewWidth / displayed.length;
  const barWidth = Math.max(4, Math.min(26, step - 4));

  return h.figure.class(sx(styles.figure)).children(
    h.figcaption.class(sx(styles.chartLabel)).children(label),
    h
      .el("svg")
      .attr("aria-label", label)
      .attr("class", sx(pecuniaUiStyles.chartSvg))
      .attr("role", "img")
      .attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
      .children(
        h
          .el("line")
          .attr("stroke", "currentColor")
          .attr("stroke-opacity", "0.18")
          .attr("x1", "0")
          .attr("x2", String(viewWidth))
          .attr("y1", String(plotHeight + 4))
          .attr("y2", String(plotHeight + 4)),
        ...displayed.map((point, index) => {
          const height =
            point.spendMinor > 0
              ? Math.max(
                  4,
                  Math.round((point.spendMinor / maxMinor) * plotHeight)
                )
              : 0;

          const x = Math.round(index * step + (step - barWidth) / 2);
          const y = plotHeight + 4 - height;

          const showTick =
            index === 0 ||
            index === displayed.length - 1 ||
            index === Math.floor(displayed.length / 2);

          return h
            .el("g")
            .key(point.date)
            .children(
              h
                .el("rect")
                .attr("class", sx(styles.barFill))
                .attr("height", String(height))
                .attr("rx", "2")
                .attr("width", String(Math.round(barWidth)))
                .attr("x", String(x))
                .attr("y", String(y))
                .children(
                  h
                    .el("title")
                    .children(
                      `${point.date}: ${formatMinor(point.spendMinor, currency)}`
                    )
                ),
              showTick
                ? h
                    .el("text")
                    .attr("fill", "currentColor")
                    .attr("fill-opacity", "0.65")
                    .attr("font-size", "10")
                    .attr("text-anchor", "middle")
                    .attr("x", String(Math.round(x + barWidth / 2)))
                    .attr("y", String(viewHeight - 8))
                    .children(point.date.slice(5))
                : null
            );
        })
      )
  );
};

export interface MonthlyBarPoint {
  readonly amountMinor: number;
  readonly month: string;
}

export const monthlyBarChart = <Msg>(
  h: Html.H<Msg>,
  points: readonly MonthlyBarPoint[],
  currency: string,
  label: string,
  color = "#2a9d8f"
) => {
  if (points.length === 0) {
    return h.p
      .class(sx(pecuniaUiStyles.muted))
      .children("No monthly data in this period.");
  }

  const maxMinor = Math.max(...points.map((point) => point.amountMinor), 1);
  const viewWidth = 600;
  const viewHeight = 156;
  const plotHeight = 112;
  const step = viewWidth / points.length;
  const barWidth = Math.max(12, Math.min(44, step - 10));

  return h.figure.class(sx(styles.figure)).children(
    h.figcaption.class(sx(styles.chartLabel)).children(label),
    h
      .el("svg")
      .attr("aria-label", label)
      .attr("class", sx(pecuniaUiStyles.chartSvg))
      .attr("role", "img")
      .attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
      .children(
        h
          .el("line")
          .attr("stroke", "currentColor")
          .attr("stroke-opacity", "0.18")
          .attr("x1", "0")
          .attr("x2", String(viewWidth))
          .attr("y1", String(plotHeight + 8))
          .attr("y2", String(plotHeight + 8)),
        ...points.map((point, index) => {
          const height =
            point.amountMinor > 0
              ? Math.max(
                  4,
                  Math.round((point.amountMinor / maxMinor) * plotHeight)
                )
              : 0;

          const x = Math.round(index * step + (step - barWidth) / 2);
          const y = plotHeight + 8 - height;

          return h
            .el("g")
            .key(point.month)
            .children(
              h
                .el("rect")
                .attr("fill", color)
                .attr("height", String(height))
                .attr("rx", "3")
                .attr("width", String(Math.round(barWidth)))
                .attr("x", String(x))
                .attr("y", String(y))
                .children(
                  h
                    .el("title")
                    .children(
                      `${point.month}: ${formatMinor(point.amountMinor, currency)}`
                    )
                ),
              h
                .el("text")
                .attr("fill", "currentColor")
                .attr("fill-opacity", "0.7")
                .attr("font-size", "10")
                .attr("text-anchor", "middle")
                .attr("x", String(Math.round(x + barWidth / 2)))
                .attr("y", String(viewHeight - 10))
                .children(point.month.slice(2))
            );
        })
      )
  );
};

export interface DonutSlice {
  readonly color: string;
  readonly label: string;
  readonly shareBasisPoints: number;
  readonly valueMinor: number;
}

export const donutChart = <Msg>(
  h: Html.H<Msg>,
  slices: readonly DonutSlice[],
  currency: string,
  title: string
) => {
  const nonZero = slices.filter((slice) => slice.shareBasisPoints > 0);

  if (nonZero.length === 0) {
    return h.p
      .class(sx(pecuniaUiStyles.muted))
      .children("No spend to chart in this period.");
  }

  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  const segments: {
    readonly dashArray: string;
    readonly dashOffset: string;
    readonly slice: DonutSlice;
  }[] = [];

  let consumed = 0;

  for (const slice of nonZero) {
    const length = (slice.shareBasisPoints / 10_000) * circumference;

    segments.push({
      dashArray: `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`,
      dashOffset: (-consumed).toFixed(2),
      slice,
    });
    consumed += length;
  }

  return h.figure.class(sx(styles.figure)).children(
    h.figcaption.class(sx(styles.chartLabel)).children(title),
    h.div.class(sx(pecuniaUiStyles.donutLayout)).children(
      h
        .el("svg")
        .attr("aria-label", title)
        .attr("class", sx(pecuniaUiStyles.donutSvg))
        .attr("role", "img")
        .attr("viewBox", "0 0 120 120")
        .children(
          h
            .el("g")
            .attr("transform", "rotate(-90 60 60)")
            .children(
              ...segments.map((segment) =>
                h
                  .el("circle")
                  .key(segment.slice.label)
                  .attr("cx", "60")
                  .attr("cy", "60")
                  .attr("fill", "none")
                  .attr("r", String(radius))
                  .attr("stroke", segment.slice.color)
                  .attr("stroke-dasharray", segment.dashArray)
                  .attr("stroke-dashoffset", segment.dashOffset)
                  .attr("stroke-width", "18")
                  .children(
                    h
                      .el("title")
                      .children(
                        `${segment.slice.label}: ${formatMinor(segment.slice.valueMinor, currency)} (${(segment.slice.shareBasisPoints / 100).toFixed(1)}%)`
                      )
                  )
              )
            )
        ),
      h.ul.class(sx(pecuniaUiStyles.legendList)).children(
        nonZero.map((slice) =>
          h.li
            .key(slice.label)
            .class(sx(pecuniaUiStyles.legendItem))
            .children(
              h.span
                .attr("aria-hidden", "true")
                .attr("style", `background-color: ${slice.color}`)
                .class(sx(pecuniaUiStyles.legendSwatch)),
              h.span.children(slice.label),
              h.span
                .class(sx(pecuniaUiStyles.monoValue))
                .children(
                  `${formatMinor(slice.valueMinor, currency)} · ${(slice.shareBasisPoints / 100).toFixed(1)}%`
                )
            )
        )
      )
    )
  );
};

export const stackedMonthlyChart = <Msg>(
  h: Html.H<Msg>,
  months: readonly StackedMonth[],
  currency: string,
  title: string
) => {
  if (months.length === 0) {
    return h.p
      .class(sx(pecuniaUiStyles.muted))
      .children("No monthly spend series in this period.");
  }

  const categoryOrder: string[] = [];

  for (const month of months) {
    for (const row of month.rows) {
      const label = categoryLabelOf(row.category);

      if (!categoryOrder.includes(label)) {
        categoryOrder.push(label);
      }
    }
  }

  const colorFor = (label: string) =>
    paletteColor(Math.max(0, categoryOrder.indexOf(label)));

  const maxMinor = Math.max(...months.map((month) => month.totalMinor), 1);
  const viewWidth = 600;
  const viewHeight = 160;
  const plotHeight = 116;
  const step = viewWidth / months.length;
  const barWidth = Math.max(12, Math.min(40, step - 8));

  return h.figure.class(sx(styles.figure)).children(
    h.figcaption.class(sx(styles.chartLabel)).children(title),
    h
      .el("svg")
      .attr("aria-label", title)
      .attr("class", sx(pecuniaUiStyles.chartSvg))
      .attr("role", "img")
      .attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
      .children(
        h
          .el("line")
          .attr("stroke", "currentColor")
          .attr("stroke-opacity", "0.18")
          .attr("x1", "0")
          .attr("x2", String(viewWidth))
          .attr("y1", String(plotHeight + 8))
          .attr("y2", String(plotHeight + 8)),
        ...months.map((month, index) => {
          const x = Math.round(index * step + (step - barWidth) / 2);

          let yCursor = plotHeight + 8;

          const rects = month.rows
            .filter((row) => row.spendMinor > 0)
            .map((row) => {
              const label = categoryLabelOf(row.category);

              const height = Math.max(
                3,
                Math.round((row.spendMinor / maxMinor) * plotHeight)
              );

              yCursor -= height;

              return h
                .el("rect")
                .key(`${month.month}:${label}`)
                .attr("fill", colorFor(label))
                .attr("height", String(height))
                .attr("width", String(Math.round(barWidth)))
                .attr("x", String(x))
                .attr("y", String(Math.max(0, yCursor)))
                .children(
                  h
                    .el("title")
                    .children(
                      `${month.month} · ${label}: ${formatMinor(row.spendMinor, currency)}`
                    )
                );
            });

          return h
            .el("g")
            .key(month.month)
            .children(
              ...rects,
              h
                .el("text")
                .attr("fill", "currentColor")
                .attr("fill-opacity", "0.7")
                .attr("font-size", "10")
                .attr("text-anchor", "middle")
                .attr("x", String(Math.round(x + barWidth / 2)))
                .attr("y", String(viewHeight - 10))
                .children(month.month.slice(2))
            );
        })
      )
  );
};
