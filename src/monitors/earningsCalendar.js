import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getAllWatchedTickers } from '../services/watchlist.js';
import { getWatchlistEarningsThisWeek, buildEarningsLine } from '../services/earnings.js';
import { getWeekRange } from '../services/finnhub.js';

export function startEarningsCalendar(client, sendToChannel) {
  if (!config.apis.finnhub) {
    console.warn('[earnings] Skipped — FINNHUB_API_KEY not set');
    return;
  }

  const channelId = config.channels.marketAlerts ?? config.channels.economic;
  if (!channelId) {
    console.warn('[earnings] Skipped — CHANNEL_MARKET_ALERTS or CHANNEL_ECONOMIC not set');
    return;
  }

  cron.schedule('30 7 * * 1', async () => {
    try {
      const tickers = await getAllWatchedTickers();
      const entries = await getWatchlistEarningsThisWeek(tickers);
      const { from, to } = getWeekRange();

      const lines = entries.length
        ? entries.map((e) => buildEarningsLine(e))
        : ['No earnings scheduled this week for watched tickers.'];

      const embed = new EmbedBuilder()
        .setTitle('📅 This Week\'s Earnings — Watchlist')
        .setDescription(lines.join('\n').slice(0, 4000))
        .addFields(
          { name: 'Week', value: `${from} → ${to}`, inline: true },
          { name: 'Tickers scanned', value: String(tickers.length), inline: true },
          { name: 'Reports', value: String(entries.length), inline: true },
        )
        .setColor(0x9b59b6)
        .setFooter({ text: 'Finnhub • Watchlist tickers • Not financial advice' })
        .setTimestamp();

      await sendToChannel(client, channelId, { embeds: [embed] });
      console.log(`[earnings] Posted weekly calendar — ${entries.length} reports`);
    } catch (err) {
      console.error('[earnings:weekly]', err.message);
    }
  }, { timezone: config.timezone });

  console.log('[earnings] Weekly watchlist calendar scheduled — Mondays 7:30 AM ET');
}
