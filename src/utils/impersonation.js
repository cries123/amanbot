/** Impersonation signatures — display name + @ username combos to auto-ban */
export const IMPERSONATION_RULES = [
  { label: 'Aman', nameMatch: 'aman', username: 'rippym0de' },
  { label: 'Nifty', nameMatch: 'nifty', username: 'nifty3304' },
];

export function collectMemberNames(member) {
  const names = [
    member.displayName,
    member.user.globalName,
    member.nickname,
  ];
  return [...new Set(names.filter(Boolean).map((n) => n.toLowerCase()))];
}

/** Match keyword as its own word — avoids "saman", "laman", "amanda", etc. */
export function containsIdentityName(name, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i');
  return re.test(name);
}

/**
 * Returns the matched rule if the member looks like an impersonator, else null.
 * Matches when @ username equals the rule AND a display name contains the keyword as a whole word.
 */
export function detectImpersonation(member) {
  const username = member.user.username.toLowerCase();
  const names = collectMemberNames(member);

  for (const rule of IMPERSONATION_RULES) {
    if (username !== rule.username.toLowerCase()) continue;
    if (names.some((n) => containsIdentityName(n, rule.nameMatch))) {
      return rule;
    }
  }

  return null;
}

export function formatImpersonationReason(rule) {
  return `Impersonation — matched ${rule.label} profile (@${rule.username})`;
}
