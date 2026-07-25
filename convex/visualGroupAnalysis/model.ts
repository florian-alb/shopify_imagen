export type IndexedModelMatch = {
  groupIndex: number;
  confidence: number;
  box2d?: number[];
};

export type IndexedModelAssignment = {
  referenceIndex: number;
  matches: IndexedModelMatch[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}

function boundedIndex(value: unknown, upperBound: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < upperBound
    ? value
    : null;
}

function responseText(payload: unknown) {
  const root = asRecord(payload);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];

  return parts
    .map((part) => asRecord(part)?.text)
    .filter((text): text is string => typeof text === "string")
    .join("")
    .trim();
}

/**
 * Parses Gemini's response and always returns one entry for every image.
 * Numeric indexes intentionally keep the model from having to reproduce
 * Convex ids or user-provided variant labels exactly.
 */
export function parseIndexedAssignments(
  payload: unknown,
  referenceCount: number,
  groupCount: number,
): IndexedModelAssignment[] {
  const matchesByReference = Array.from(
    { length: referenceCount },
    () => new Map<number, IndexedModelMatch>(),
  );
  const text = responseText(payload);

  if (text) {
    try {
      const parsed = asRecord(JSON.parse(text));
      const assignments = Array.isArray(parsed?.assignments)
        ? parsed.assignments
        : [];

      for (const rawAssignment of assignments) {
        const assignment = asRecord(rawAssignment);
        const referenceIndex = boundedIndex(
          assignment?.referenceIndex,
          referenceCount,
        );
        if (referenceIndex === null || !Array.isArray(assignment?.matches)) {
          continue;
        }

        for (const rawMatch of assignment.matches) {
          const match = asRecord(rawMatch);
          const groupIndex = boundedIndex(match?.groupIndex, groupCount);
          if (
            groupIndex === null ||
            typeof match?.confidence !== "number" ||
            !Number.isFinite(match.confidence)
          ) {
            continue;
          }

          const box2d =
            Array.isArray(match.box2d) &&
            match.box2d.length === 4 &&
            match.box2d.every(
              (coordinate) =>
                typeof coordinate === "number" && Number.isFinite(coordinate),
            )
              ? match.box2d
              : undefined;
          const normalizedMatch: IndexedModelMatch = {
            groupIndex,
            confidence: Math.max(0, Math.min(1, match.confidence)),
            ...(box2d ? { box2d } : {}),
          };
          const previous = matchesByReference[referenceIndex].get(groupIndex);

          if (!previous || normalizedMatch.confidence > previous.confidence) {
            matchesByReference[referenceIndex].set(groupIndex, normalizedMatch);
          }
        }
      }
    } catch {
      // The complete fallback below keeps every image available for review.
    }
  }

  return matchesByReference.map((matches, referenceIndex) => ({
    referenceIndex,
    matches: [...matches.values()],
  }));
}
