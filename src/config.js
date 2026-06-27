import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function parseNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  discord: {
    token: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
    guildId: optionalEnv('DISCORD_GUILD_ID'),
  },
  channels: {
    smcAlerts: optionalEnv('CHANNEL_SMC_ALERTS'),
    optionsFlow: optionalEnv('CHANNEL_OPTIONS_FLOW'),
    ivAlerts: optionalEnv('CHANNEL_IV_ALERTS'),
    economic: optionalEnv('CHANNEL_ECONOMIC'),
    modLog: optionalEnv('CHANNEL_MOD_LOG'),
    welcome: optionalEnv('CHANNEL_WELCOME'),
    marketAlerts: optionalEnv('CHANNEL_MARKET_ALERTS'),
    adminHealth: optionalEnv('CHANNEL_ADMIN_HEALTH'),
    watchlistAlerts: optionalEnv('CHANNEL_WATCHLIST_ALERTS'),
    commands: optionalEnv('CHANNEL_COMMANDS'),
  },
  apis: {
    chartImg: optionalEnv('CHART_IMG_API_KEY'),
    polygon: optionalEnv('POLYGON_API_KEY'),
    finnhub: optionalEnv('FINNHUB_API_KEY'),
  },
  webhook: {
    enabled: optionalEnv('WEBHOOK_ENABLED', 'true').toLowerCase() !== 'false',
    port: parseNumber('WEBHOOK_PORT', 3000),
    secret: optionalEnv('WEBHOOK_SECRET'),
  },
  database: {
    url: optionalEnv('DATABASE_URL'),
  },
  tradingview: {
    sessionId: optionalEnv('TRADINGVIEW_SESSION_ID'),
    sessionIdSign: optionalEnv('TRADINGVIEW_SESSION_ID_SIGN'),
  },
  monitors: {
    optionsMinPremium: parseNumber('OPTIONS_MIN_PREMIUM', 25_000),
    optionsMinVoiRatio: parseNumber('OPTIONS_MIN_VOI_RATIO', 3),
    ivWatchlist: optionalEnv('IV_WATCHLIST', 'SPY,QQQ,AAPL,MSFT,NVDA,TSLA,AMD,AMZN,META,GOOGL')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean),
    ivLowThreshold: parseNumber('IV_LOW_THRESHOLD', 10),
    ivHighThreshold: parseNumber('IV_HIGH_THRESHOLD', 90),
    eqhEqlTolerance: parseNumber('EQH_EQL_TOLERANCE', 0.10),
    eqhEqlSessionBand: parseNumber('EQH_EQL_SESSION_BAND', 0.4),
    fvgMinGapPct: parseNumber('FVG_MIN_GAP_PCT', 0.02),
    volumeSpikeRatio: parseNumber('VOLUME_SPIKE_RATIO', 2.5),
    smcTimeframes: optionalEnv('SMC_TIMEFRAMES', '5m,1h,4h')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => ['5m', '1h', '4h'].includes(t)),
  },
  cron: {
    ivScan: optionalEnv('IV_SCAN_CRON', '0 9,12,15 * * 1-5'),
    economicWeekly: optionalEnv('ECONOMIC_WEEKLY_CRON', '0 7 * * 1'),
    economicWarning: optionalEnv('ECONOMIC_WARNING_CRON', '*/5 * * * *'),
    smcScan: optionalEnv('SMC_SCAN_CRON', '1,6,11,16,21,26,31,36,41,46,51,56 9-15 * * 1-5'),
  },
  timezone: 'America/New_York',
  moderation: {
    impersonationGuard: optionalEnv('IMPERSONATION_GUARD_ENABLED', 'true').toLowerCase() !== 'false',
    impersonationAllowlist: optionalEnv('IMPERSONATION_ALLOWLIST', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    scamFilter: optionalEnv('SCAM_FILTER_ENABLED', 'true').toLowerCase() !== 'false',
    raidProtection: optionalEnv('RAID_PROTECTION_ENABLED', 'true').toLowerCase() !== 'false',
    raidJoinThreshold: parseNumber('RAID_JOIN_THRESHOLD', 5),
    raidWindowSeconds: parseNumber('RAID_WINDOW_SECONDS', 60),
    newAccountAlert: optionalEnv('NEW_ACCOUNT_ALERT_ENABLED', 'true').toLowerCase() !== 'false',
    newAccountMaxDays: parseNumber('NEW_ACCOUNT_MAX_DAYS', 7),
    warnThreshold: parseNumber('WARN_THRESHOLD', 3),
    warnAutoMuteHours: parseNumber('WARN_AUTO_MUTE_HOURS', 24),
  },
  watchlist: {
    maxPerUser: parseNumber('WATCHLIST_MAX_PER_USER', 15),
  },
};
