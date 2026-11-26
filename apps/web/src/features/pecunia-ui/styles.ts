import * as stylex from "@stylexjs/stylex";

import { fonts, pecunia } from "../pecunia/tokens.stylex.js";

export { darkPecunia } from "../pecunia/tokens.stylex.js";

export { layout, styles } from "../pecunia/pecunia.stylex.js";

export const pecuniaUiStyles = stylex.create({
  actionRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  badge: {
    borderColor: pecunia.rule,
    borderRadius: "999px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.inkMuted,
    display: "inline-block",
    fontSize: "0.75rem",
    padding: "0.15rem 0.55rem",
  },
  button: {
    backgroundColor: pecunia.surface,
    borderColor: pecunia.rule,
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.ink,
    cursor: "pointer",
    fontFamily: fonts.sans,
    fontSize: "0.85rem",
    fontWeight: 500,
    minHeight: "2.15rem",
    padding: "0.35rem 0.75rem",
  },
  buttonActive: {
    backgroundColor: pecunia.ink,
    borderColor: pecunia.ink,
    color: pecunia.surface,
  },
  buttonPrimary: {
    backgroundColor: pecunia.accentText,
    borderColor: pecunia.accentText,
    color: "#ffffff",
  },
  feedback: {
    backgroundColor: pecunia.surface,
    borderColor: pecunia.rule,
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.ink,
    fontSize: "0.875rem",
    marginBlock: "0.75rem",
    padding: "0.6rem 0.85rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
  },
  fieldLabel: {
    color: pecunia.inkMuted,
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  formGrid: {
    display: "grid",
    gap: "0.9rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
    marginBlock: "0.75rem",
  },
  input: {
    backgroundColor: pecunia.surface,
    borderColor: pecunia.rule,
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.ink,
    fontFamily: fonts.sans,
    fontSize: "0.9rem",
    minHeight: "2.25rem",
    padding: "0.35rem 0.65rem",
  },
  monoValue: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
  },
  muted: {
    color: pecunia.inkMuted,
    fontSize: "0.85rem",
  },
  profileSelect: {
    backgroundColor: pecunia.surface,
    borderColor: pecunia.rule,
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.ink,
    fontFamily: fonts.sans,
    fontSize: "0.85rem",
    minHeight: "2.15rem",
    padding: "0.25rem 0.6rem",
  },
  rowMeta: {
    color: pecunia.inkMuted,
    display: "block",
    fontSize: "0.8rem",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
  },
  tableCell: {
    borderBottomColor: pecunia.rule,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    padding: "0.65rem 0.5rem",
    textAlign: "start",
    verticalAlign: "top",
  },
  tableCellRight: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
  },
  tableHeader: {
    borderBottomColor: pecunia.rule,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    color: pecunia.inkMuted,
    fontSize: "0.78rem",
    fontWeight: 600,
    padding: "0.5rem",
    textAlign: "start",
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    justifyContent: "space-between",
  },
});

export const sx = (
  ...applied: readonly (stylex.CompiledStyles | boolean | null | undefined)[]
) => stylex.props(...applied).className ?? "";
