import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { sendToChannel } from '../bot/client.js';
import { getQuote } from '../services/finnhub.js';
import { getEconomicCalendar, filterHighImpactEvents } from '../services/finnhub.js';
import { scanAllTickersLive } from '../services/smcScanner.js';

function tradingChannel() {
  return config.channels.marketAlerts ?? config.channels.smcAlerts;
}

export function startMorningBriefing(client, sendToChannelFn) {
  const channelId = tradingChannel();
  if (!channelId || !config.apis.finnhub) {
    console.warn('[morning-brief] Skipped — channel or Finnhub not configured');
    return;
  }

  const send = sendToChannelFn ?? ((c, ch, p) => sendToChannel(c, ch, p));

  cron.schedule('25 9 * * 1-5', async () => {
    try {
      await sendPremarketGap(client, send, channelId);
      await sendMorningBriefing(client, send, channelId);
    } catch (err) {
      console.error('[morning-brief]', err.message);
    }
  }, { timezone: config.timezone });

  console.log('[morning-brief] Premarket gap + briefing scheduled for 9:25 AM ET');
}

async function sendPremarketGap(client, send, channelId) {
  const lines = [];

  for (const ticker of ['SPY', 'QQQ']) {
    try {
      const q = await getQuote(ticker);
      const price = q.c ?? q.pc;
      const prev = q.pc;
      if (price == null || prev == null) continue;
      const gap = price - prev;
      const gapPct = (gap / prev) * 100;
      const sign = gap >= 0 ? '+' : '';
      lines.push(`**${ticker}** \`$${price.toFixed(2)}\` — gap ${sign}${gap.toFixed(2)} (${sign}${gapPct.toFixed(2)}%)`);
    } catch {
      lines.push(`**${ticker}** — quote unavailable`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('📊 Premarket Gap — 9:25 AM EST')
    .setDescription(lines.join('\n') || 'No gap data available.')
    .setColor(0x3498db)
    .setFooter({ text: 'Finnhub • Premarket / prior close' })
    .setTimestamp();

  await send(client, channelId, { embeds: [embed] });
}

async function sendMorningBriefing(client, send, channelId) {
  const today = new Date().toISOString().slice(0, 10);
  const events = filterHighImpactEvents(await getEconomicCalendar(today, today));

  const eventLines = events.length
    ? events.slice(0, 6).map((e) => `• **${e.timeEt}** — ${e.event}`)
    : ['• No high-impact US events on the calendar today'];

  const smcLines = [];
  try {
    const results = await scanAllTickersLive(['5m', '1h'], { withSweepDetection: false });
    for (const r of results) {
      const levels = [...r.eql.slice(0, 1), ...r.eqh.slice(0, 1)];
      for (const lvl of levels) {
        smcLines.push(`• **${r.label}** ${r.timeframe} ${lvl.structure} \`$${lvl.zoneLow.toFixed(2)}–$${lvl.zoneHigh.toFixed(2)}\` (${lvl.touches} touches)`);
      }
    }
  } catch {
    smcLines.push('• SMC scan unavailable');
  }

  const embed = new EmbedBuilder()
    .setTitle('☀️ Morning Briefing')
    .setDescription('Macro + key structure levels for today\'s session.')
    .addFields(
      { name: 'Macro Today', value: eventLines.join('\n').slice(0, 1024), inline: false },
      { name: 'Active SMC Levels', value: (smcLines.join('\n') || '• No levels found').slice(0, 1024), inline: false },
    )
    .setColor(0xd4af37)
    .setFooter({ text: 'Yahoo Finance + Finnhub • Not financial advice' })
    .setTimestamp();

  await send(client, channelId, { embeds: [embed] });
}
