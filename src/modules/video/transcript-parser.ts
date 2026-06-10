export type ParsedTranscriptCue = {
  startSecond: number;
  endSecond: number | null;
  text: string;
};

export function parseTranscriptText(input: string): ParsedTranscriptCue[] {
  return input
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, lineNumber }) => parseTranscriptLine(line, lineNumber));
}

export function parseTimestampToSeconds(timestamp: string): number {
  const normalizedTimestamp = timestamp.trim();

  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalizedTimestamp)) {
    throw new Error("Invalid timestamp");
  }

  const parts = normalizedTimestamp.split(":").map(Number);
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];

  if (minutes >= 60 || seconds >= 60) {
    throw new Error("Invalid timestamp");
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function parseTranscriptLine(line: string, lineNumber: number): ParsedTranscriptCue {
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(line);

  if (!match) {
    throw new Error(`Transcript line ${lineNumber} has an invalid timestamp`);
  }

  const [, timestampRange, rawText] = match;
  const text = rawText.trim();

  if (!text) {
    throw new Error(`Transcript line ${lineNumber} must include cue text`);
  }

  const timestampParts = timestampRange.split(/\s*-\s*/);

  if (
    timestampParts.length > 2 ||
    timestampParts.some((timestampPart) => timestampPart.trim().length === 0)
  ) {
    throw new Error(`Transcript line ${lineNumber} has an invalid timestamp`);
  }

  const [startTimestamp, endTimestamp] = timestampParts;
  const startSecond = parseLineTimestamp(startTimestamp, lineNumber);
  const endSecond = endTimestamp ? parseLineTimestamp(endTimestamp, lineNumber) : null;

  if (endSecond !== null && endSecond <= startSecond) {
    throw new Error(`Transcript line ${lineNumber} end time must be after start time`);
  }

  return { startSecond, endSecond, text };
}

function parseLineTimestamp(timestamp: string, lineNumber: number): number {
  try {
    return parseTimestampToSeconds(timestamp);
  } catch {
    throw new Error(`Transcript line ${lineNumber} has an invalid timestamp`);
  }
}
