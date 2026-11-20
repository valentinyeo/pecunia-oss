import { expect, it } from "@effect/vitest";
import { Option, Result, Schema } from "effect";

import {
  archiveFilenameOf,
  archivePathOf,
  pathBlockedBy,
  segmentsOf,
} from "../src/archive-path.js";
import {
  ArchivePlaceSchema,
  ArchiveStateSchema,
  BlocklistSchema,
  DateOnlySchema,
  InvoiceDocumentSchema,
  InvoiceSourceSchema,
  ProfileIdSchema,
  SourcePatternSchema,
} from "../src/model.js";
import type {
  ArchivePlace,
  DateOnly,
  InvoiceDocument,
  InvoiceSource,
} from "../src/model.js";
import { matchesMerchant, sourceFor } from "../src/sources.js";

const decode = Schema.decodeSync;

const CASES = 600;

const profileId = decode(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

interface Random {
  readonly chance: (probability: number) => boolean;
  readonly int: (min: number, max: number) => number;
  readonly pick: <A>(items: readonly [A, ...A[]]) => A;
}

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  const pick = <A>(items: readonly [A, ...A[]]): A => {
    const chosen = items[int(0, items.length - 1)];

    if (chosen === undefined) {
      throw new Error("A generated pick needs a non-empty source list");
    }

    return chosen;
  };

  return { chance: (probability) => next() < probability, int, pick };
};

const tuple = <A>(items: readonly A[]): readonly [A, ...A[]] => {
  const [first, ...rest] = items;

  if (first === undefined) {
    throw new Error("A generated pool needs at least one value");
  }

  return [first, ...rest];
};

const WORDS = tuple([
  "Demo",
  "Cloud",
  "Hosting",
  "Example",
  "Design",
  "Tool",
  "Rail",
  "Stationery",
  "Ltd",
]);

const merchantOf = (random: Random): string =>
  Array.from({ length: random.int(1, 4) }, () => random.pick(WORDS)).join(
    random.pick([" ", "  ", "-", "/", ""])
  );

const patternOf = (random: Random, merchant: string): string => {
  if (random.chance(0.15)) {
    return random.pick(["", "   ", "\t"]);
  }

  if (random.chance(0.4)) {
    return random.pick(WORDS);
  }

  if (random.chance(0.5)) {
    return merchant.slice(0, random.int(1, Math.max(1, merchant.length)));
  }

  return merchant;
};

const referenceMatches = (pattern: string, merchant: string): boolean => {
  const needle = pattern.trim().toLowerCase();

  return needle.length > 0 && merchant.trim().toLowerCase().includes(needle);
};

it("matches a merchant by case-insensitive substring in 600 cases", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_22_00_01 + index);
    const merchant = merchantOf(random);
    const pattern = patternOf(random, merchant);

    expect(matchesMerchant(pattern, merchant)).toBe(
      referenceMatches(pattern, merchant)
    );

    expect(matchesMerchant(pattern, merchant.toUpperCase())).toBe(
      matchesMerchant(pattern, merchant)
    );

    const decoded = Schema.decodeResult(SourcePatternSchema)(pattern);

    if (pattern.trim().length > 0) {
      expect(Result.isSuccess(decoded)).toBe(true);

      if (Result.isSuccess(decoded)) {
        expect(decoded.success).toBe(pattern.trim());
      }
    } else {
      expect(Result.isFailure(decoded)).toBe(true);
    }
  }
});

const sourceOf = (options: {
  readonly id: string;
  readonly pattern: string;
}): InvoiceSource =>
  decode(InvoiceSourceSchema)({
    id: options.id,
    loginHint: null,
    notes: null,
    pattern: options.pattern,
    portalUrl: null,
    profileId,
    retrieval: {
      bookkeeper: false,
      email: false,
      portal: true,
      twoFactor: true,
    },
    vendorPayeeId: null,
  });

it("picks the lowest matching invoice source in 600 generated lists", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_22_00_02 + index);
    const merchant = merchantOf(random);

    const sources = Array.from({ length: random.int(0, 5) }, (_, position) =>
      sourceOf({
        id: `source-${index}-${padded(position)}`,
        pattern: random.chance(0.4)
          ? random.pick(WORDS)
          : `${random.pick(WORDS)} ${random.pick(WORDS)}`,
      })
    );

    const chosen = sourceFor(merchant, sources);

    const [expected] = sources
      .filter((source) => referenceMatches(source.pattern, merchant))
      .toSorted((left, right) => {
        if (left.id === right.id) {
          return 0;
        }

        return left.id < right.id ? -1 : 1;
      });

    expect(Option.getOrUndefined(chosen)?.id).toBe(expected?.id);

    expect(
      Option.match(chosen, {
        onNone: () => true,
        onSome: (source) => referenceMatches(source.pattern, merchant),
      })
    ).toBe(true);
  }
});

const padded = (value: number): string => String(value).padStart(2, "0");

const dateOf = (value: string): DateOnly => decode(DateOnlySchema)(value);

const shaOf = (index: number): string =>
  `${String(index).padStart(12, "0")}${"a1b2c3d4e5f6".repeat(5).slice(0, 52)}`;

const documentOf = (options: {
  readonly filename: string;
  readonly index: number;
}): InvoiceDocument =>
  decode(InvoiceDocumentSchema)({
    amount: null,
    archive: ArchiveStateSchema.cases.Unarchived.make({}),
    contentType: "application/pdf",
    documentDate: dateOf("2025-03-11"),
    documentType: "invoice",
    id: `document-${options.index}`,
    originalFilename: options.filename,
    profileId,
    r2Key: `documents/${options.index}`,
    sha256: shaOf(options.index),
    sizeBytes: 1024,
    source: "upload",
    sourceRef: null,
    transactionId: null,
    vendorPayeeId: null,
  });

const placeOf = (options: {
  readonly blocklist: readonly string[];
  readonly rootRef: string;
}): ArchivePlace =>
  decode(ArchivePlaceSchema)({
    blocklist: options.blocklist,
    id: `place-${options.rootRef.length}`,
    profileId,
    provider: "drive",
    rootRef: options.rootRef,
  });

const ROOT_PIECES = tuple([
  "archive",
  "drive",
  "..",
  ".",
  "",
  "  ",
  "Demo Archive",
  "a b",
  "folder/sub",
  "x\\y",
  "nul\u0000root",
  "bell\u0007root",
]);

const FILENAME_PIECES = tuple([
  "invoice.pdf",
  "../invoice.pdf",
  "..\\invoice.pdf",
  "  spaced.pdf ",
  "tab\tname.pdf",
  "nul\u0000name.pdf",
  "..",
  ".",
  "",
  "   ",
  "demo-invoice-2025-03.pdf",
]);

const generatedRoot = (random: Random): string => {
  const raw = Array.from({ length: random.int(0, 4) }, () =>
    random.pick(ROOT_PIECES)
  ).join(random.pick(["/", "\\", "/"]));

  return raw.trim().length > 0 ? raw : "archive";
};

const generatedFilename = (random: Random): string => {
  const raw = random.chance(0.15)
    ? random.pick(FILENAME_PIECES)
    : `${random.pick(["demo", "example", "invoice", "receipt"])}-${random.int(
        0,
        999
      )}.pdf`;

  return raw.trim().length > 0 ? raw : "invoice.pdf";
};

const isSafeSegment = (segment: string): boolean => {
  for (let position = 0; position < segment.length; position += 1) {
    const character = segment.charAt(position);
    const code = segment.codePointAt(position) ?? 0;

    if (
      character === "/" ||
      character === "\\" ||
      (code <= 0x1f && code !== 0x09) ||
      code === 0x7f
    ) {
      return false;
    }
  }

  return true;
};

it("builds one safe, stable folder path per document in 600 cases", () => {
  const seen = new Map<string, string>();

  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_22_00_03 + index);

    const place = placeOf({
      blocklist: [],
      rootRef: generatedRoot(random),
    });

    const document = documentOf({
      filename: generatedFilename(random),
      index,
    });

    const path = archivePathOf(place, document);
    const segments = segmentsOf(path);

    expect(path).toBe(archivePathOf(place, document));
    expect(path).toBe(segments.join("/"));
    expect(segments.length).toBeGreaterThanOrEqual(3);

    for (const segment of segments) {
      expect(segment.length).toBeGreaterThan(0);
      expect(segment).not.toBe(".");
      expect(segment).not.toBe("..");
      expect(isSafeSegment(segment)).toBe(true);
    }

    const filename = archiveFilenameOf(document);

    expect(filename.startsWith(document.sha256.slice(0, 12))).toBe(true);
    expect(filename.length).toBeLessThanOrEqual(12 + 1 + 120);
    expect(segments.at(-1)).toBe(filename);
    expect(segments.at(-2)).toBe("03");
    expect(segments.at(-3)).toBe("2025");

    const previous = seen.get(filename);

    if (previous === undefined) {
      seen.set(filename, document.id);
    } else {
      expect(previous).toBe(document.id);
    }

    for (const segment of segmentsOf(place.rootRef)) {
      expect(segment).not.toBe(".");
      expect(segment).not.toBe("..");
    }
  }

  expect(seen.size).toBeGreaterThan(500);
});

it("cleans a control character out of the archive root", () => {
  const place = placeOf({
    blocklist: [],
    rootRef: "nul\u0000folder/../archive",
  });

  const document = documentOf({
    filename: "demo-invoice-2025-03.pdf",
    index: 0,
  });

  const path = archivePathOf(place, document);

  expect(path).toBe(
    `nul-folder/archive/2025/03/${archiveFilenameOf(document)}`
  );
  expect(path).not.toMatch(/\p{Cc}/u);

  for (const segment of segmentsOf(path)) {
    expect(isSafeSegment(segment)).toBe(true);
  }
});

const referenceBlocked = (entry: string, path: string): boolean => {
  const pattern = entry.trim().toLowerCase();

  const segments = path
    .split("/")
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);

  const filename = segments.at(-1) ?? "";

  if (pattern.length === 0) {
    return false;
  }

  if (pattern.startsWith("*.")) {
    return filename.endsWith(pattern.slice(1));
  }

  if (pattern.endsWith("*")) {
    return segments.some((segment) => segment.startsWith(pattern.slice(0, -1)));
  }

  return segments.includes(pattern);
};

const BLOCKLIST_PIECES = tuple([
  "*.pdf",
  "*.tmp",
  "archive",
  "2025",
  "03",
  "demo*",
  "*archive",
  "invoice",
  "..",
  ".",
  "",
  "  ",
]);

it("blocks exactly the paths a blocklist entry names in 600 cases", () => {
  let blocked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_22_00_04 + index);

    const entries = Array.from({ length: random.int(0, 4) }, () =>
      random.pick(BLOCKLIST_PIECES)
    );

    const decoded = Schema.decodeResult(BlocklistSchema)(
      entries.filter((entry) => entry.trim().length > 0)
    );

    const blocklist = Result.isSuccess(decoded) ? decoded.success : [];

    const place = placeOf({ blocklist, rootRef: generatedRoot(random) });

    const document = documentOf({
      filename: generatedFilename(random),
      index,
    });

    const path = archivePathOf(place, document);
    const found = pathBlockedBy(path, place.blocklist);

    const expected = place.blocklist.find((entry) =>
      referenceBlocked(entry, path)
    );

    expect(Option.getOrUndefined(found)).toBe(expected);

    if (Option.isSome(found)) {
      blocked += 1;
      expect(found.value.trim().length).toBeGreaterThan(0);
      expect(found.value).not.toBe("..");
      expect(found.value).not.toBe(".");
    }
  }

  expect(blocked).toBeGreaterThan(50);
});
