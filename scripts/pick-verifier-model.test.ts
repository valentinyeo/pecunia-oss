import { describe, expect, it } from "vitest";

import {
  answerText,
  authorFamilies,
  authorModels,
  pickVerifier,
  readVerdict,
} from "./pick-verifier-model.ts";
import type { LadderFamily, Verdict } from "./pick-verifier-model.ts";

const ladderFamilies: readonly LadderFamily[] = [
  "anthropic",
  "cursor",
  "deepseek",
  "google",
  "moonshotai",
  "openai",
  "zai",
];

const seededDraws = (seed: number, count: number) => {
  let state = seed;
  const draws: number[] = [];

  for (let index = 0; index < count; index += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    draws.push(state / 2_147_483_648);
  }

  return draws;
};

type AnswerContent = string | readonly { readonly text?: string }[];

const renderAnswer = (content: AnswerContent) =>
  JSON.stringify({ choices: [{ message: { content } }] });

describe("author models", () => {
  it("reads one line per author and skips quoted examples", () => {
    const body = [
      "Why: prove the money rule.",
      "",
      "Author model: anthropic/claude-opus-5-5",
      "",
      "```text",
      "Author model: openai/gpt-6.1-sol",
      "```",
      "",
      "Author model: google/gemini-4-neon-high",
      "",
    ].join("\n");

    expect(authorModels(body)).toEqual([
      "anthropic/claude-opus-5-5",
      "google/gemini-4-neon-high",
    ]);
  });

  it("refuses a body with no author line", () => {
    const result = authorFamilies({
      authorLogin: "someone",
      body: "Why: prove the money rule.",
      coAuthors: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.problem).toContain("Author model:");
  });

  it("refuses fewer lines than the pull request has authors", () => {
    const result = authorFamilies({
      authorLogin: "someone",
      body: "Author model: anthropic/claude-opus-5-5\n",
      coAuthors: ["a-coauthor"],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.problem).toContain("2 authors");
  });

  it("counts a co-author the author line already renamed once", () => {
    const result = authorFamilies({
      authorLogin: "someone",
      body: [
        "Author model: anthropic/claude-opus-5-5",
        "Author model: kimi/k2",
      ].join("\n"),
      coAuthors: ["someone", "a-coauthor "],
    });

    expect(result).toEqual({
      families: ["anthropic", "moonshotai"],
      ok: true,
    });
  });

  it("refuses a family the ladder cannot exclude", () => {
    const result = authorFamilies({
      authorLogin: "someone",
      body: "Author model: mistral/mistral-large\n",
      coAuthors: [],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.problem).toContain("mistral/mistral-large");
  });

  it("normalises a family name to the ladder spelling", () => {
    const result = authorFamilies({
      authorLogin: "someone",
      body: "Author model: GLM/glm-5.3-flash\n",
      coAuthors: [],
    });

    expect(result).toEqual({ families: ["zai"], ok: true });
  });
});

describe("the verifier pick", () => {
  it("never picks a family an author used", () => {
    for (const family of ladderFamilies) {
      const pick = pickVerifier([family]);

      expect(pick.ok).toBe(true);
      expect(pick.ok ? pick.family : family).not.toBe(family);
    }
  });

  it("refuses when every candidate family wrote the pull request", () => {
    const pick = pickVerifier([
      "google",
      "anthropic",
      "openai",
      "zai",
      "moonshotai",
      "deepseek",
    ]);

    expect(pick.ok).toBe(false);
  });

  it("holds over 600 seeded author family sets", () => {
    const draws = seededDraws(7, 600 * ladderFamilies.length);
    let checked = 0;

    for (let caseIndex = 0; caseIndex < 600; caseIndex += 1) {
      const authors = ladderFamilies.filter(
        (_family, familyIndex) =>
          (draws[caseIndex * ladderFamilies.length + familyIndex] ?? 0) < 0.5
      );

      const pick = pickVerifier(authors);

      if (pick.ok) {
        expect(authors).not.toContain(pick.family);
      } else {
        expect(pick.problem).toContain("Every verifier family");
        expect(authors).toEqual(
          expect.arrayContaining([
            "anthropic",
            "deepseek",
            "google",
            "moonshotai",
            "openai",
            "zai",
          ])
        );
      }

      checked += 1;
    }

    expect(checked).toBe(600);
  });
});

describe("the ladder answer", () => {
  it("reads a text answer", () => {
    expect(
      answerText(renderAnswer("VERDICT: PASS\nAll ten checks ran at head."))
    ).toContain("VERDICT: PASS");
  });

  it("reads a part list", () => {
    expect(
      answerText(
        renderAnswer([{ text: "VERDICT: FAIL" }, { text: "\nNo proof." }])
      )
    ).toBe("VERDICT: FAIL\nNo proof.");
  });

  it("falls back to reasoning when the content is empty", () => {
    expect(
      answerText(
        JSON.stringify({
          choices: [{ message: { content: "", reasoning: "VERDICT: PASS" } }],
        })
      )
    ).toBe("VERDICT: PASS");
  });

  it("reads nothing from a body that is not an answer", () => {
    expect(answerText("<html>502</html>")).toBe("");
  });
});

describe("the verdict", () => {
  const verdicts: readonly Verdict[] = ["PASS", "PASS+NOTES", "FAIL"];

  it("reads every verdict form", () => {
    expect(readVerdict("VERDICT: PASS\n")).toEqual({
      notes: "",
      ok: true,
      verdict: "PASS",
    });
    expect(readVerdict("**PASS+NOTES**\nTwo files went unexercised.")).toEqual({
      notes: "Two files went unexercised.",
      ok: true,
      verdict: "PASS+NOTES",
    });
    expect(readVerdict('{"verdict": "FAIL"}')).toEqual({
      notes: "",
      ok: true,
      verdict: "FAIL",
    });
  });

  it("takes the last verdict line", () => {
    for (const verdict of verdicts) {
      const reading = readVerdict(`VERDICT: PASS\nVERDICT: ${verdict}\n`);

      expect(reading.ok ? reading.verdict : "missing").toBe(verdict);
    }
  });

  it("fails closed when the answer holds no verdict", () => {
    const reading = readVerdict("The tests look fine to me.");

    expect(reading.ok).toBe(false);
  });
});
