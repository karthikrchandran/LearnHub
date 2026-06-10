export function parseScorm12Time(value: string): number {
  const match = /^(\d{2,4}):(\d{2}):(\d{2})(?:\.\d{1,2})?$/.exec(value.trim());

  if (!match) {
    throw new Error("Invalid SCORM 1.2 time");
  }

  const [, hoursValue, minutesValue, secondsValue] = match;
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  const seconds = Number(secondsValue);

  if (minutes >= 60 || seconds >= 60) {
    throw new Error("Invalid SCORM 1.2 time");
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export function formatScorm12Time(totalSeconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
