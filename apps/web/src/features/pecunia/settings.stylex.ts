import * as stylex from "@stylexjs/stylex";

import { fonts, pecunia } from "./tokens.stylex.js";

const focusRing = {
  outlineColor: { ":focus-visible": pecunia.accent, default: null },
  outlineOffset: { ":focus-visible": "3px", default: null },
  outlineStyle: { ":focus-visible": "solid", default: null },
  outlineWidth: { ":focus-visible": "2px", default: null },
};

export const settingsStyles = stylex.create({
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
  },
  field: {
    display: "grid",
    gap: "0.25rem",
  },
  fieldHint: {
    color: pecunia.inkMuted,
    fontSize: "0.8rem",
    margin: 0,
  },
  fieldInput: {
    backgroundColor: pecunia.surface,
    borderColor: pecunia.rule,
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.ink,
    fontFamily: fonts.mono,
    fontSize: "1rem",
    padding: "0.45rem 0.6rem",
  },
  fieldInputInvalid: {
    borderColor: pecunia.negative,
  },
  fieldLabel: {
    fontWeight: 600,
  },
  form: {
    display: "grid",
    gap: "0.9rem",
  },
  focus: focusRing,
  profileList: {
    borderTopColor: pecunia.rule,
    borderTopStyle: "solid",
    borderTopWidth: "1px",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  profileRow: {
    alignItems: "baseline",
    borderBottomColor: pecunia.rule,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    justifyContent: "space-between",
    paddingBlock: "0.55rem",
  },
  profileName: {
    fontWeight: 600,
  },
  profileValue: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
  },
  saveButton: {
    backgroundColor: pecunia.ink,
    borderColor: pecunia.ink,
    borderRadius: "999px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: pecunia.background,
    cursor: "pointer",
    fontFamily: fonts.sans,
    fontSize: "0.9rem",
    padding: "0.45rem 1.1rem",
  },
  saveButtonDisabled: {
    cursor: "not-allowed",
    opacity: 0.6,
  },
  status: {
    color: pecunia.inkMuted,
    margin: 0,
    minHeight: "1.2rem",
  },
  valueList: {
    display: "grid",
    gap: "0.4rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
    margin: 0,
  },
  valueLabel: {
    color: pecunia.inkMuted,
    fontSize: "0.8rem",
    letterSpacing: "0.02em",
  },
  valueText: {
    fontFamily: fonts.mono,
    margin: 0,
  },
});
