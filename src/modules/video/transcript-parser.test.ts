import { describe, expect, it } from "vitest";

import { parseTimestampToSeconds, parseTranscriptText } from "./transcript-parser";

describe("transcript parser", () => {
  it("parses a timestamped cue without an end time", () => {
    expect(parseTranscriptText("[00:00] Welcome")).toEqual([
      { startSecond: 0, endSecond: null, text: "Welcome" },
    ]);
  });

  it("parses a timestamped cue with an end time", () => {
    expect(parseTranscriptText("[01:15 - 01:45] Segment text")).toEqual([
      { startSecond: 75, endSecond: 105, text: "Segment text" },
    ]);
  });

  it("parses hour timestamps", () => {
    expect(parseTimestampToSeconds("01:02:03")).toBe(3723);
  });

  it("requires cue text", () => {
    expect(() => parseTranscriptText("[00:00] ")).toThrow("Transcript line 1 must include cue text");
  });

  it("rejects bad timestamps", () => {
    expect(() => parseTranscriptText("[bad] Welcome")).toThrow("Transcript line 1 has an invalid timestamp");
  });

  it("rejects end times before or equal to the start time", () => {
    expect(() => parseTranscriptText("[01:45 - 01:15] Segment text")).toThrow(
      "Transcript line 1 end time must be after start time",
    );
    expect(() => parseTranscriptText("[01:15 - 01:15] Segment text")).toThrow(
      "Transcript line 1 end time must be after start time",
    );
  });

  it("rejects malformed timestamp ranges", () => {
    expect(() => parseTranscriptText("[00:00 -] Missing end")).toThrow(
      "Transcript line 1 has an invalid timestamp",
    );
    expect(() => parseTranscriptText("[00:00 - 00:10 - 00:20] Too many delimiters")).toThrow(
      "Transcript line 1 has an invalid timestamp",
    );
  });
});
