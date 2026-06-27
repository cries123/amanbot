export const DEFAULT_TIMEZONE = 'America/New_York';

export function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getTimezoneAbbr(timeZone, unixSeconds = Math.floor(Date.now() / 1000)) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date(unixSeconds * 1000));
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function formatTimeInZone(unixSeconds, timeZone = DEFAULT_TIMEZONE) {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const formatted = new Date(unixSeconds * 1000).toLocaleString('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${formatted} ${getTimezoneAbbr(zone, unixSeconds)}`;
}

export function formatEstTime(unixSeconds) {
  return formatTimeInZone(unixSeconds, DEFAULT_TIMEZONE);
}

/** @deprecated use formatEstTime */
export const formatEtTime = formatEstTime;

export function formatRelativeTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
