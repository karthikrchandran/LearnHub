export function requirePositiveDurationSeconds(seconds: number): number {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error("Video duration seconds must be positive");
  }

  return seconds;
}

export function requireNonNegativeSecond(seconds: number, label: string): number {
  if (!Number.isInteger(seconds)) {
    throw new Error(`${label} must be a whole number`);
  }

  if (seconds < 0) {
    throw new Error(`${label} cannot be negative`);
  }

  return seconds;
}

export function clampVideoSecond(seconds: number, durationSeconds: number): number {
  const duration = requirePositiveDurationSeconds(durationSeconds);

  if (!Number.isInteger(seconds)) {
    throw new Error("Video second must be an integer");
  }

  return Math.min(Math.max(seconds, 0), duration);
}

export function validateChapterRange(input: {
  startSecond: number;
  endSecond: number | null;
  durationSeconds: number;
}): void {
  const durationSeconds = requirePositiveDurationSeconds(input.durationSeconds);
  const startSecond = requireNonNegativeSecond(input.startSecond, "Chapter start time");

  if (startSecond > durationSeconds) {
    throw new Error("Chapter start time cannot exceed lesson duration");
  }

  if (input.endSecond === null) {
    return;
  }

  const endSecond = requireNonNegativeSecond(input.endSecond, "Chapter end time");

  if (endSecond > durationSeconds) {
    throw new Error("Chapter end time cannot exceed lesson duration");
  }

  if (endSecond <= startSecond) {
    throw new Error("Chapter end time must be after start time");
  }
}
