const UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export function parseDuration(input) {
  if (!input?.trim()) return null;

  const normalized = input.trim().toLowerCase();
  if (normalized === 'perm' || normalized === 'permanent') return null;

  const match = normalized.match(/^(\d+)\s*([smhdw])$/);
  if (!match) {
    throw new Error('Invalid duration. Use formats like `30m`, `2h`, `1d`, or `1w`.');
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (amount <= 0) throw new Error('Duration must be greater than zero.');

  const ms = amount * UNITS[unit];
  if (ms > MAX_TIMEOUT_MS) {
    throw new Error('Maximum duration is 28 days (`4w`).');
  }

  return ms;
}

export function formatDuration(ms) {
  if (!ms) return 'permanent';
  const minutes = Math.round(ms / UNITS.m);
  if (minutes < 60) return `${minutes} minute(s)`;
  const hours = Math.round(ms / UNITS.h);
  if (hours < 48) return `${hours} hour(s)`;
  const days = Math.round(ms / UNITS.d);
  return `${days} day(s)`;
}
