const SCAM_PATTERNS = [
  { label: 'Discord invite', regex: /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-z0-9]+/i },
  { label: 'Telegram link', regex: /\bt\.me\/\S+/i },
  { label: 'Fake support', regex: /(?:official\s+)?support\s*(?:team|desk|agent)|recover\s+your\s+(?:wallet|account|funds)/i },
  { label: 'Crypto drainer', regex: /(?:metamask|trust\s*wallet).{0,40}(?:sync|validate|seed)|seed\s*phrase|wallet\s*connect.{0,30}verify/i },
  { label: 'Free nitro / giveaway scam', regex: /free\s+nitro|steam\s+giveaway|airdrop.{0,20}claim/i },
  { label: 'Suspicious shortener', regex: /(?:bit\.ly|tinyurl\.com|rb\.gy|cutt\.ly)\/\S+/i },
];

export function detectScamContent(content) {
  if (!content) return null;
  const normalized = content.toLowerCase();

  for (const pattern of SCAM_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return pattern.label;
    }
  }

  return null;
}
