export const MAX_PAUSE_SECONDS = 86400;

/** Null cancels the engine timer; zero must never become an indefinite pause. */
export function isBlockingTimer(value) {
  return (
    value === null ||
    (Number.isInteger(value) && value >= 1 && value <= MAX_PAUSE_SECONDS)
  );
}

/** @param {number} seconds */
export function durationLabel(seconds) {
  let remaining = Math.max(0, Math.ceil(seconds));
  const parts = [];
  for (const [size, unit] of [
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]) {
    const count = Math.floor(remaining / Number(size));
    if (count) parts.push(`${count} ${unit}${count === 1 ? '' : 's'}`);
    remaining %= Number(size);
  }
  return parts.join(' ') || '0 seconds';
}

/**
 * @param {string} selection
 * @param {string} amount
 * @param {string} unit
 * @returns {{timer: number | null, label: string} | {error: string}}
 */
export function pauseSelection(selection, amount = '', unit = 'minutes') {
  if (selection === 'indefinite') return { timer: null, label: 'indefinitely' };
  const multiplier = { seconds: 1, minutes: 60, hours: 3600 }[unit];
  const value = selection === 'custom' ? amount : selection;
  const timer =
    Number(value) * (selection === 'custom' ? (multiplier ?? NaN) : 1);
  if (!/^\d+$/.test(value) || !isBlockingTimer(timer))
    return {
      error: 'Enter a whole-number duration from 1 second to 24 hours.',
    };
  return { timer, label: durationLabel(timer) };
}

/** @param {number} timer @param {number} elapsedMs */
export function remainingSeconds(timer, elapsedMs) {
  return Math.max(0, Math.ceil(timer - Math.max(0, elapsedMs) / 1000));
}
