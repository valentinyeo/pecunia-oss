import * as stylex from "@stylexjs/stylex";

import { fonts, pecunia } from "./tokens.stylex.js";

const focusRing = {
  outlineColor: { ":focus-visible": pecunia.accent, default: null },
  outlineOffset: { ":focus-visible": "3px", default: null },
  outlineStyle: { ":focus-visible": "solid", default: null },
  outlineWidth: { ":focus-visible": "2px", default: null },
};

export const subscriptionsStyles = stylex.create({
  filterButton: {
    backgroundColor: "transparent",
    borderColor: pecunia.rule,
    borderRadius: "999px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.ink,
    cursor: "pointer",
    fontFamily: fonts.sans,
    fontSize: "0.82rem",
    paddingBlock: "0.3rem",
    paddingInline: "0.9rem",
  },
  filterButtonActive: {
    backgroundColor: pecunia.ink,
    borderColor: pecunia.ink,
    color: pecunia.background,
    fontWeight: 600,
  },
  filterGroup: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
  },
  focus: focusRing,
  panel: {
    alignItems: "end",
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "space-between",
  },
  rowFrequency: {
    color: pecunia.inkMuted,
    fontFamily: fonts.mono,
    fontSize: "0.78rem",
  },
  rowHead: {
    alignItems: "baseline",
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: "minmax(0, 1fr) auto",
  },
  rowMeta: {
    alignItems: "center",
    color: pecunia.inkMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: "0.85rem",
    gap: "0.5rem",
  },
  rowPayee: {
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  totals: {
    display: "grid",
    gap: "0.4rem 1.5rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(9rem, auto))",
    margin: 0,
  },
  totalLabel: {
    color: pecunia.inkMuted,
    fontSize: "0.8rem",
    letterSpacing: "0.02em",
  },
  totalValue: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "1.3rem",
    margin: 0,
  },
});
