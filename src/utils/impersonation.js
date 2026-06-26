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
    member.user.username,
  ];
  return [...new Set(names.filter(Boolean).map((n) => n.toLowerCase()))];
}

/**
 * Returns the matched rule if the member looks like an impersonator, else null.
 * Matches when @ username equals the rule AND any display name contains the keyword.
 */
export function detectImpersonation(member) {
  const username = member.user.username.toLowerCase();
  const names = collectMemberNames(member);

  for (const rule of IMPERSONATION_RULES) {
    if (username !== rule.username.toLowerCase()) continue;
    if (names.some((n) => n.includes(rule.nameMatch.toLowerCase()))) {
      return rule;
    }
  }

  return null;
}

export function formatImpersonationReason(rule) {
  return `Impersonation — matched ${rule.label} profile (@${rule.username})`;
}
