import { describe, it, expect } from "vitest";
import { fuzzyScore, filterCommands } from "../fuzzyMatch";

describe("fuzzyScore", () => {
  it("returns 100 for exact match", () => {
    expect(fuzzyScore("hello", "hello")).toBe(100);
  });

  it("is case insensitive", () => {
    expect(fuzzyScore("Hello", "hello")).toBe(100);
  });

  it("returns 80 for starts-with", () => {
    expect(fuzzyScore("hel", "hello world")).toBe(80);
  });

  it("returns 60 for contains", () => {
    expect(fuzzyScore("world", "hello world")).toBe(60);
  });

  it("returns 0 for no match", () => {
    expect(fuzzyScore("xyz", "hello")).toBe(0);
  });

  it("returns 1 for empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(1);
  });

  it("caps fuzzy score at 59", () => {
    const score = fuzzyScore("nnt", "new note from template");
    expect(score).toBeLessThanOrEqual(59);
  });

  it("gives bonus for word-boundary matches", () => {
    // "n" matches at start of "new" (boundary bonus), "w" at start of "window" (boundary bonus)
    const boundary = fuzzyScore("nw", "new window");
    expect(boundary).toBeGreaterThan(0);
  });
});

describe("filterCommands", () => {
  const items = [
    { title: "New Note", keywords: ["create", "add"] },
    { title: "Delete Note", keywords: ["remove"] },
    { title: "Search", keywords: ["find", "query"] },
  ];

  it("returns all items for empty query", () => {
    expect(filterCommands(items, "")).toHaveLength(3);
  });

  it("filters by title match", () => {
    const result = filterCommands(items, "note");
    expect(result.length).toBe(2);
  });

  it("filters by keyword match", () => {
    const result = filterCommands(items, "find");
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Search");
  });

  it("respects maxResults", () => {
    const result = filterCommands(items, "", 1);
    expect(result.length).toBe(1);
  });

  it("sorts by score descending", () => {
    const result = filterCommands(items, "new");
    expect(result[0].title).toBe("New Note");
  });
});
