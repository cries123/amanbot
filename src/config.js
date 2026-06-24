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
    sentiment: optionalEnv('CHANNEL_SENTIMENT'),
  },
  apis: {
    chartImg: optionalEnv('CHART_IMG_API_KEY'),
    polygon: optionalEnv('POLYGON_API_KEY'),
    finnhub: optionalEnv('FINNHUB_API_KEY'),
  },
  webhook: {
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
    optionsTickers: ['SPY', 'SPX'],
  },
  cron: {
    sentimentPoll: optionalEnv('SENTIMENT_POLL_CRON', '0 8 * * 1-5'),
    ivScan: optionalEnv('IV_SCAN_CRON', '0 9,12,15 * * 1-5'),
    economicWeekly: optionalEnv('ECONOMIC_WEEKLY_CRON', '0 7 * * 1'),
    economicWarning: optionalEnv('ECONOMIC_WARNING_CRON', '*/5 * * * *'),
    optionsFlow: optionalEnv('OPTIONS_FLOW_CRON', '*/1 * * * * 1-5'),
  },
  timezone: 'America/New_York',
};
