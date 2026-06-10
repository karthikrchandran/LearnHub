import { describe, expect, it } from "vitest";

import { searchTranscriptCues, type TranscriptSearchCue } from "./transcript-search";

const cues: TranscriptSearchCue[] = [
  {
    lessonId: "lesson_2",
    lessonTitle: "Follow Up",
    lessonSortOrder: 1,
    startSecond: 30,
    endSecond: 60,
    text: "Managers follow up after coaching conversations.",
  },
  {
    lessonId: "lesson_1",
    lessonTitle: "Coaching Basics",
    lessonSortOrder: 0,
    startSecond: 45,
    endSecond: 90,
    text: "A coaching conversation includes clear expectations.",
  },
  {
    lessonId: "lesson_1",
    lessonTitle: "Coaching Basics",
    lessonSortOrder: 0,
    startSecond: 10,
    endSecond: 20,
    text: "Welcome to manager coaching.",
  },
];

describe("searchTranscriptCues", () => {
  it("matches cues containing all query words case-insensitively", () => {
    expect(searchTranscriptCues("CLEAR expectations", cues)).toEqual([
      {
        lessonId: "lesson_1",
        lessonTitle: "Coaching Basics",
        startSecond: 45,
        endSecond: 90,
        snippet: "A coaching conversation includes clear expectations.",
      },
    ]);
  });

  it("returns lesson id, lesson title, start second, end second, and snippet", () => {
    expect(searchTranscriptCues("follow", cues)[0]).toEqual({
      lessonId: "lesson_2",
      lessonTitle: "Follow Up",
      startSecond: 30,
      endSecond: 60,
      snippet: "Managers follow up after coaching conversations.",
    });
  });

  it("sorts by lesson sort order then cue start second", () => {
    expect(searchTranscriptCues("coaching", cues).map((result) => result.startSecond)).toEqual([
      10,
      45,
      30,
    ]);
  });

  it("returns an empty result for a blank query", () => {
    expect(searchTranscriptCues("   ", cues)).toEqual([]);
  });
});
