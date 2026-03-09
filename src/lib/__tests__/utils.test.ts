import { describe, it, expect } from "vitest";
import { wordCount, formatDate, todayISO, truncate } from "../utils";

describe("wordCount", () => {
  it("counts words in plain text", () => {
    expect(wordCount("hello world")).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  it("strips HTML tags", () => {
    expect(wordCount("<p>hello <b>world</b></p>")).toBe(2);
  });

  it("handles &nbsp; entities", () => {
    expect(wordCount("one&nbsp;two three")).toBe(3);
  });

  it("handles multiple whitespace", () => {
    expect(wordCount("  hello   world  ")).toBe(2);
  });
});

describe("formatDate", () => {
  it("formats YYYY-MM-DD to localized string", () => {
    const result = formatDate("2026-03-09");
    expect(result).toContain("2026");
    expect(result).toContain("9");
  });

  it("returns input for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("todayISO", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = todayISO();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches current date", () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayISO()).toBe(expected);
  });
});

describe("truncate", () => {
  it("returns text unchanged when shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis when longer", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});
