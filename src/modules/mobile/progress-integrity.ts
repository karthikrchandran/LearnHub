const maximumCheckpointAdvanceSeconds = 30;

export function isMobileProgressAdvanceAllowed(
  currentMaxWatchedSecond: number,
  submittedWatchedSecond: number,
  maximumAdvanceSeconds = maximumCheckpointAdvanceSeconds,
): boolean {
  return submittedWatchedSecond <= currentMaxWatchedSecond + maximumAdvanceSeconds;
}