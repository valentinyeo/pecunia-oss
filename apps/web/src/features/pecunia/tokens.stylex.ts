import * as stylex from "@stylexjs/stylex";

export const pecunia = stylex.defineVars({
  accent: "#ff1493",
  accentText: "#c8006e",
  background: "#f6f4f1",
  chartBar: "#37332f",
  chartTrack: "#e9e4dd",
  ink: "#1c1a19",
  inkMuted: "#5f5b56",
  negative: "#a8271f",
  positive: "#0b6b53",
  rule: "#dcd7d0",
  surface: "#ffffff",
});

export const darkPecunia = stylex.createTheme(pecunia, {
  accent: "#ff5fae",
  accentText: "#ff9fca",
  background: "#131216",
  chartBar: "#ece7df",
  chartTrack: "#2b2830",
  ink: "#f4f1ec",
  inkMuted: "#a49f98",
  negative: "#ff9a91",
  positive: "#4fcea2",
  rule: "#312e37",
  surface: "#1b1a20",
});

export const fonts = stylex.defineVars({
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});
