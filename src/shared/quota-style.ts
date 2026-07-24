export type RemainingLevel = 'high' | 'medium' | 'low';

export function remainingLevel(progress: number): RemainingLevel {
  const fraction = Math.max(0, Math.min(1, progress));
  if (fraction >= 0.5)
    return 'high';
  if (fraction >= 0.2)
    return 'medium';
  return 'low';
}
