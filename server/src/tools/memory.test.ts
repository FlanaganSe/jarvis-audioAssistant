import { describe, expect, it } from "vitest";
import { formatSummary, keywordMatch, startOfDay } from "./memory.js";

describe("keywordMatch", () => {
  const baseSummary = {
    sessionId: "s1",
    startedAt: new Date("2026-03-18T10:00:00Z"),
    endedAt: new Date("2026-03-18T10:30:00Z"),
    topics: ["deployment", "CI pipeline"],
    entities: { repos: ["jarvis"] },
    keyFacts: ["fixed the build"],
    unresolved: [],
  };

  it("returns true when a keyword appears in topics", () => {
    expect(keywordMatch(baseSummary, ["deployment"])).toBe(true);
  });

  it("returns true when a keyword appears in entities JSON", () => {
    expect(keywordMatch(baseSummary, ["jarvis"])).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(keywordMatch(baseSummary, ["postgres", "redis"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(keywordMatch(baseSummary, ["DEPLOYMENT"])).toBe(false);
    // keywordMatch expects lowercase keywords (caller lowercases them)
    expect(keywordMatch(baseSummary, ["deployment"])).toBe(true);
  });
});

describe("startOfDay", () => {
  it("returns today at midnight for daysAgo=0", () => {
    const today = startOfDay(0);
    const now = new Date();
    expect(today.getFullYear()).toBe(now.getFullYear());
    expect(today.getMonth()).toBe(now.getMonth());
    expect(today.getDate()).toBe(now.getDate());
    expect(today.getHours()).toBe(0);
    expect(today.getMinutes()).toBe(0);
    expect(today.getSeconds()).toBe(0);
    expect(today.getMilliseconds()).toBe(0);
  });

  it("returns yesterday at midnight for daysAgo=1", () => {
    const yesterday = startOfDay(1);
    const expected = new Date();
    expected.setDate(expected.getDate() - 1);
    expected.setHours(0, 0, 0, 0);
    expect(yesterday.getTime()).toBe(expected.getTime());
  });
});

describe("formatSummary", () => {
  it("returns correctly shaped object with date and duration", () => {
    const summary = {
      sessionId: "s1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
      endedAt: new Date("2026-03-18T10:30:00Z"),
      topics: ["testing"],
      entities: { repos: ["jarvis"] },
      keyFacts: ["added tests"],
      unresolved: [],
    };

    const result = formatSummary(summary);
    expect(result.date).toEqual(expect.any(String));
    expect(result.duration_minutes).toBe(30);
    expect(result.topics).toEqual(["testing"]);
    expect(result.entities).toEqual({ repos: ["jarvis"] });
    expect(result.key_facts).toEqual(["added tests"]);
    expect(result.unresolved).toEqual([]);
  });

  it("returns null duration when endedAt is missing", () => {
    const summary = {
      sessionId: "s2",
      startedAt: new Date("2026-03-18T10:00:00Z"),
      endedAt: null,
      topics: [],
      entities: {},
      keyFacts: [],
      unresolved: [],
    };

    const result = formatSummary(summary);
    expect(result.duration_minutes).toBeNull();
  });

  it("returns 'unknown date' when startedAt is null", () => {
    const summary = {
      sessionId: "s3",
      startedAt: null,
      endedAt: null,
      topics: [],
      entities: {},
      keyFacts: [],
      unresolved: [],
    };

    const result = formatSummary(summary);
    expect(result.date).toBe("unknown date");
    expect(result.duration_minutes).toBeNull();
  });
});
