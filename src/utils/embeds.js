import { EmbedBuilder } from 'discord.js';
import { formatRelativeTime } from './time.js';

const SMC_COLORS = {
  EQH: 0xe74c3c,
  EQL: 0x2ecc71,
  FVG_CREATE: 0x3498db,
  FVG_FILL: 0x9b59b6,
  DEFAULT: 0xf39c12,
};

const SMC_LABELS = {
  EQH: 'Equal Highs Sweep',
  EQL: 'Equal Lows Sweep',
  FVG_CREATE: 'Fair Value Gap Created',
  FVG_FILL: 'Fair Value Gap Filled',
};

const BULL_COLOR = 0x2ecc71;
const BEAR_COLOR = 0xe74c3c;

export function buildSmcAlertEmbed({ ticker, signal, timeframe = '5m' }) {
  const isBullish = signal.direction === 'bullish';
  const color = isBullish ? BULL_COLOR : BEAR_COLOR;
  const title = `${ticker} - ${signal.setupType} Detected`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp(signal.barTime ? new Date(signal.barTime * 1000) : new Date());

  if (signal.type === 'BULL_FVG' || signal.type === 'BEAR_FVG') {
    embed.addFields(
      { name: 'Gap Zone', value: `\`$${signal.zoneLow.toFixed(2)} – $${signal.zoneHigh.toFixed(2)}\``, inline: false },
      { name: 'Gap Size', value: `\`${signal.gapPct.toFixed(3)}%\``, inline: true },
      { name: 'Close', value: `\`$${signal.price.toFixed(2)}\``, inline: true },
      { name: 'Timeframe', value: `\`${timeframe}\``, inline: true },
    );
  } else {
    embed.addFields(
      { name: 'Structure Level', value: `\`$${signal.level.toFixed(2)}\``, inline: true },
      { name: 'Pivot Zone', value: `\`$${signal.zoneLow.toFixed(2)} – $${signal.zoneHigh.toFixed(2)}\``, inline: true },
      { name: 'Spread', value: `\`$${signal.spread.toFixed(2)}\` (≤ $${signal.tolerance.toFixed(2)})`, inline: true },
      { name: 'Touches', value: String(signal.touches), inline: true },
      { name: 'Status', value: signal.swept ? '**Swept**' : 'Formed', inline: true },
      { name: 'Close', value: `\`$${signal.price.toFixed(2)}\``, inline: true },
      { name: 'Timeframe', value: `\`${timeframe}\``, inline: true },
    );
  }

  embed.setFooter({ text: `Yahoo Finance SMC Scanner • ${timeframe}` });
  return embed;
}

export function buildSmcEmbed(payload) {
  const eventType = normalizeEventType(payload);
  const color = SMC_COLORS[eventType] ?? SMC_COLORS.DEFAULT;
  const title = SMC_LABELS[eventType] ?? payload.event ?? 'Structure Alert';

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setColor(color)
    .setTimestamp(payload.timestamp ? new Date(payload.timestamp) : new Date());

  if (payload.ticker || payload.symbol) {
    embed.addFields({ name: 'Ticker', value: `\`${payload.ticker ?? payload.symbol}\``, inline: true });
  }
  if (payload.timeframe || payload.interval) {
    embed.addFields({ name: 'Timeframe', value: `\`${payload.timeframe ?? payload.interval}\``, inline: true });
  }
  if (payload.price != null) {
    embed.addFields({ name: 'Price', value: `\`$${Number(payload.price).toFixed(2)}\``, inline: true });
  }
  if (payload.direction) {
    embed.addFields({ name: 'Direction', value: payload.direction, inline: true });
  }
  if (payload.zone_low != null && payload.zone_high != null) {
    embed.addFields({
      name: 'Zone',
      value: `\`$${Number(payload.zone_low).toFixed(2)} – $${Number(payload.zone_high).toFixed(2)}\``,
      inline: false,
    });
  }
  if (payload.message || payload.comment) {
    embed.setDescription(String(payload.message ?? payload.comment).slice(0, 4000));
  }

  embed.setFooter({ text: 'TradingView SMC Alert' });
  return embed;
}

function normalizeEventType(payload) {
  const raw = String(payload.event_type ?? payload.event ?? payload.alert ?? '').toUpperCase();
  if (raw.includes('EQH') || raw.includes('EQUAL_HIGH')) return 'EQH';
  if (raw.includes('EQL') || raw.includes('EQUAL_LOW')) return 'EQL';
  if (raw.includes('FVG') && (raw.includes('FILL') || raw.includes('MITIG'))) return 'FVG_FILL';
  if (raw.includes('FVG') || raw.includes('FAIR_VALUE')) return 'FVG_CREATE';
  return raw.replace(/\s+/g, '_');
}

export function buildSmcStructureEmbed(signal) {
  const isEqh = signal.structure === 'EQH';
  const swept = signal.swept;
  const title = swept
    ? (isEqh ? '📈 EQH Sweep' : '📉 EQL Sweep')
    : (isEqh ? '📈 Equal Highs (EQH)' : '📉 Equal Lows (EQL)');

  return new EmbedBuilder()
    .setTitle(`${title} — ${signal.underlying}`)
    .setColor(swept ? (isEqh ? 0xe74c3c : 0x2ecc71) : (isEqh ? 0xe67e22 : 0x3498db))
    .addFields(
      { name: 'Level', value: `\`$${signal.level.toFixed(2)}\``, inline: true },
      { name: 'Zone', value: `\`$${signal.zoneLow.toFixed(2)} – $${signal.zoneHigh.toFixed(2)}\``, inline: true },
      { name: 'Spread', value: `\`$${signal.spread.toFixed(2)}\` (≤ $${signal.tolerance.toFixed(2)})`, inline: true },
      { name: 'Touches', value: String(signal.touches), inline: true },
      { name: 'Timeframe', value: signal.timeframe ?? '5m', inline: true },
      { name: 'Status', value: swept ? '**Swept**' : 'Active', inline: true },
      { name: 'Current Price', value: `\`$${signal.price.toFixed(2)}\``, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: signal.dataSource ?? 'SMC Structure Scan' });
}

export function buildVolumeFlowEmbed(signal) {
  const emoji = signal.direction === 'bullish' ? '🟢' : '🔴';
  return new EmbedBuilder()
    .setTitle(`${emoji} Unusual Volume — ${signal.underlying}`)
    .setColor(signal.direction === 'bullish' ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Price', value: `$${signal.price.toFixed(2)}`, inline: true },
      { name: 'Change', value: `${signal.changePct >= 0 ? '+' : ''}${signal.changePct.toFixed(2)}%`, inline: true },
      { name: 'Direction', value: signal.direction.toUpperCase(), inline: true },
      { name: 'Volume', value: signal.volume.toLocaleString(), inline: true },
      { name: 'Avg Volume', value: signal.avgVolume.toLocaleString(), inline: true },
      { name: 'Vol Ratio', value: `${signal.volRatio.toFixed(1)}x`, inline: true },
      { name: 'Dollar Volume', value: `$${Math.round(signal.dollarVolume).toLocaleString()}`, inline: true },
      { name: 'Bar Time', value: new Date(signal.barTime).toLocaleString('en-US', { timeZone: 'America/New_York' }), inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Finnhub Volume Flow' });
}

export function buildOptionsFlowEmbed(signal) {
  const emoji = signal.optionType === 'call' ? '🟢' : '🔴';
  return new EmbedBuilder()
    .setTitle(`${emoji} 0DTE Options Flow — ${signal.underlying}`)
    .setColor(signal.optionType === 'call' ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Contract', value: `\`${signal.contract}\``, inline: false },
      { name: 'Strike', value: `$${signal.strike}`, inline: true },
      { name: 'Type', value: signal.optionType.toUpperCase(), inline: true },
      { name: 'Expiry', value: signal.expiry, inline: true },
      { name: 'Premium', value: `$${signal.premium.toLocaleString()}`, inline: true },
      { name: 'Volume', value: signal.volume.toLocaleString(), inline: true },
      { name: 'OI', value: signal.openInterest.toLocaleString(), inline: true },
      { name: 'Vol/OI', value: `${signal.voiRatio.toFixed(1)}x`, inline: true },
      { name: 'Price', value: `$${signal.price.toFixed(2)}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Polygon Options Flow' });
}

export function buildIvAlertEmbed({ ticker, ivPercentile, alertType, currentIv }) {
  const isLow = alertType === 'low';
  return new EmbedBuilder()
    .setTitle(isLow ? `📉 IV Extreme Low — ${ticker}` : `📈 IV Extreme High — ${ticker}`)
    .setColor(isLow ? 0x2ecc71 : 0xe74c3c)
    .setDescription(
      isLow
        ? 'IV Percentile is extremely **low** — options are historically cheap. Consider premium-buying strategies.'
        : 'IV Percentile is extremely **high** — options are historically expensive. Consider premium-selling strategies.',
    )
    .addFields(
      { name: 'IV Percentile', value: `${ivPercentile.toFixed(1)}%`, inline: true },
      { name: 'Current IV', value: `${(currentIv * 100).toFixed(1)}%`, inline: true },
      { name: 'Signal', value: isLow ? 'Cheap Premium' : 'Expensive Premium', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Finnhub Volatility Monitor' });
}

export function buildBreakevenEmbed(result) {
  return new EmbedBuilder()
    .setTitle(`📐 ${result.strategyLabel}`)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Breakeven', value: result.breakevens.map((b) => `$${b.toFixed(2)}`).join(' / '), inline: true },
      { name: 'Max Reward', value: `$${result.maxReward.toFixed(2)}`, inline: true },
      { name: 'Max Risk', value: `$${result.maxRisk.toFixed(2)}`, inline: true },
    )
    .addFields({ name: 'Details', value: result.summary, inline: false })
    .setTimestamp();
}

export function buildEconomicEventEmbed(event, { warning = false } = {}) {
  const impactEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
  const embed = new EmbedBuilder()
    .setTitle(warning ? `⏰ Event in 30 Minutes` : `📅 ${event.event}`)
    .setColor(warning ? 0xe67e22 : 0x3498db)
    .addFields(
      { name: 'Event', value: event.event, inline: false },
      { name: 'Time (ET)', value: event.timeEt, inline: true },
      { name: 'Impact', value: `${impactEmoji[event.impact] ?? '⚪'} ${event.impact}`, inline: true },
      { name: 'Country', value: event.country ?? 'US', inline: true },
    );

  if (event.estimate) embed.addFields({ name: 'Estimate', value: event.estimate, inline: true });
  if (event.previous) embed.addFields({ name: 'Previous', value: event.previous, inline: true });

  return embed;
}

export function buildWeeklyEconomicEmbed(events) {
  const embed = new EmbedBuilder()
    .setTitle('📆 Weekly Economic Calendar — High Impact Events')
    .setColor(0x1abc9c)
    .setDescription('Key events to watch this week. Plan risk accordingly.')
    .setTimestamp();

  if (events.length === 0) {
    embed.addFields({ name: 'No major events', value: 'No high-impact US events matched this week.' });
    return embed;
  }

  for (const event of events.slice(0, 15)) {
    embed.addFields({
      name: `${event.timeEt} — ${event.event}`,
      value: `Impact: **${event.impact}** | Est: ${event.estimate ?? 'N/A'} | Prev: ${event.previous ?? 'N/A'}`,
      inline: false,
    });
  }

  return embed;
}

const SOCIAL_PLATFORMS = [
  {
    name: 'Instagram',
    emoji: '📸',
    handle: '@amantradesss',
    url: 'https://www.instagram.com/amantradesss',
  },
  {
    name: 'X',
    emoji: '𝕏',
    handle: '@amantradesss',
    url: 'https://x.com/amantradesss',
  },
  {
    name: 'YouTube',
    emoji: '▶️',
    handle: '@amantradess',
    url: 'https://www.youtube.com/@amantradess',
  },
];

export function buildSocialEmbeds() {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Aman Trades',
      iconURL: 'https://cdn.simpleicons.org/chartline/FFD700',
    })
    .setTitle('Official Socials')
    .setColor(0x0f0f1a)
    .setThumbnail('https://cdn.simpleicons.org/chartline/FFD700')
    .addFields(
      SOCIAL_PLATFORMS.map((platform) => ({
        name: `${platform.emoji} ${platform.name}`,
        value: `[${platform.handle}](${platform.url})`,
        inline: true,
      })),
    )
    .setFooter({ text: 'Tap a link to follow' })
    .setTimestamp();

  return [embed];
}

export function buildNewsEmbed({ symbol, articles, source }) {
  const embed = new EmbedBuilder()
    .setTitle(`📰 Live News — ${symbol}`)
    .setColor(0x2563eb)
    .setDescription(`Most recent headlines affecting **${symbol}** — fetched live.`)
    .setTimestamp();

  for (const article of articles) {
    const headline = article.headline.length > 200
      ? `${article.headline.slice(0, 197)}...`
      : article.headline;

    embed.addFields({
      name: headline,
      value: [
        `**[Read article](${article.url})**`,
        `**${article.source}** • ${formatRelativeTime(article.publishedAt)}`,
        '',
        article.summary,
      ].join('\n').slice(0, 1024),
      inline: false,
    });
  }

  embed.setFooter({ text: `Live via ${source} • Not financial advice` });
  return embed;
}
