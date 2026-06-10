export type TranscriptSearchCue = {
  lessonId: string;
  lessonTitle: string;
  lessonSortOrder: number;
  startSecond: number;
  endSecond: number | null;
  text: string;
};

export type TranscriptSearchResult = {
  lessonId: string;
  lessonTitle: string;
  startSecond: number;
  endSecond: number | null;
  snippet: string;
};

export function searchTranscriptCues(
  query: string,
  cues: TranscriptSearchCue[],
): TranscriptSearchResult[] {
  const queryWords = normalizeSearchWords(query);

  if (queryWords.length === 0) {
    return [];
  }

  return [...cues]
    .filter((cue) => includesAllWords(cue.text, queryWords))
    .sort((left, right) => left.lessonSortOrder - right.lessonSortOrder || left.startSecond - right.startSecond)
    .map((cue) => ({
      lessonId: cue.lessonId,
      lessonTitle: cue.lessonTitle,
      startSecond: cue.startSecond,
      endSecond: cue.endSecond,
      snippet: cue.text,
    }));
}

function normalizeSearchWords(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function includesAllWords(text: string, words: string[]): boolean {
  const normalizedText = text.toLowerCase();

  return words.every((word) => normalizedText.includes(word));
}
