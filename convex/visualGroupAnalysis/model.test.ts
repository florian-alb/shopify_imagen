import { describe, expect, it } from "vitest";

import { parseIndexedAssignments } from "./model";

function geminiPayload(assignments: unknown[]) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify({ assignments }) }],
        },
      },
    ],
  };
}

describe("parseIndexedAssignments", () => {
  it("keeps numeric assignments and fills in omitted references", () => {
    const result = parseIndexedAssignments(
      geminiPayload([
        {
          referenceIndex: 1,
          matches: [{ groupIndex: 2, confidence: 0.92 }],
        },
      ]),
      3,
      4,
    );

    expect(result).toEqual([
      { referenceIndex: 0, matches: [] },
      {
        referenceIndex: 1,
        matches: [{ groupIndex: 2, confidence: 0.92 }],
      },
      { referenceIndex: 2, matches: [] },
    ]);
  });

  it("rejects invalid indexes and keeps the strongest duplicate match", () => {
    const result = parseIndexedAssignments(
      geminiPayload([
        {
          referenceIndex: 0,
          matches: [
            { groupIndex: 1, confidence: 0.4 },
            { groupIndex: 1, confidence: 0.88 },
            { groupIndex: 7, confidence: 1 },
          ],
        },
        {
          referenceIndex: 9,
          matches: [{ groupIndex: 0, confidence: 1 }],
        },
      ]),
      1,
      2,
    );

    expect(result).toEqual([
      {
        referenceIndex: 0,
        matches: [{ groupIndex: 1, confidence: 0.88 }],
      },
    ]);
  });

  it("falls back to one unmatched result per reference on malformed JSON", () => {
    const result = parseIndexedAssignments(
      {
        candidates: [{ content: { parts: [{ text: "{not valid json" }] } }],
      },
      2,
      3,
    );

    expect(result).toEqual([
      { referenceIndex: 0, matches: [] },
      { referenceIndex: 1, matches: [] },
    ]);
  });
});
