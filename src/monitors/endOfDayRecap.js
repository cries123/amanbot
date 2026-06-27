import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getQuote } from '../services/finnhub.js';
import { scanTickerWicks } from '../services/smcScanner.js';

function tradingChannel() {
  return config.channels.marketAlerts ?? config.channels.smcAlerts;
}

function formatChange(q) {
  const change = q.d ?? (q.c != null && q.pc != null ? q.c - q.pc : null);
  const pct = q.dp ?? (change != null && q.pc ? (change / q.pc) * 100 : null);
  if (change == null) return '—';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)} (${sign}${pct?.toFixed(2) ?? '?'}%)`;
}

export function startEndOfDayRecap(client, sendToChannel) {
  const channelId = tradingChannel();
  if (!channelId || !config.apis.finnhub) {
    console.warn('[eod-recap] Skipped — channel or Finnhub not configured');
    return;
  }

  cron.schedule('5 16 * * 1-5', async () => {
    try {
      const lines = [];

      for (const ticker of ['SPY', 'QQQ']) {
        try {
          const q = await getQuote(ticker);
          const close = q.c ?? q.pc;
          lines.push(
            `**${ticker}** close \`$${close?.toFixed(2) ?? '?'}\` — ${formatChange(q)} • H \`$${q.h?.toFixed(2) ?? '?'}\` L \`$${q.l?.toFixed(2) ?? '?'}\``,
          );
        } catch {
          lines.push(`**${ticker}** — quote unavailable`);
        }
      }

      const levelLines = [];
      for (const ticker of ['SPY', 'QQQ', 'SPX']) {
        try {
          const result = await scanTickerWicks(ticker, { timeframe: '1h', live: true, withSweepDetection: true });
          const swept = [...result.eqh, ...result.eql].filter((l) => l.swept).slice(0, 2);
          for (const lvl of swept) {
            levelLines.push(`• **${result.label}** ${lvl.structure} \`$${lvl.level.toFixed(2)}\` swept`);
          }
        } catch {
          // skip
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🔔 End of Day Recap')
        .setDescription('NYSE regular session closed — 4:00 PM ET.')
        .addFields(
          { name: 'Indices', value: lines.join('\n'), inline: false },
          {
            name: 'Levels swept today',
            value: levelLines.length ? levelLines.join('\n').slice(0, 1024) : '• No swept EQH/EQL detected on 1h scan',
            inline: false,
          },
        )
        .setColor(0xd4af37)
        .setFooter({ text: 'Finnhub + Yahoo • Not financial advice' })
        .setTimestamp();

      await sendToChannel(client, channelId, { embeds: [embed] });
      console.log('[eod-recap] Posted end-of-day recap');
    } catch (err) {
      console.error('[eod-recap]', err.message);
    }
  }, { timezone: config.timezone });

  console.log('[eod-recap] Scheduled for 4:05 PM ET weekdays');
}
