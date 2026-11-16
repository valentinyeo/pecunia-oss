import type { Minor } from "../../client/pecunia/money.js";

export const trendViewBox = { height: 96, width: 320 } as const;

const inset = 4;

const round = (value: number): number => Math.round(value * 100) / 100;

export const shareOfLargest = (value: Minor, largest: Minor): number =>
  largest <= 0 ? 0 : Math.min(1, Math.max(0, value / largest));

export type TrendGeometry = Readonly<{ area: string; points: string }>;

export const trendGeometry = (
  values: readonly [Minor, ...Minor[]]
): TrendGeometry => {
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const span = highest - lowest;
  const top = inset;
  const bottom = trendViewBox.height - inset;

  const step =
    values.length === 1
      ? 0
      : (trendViewBox.width - inset * 2) / (values.length - 1);

  const coords = values.map((value, index) => ({
    x: round(inset + index * step),
    y: round(
      span === 0
        ? (top + bottom) / 2
        : bottom - ((value - lowest) / span) * (bottom - top)
    ),
  }));

  const points = coords.map(({ x, y }) => `${x},${y}`).join(" ");

  const line = coords
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x},${y}`)
    .join(" ");

  const lastX = round(inset + (values.length - 1) * step);

  return {
    area: `M ${inset},${bottom} ${line} L ${lastX},${bottom} Z`,
    points,
  };
};
