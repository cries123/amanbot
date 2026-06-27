import cron from 'node-cron';
import { config } from '../config.js';
import { getAllWatchedTickers } from '../services/watchlist.js';
import { scanTickerAlerts } from '../services/tickerScan.js';
import { deliverWatchlistAlerts } from '../services/alertDelivery.js';
import { buildAlertKey, getAlertsForKey } from '../services/alertTracker.js';
import { getTimeframesDueNow } from '../services/smcScanner.js';
import { formatYahooError } from '../services/yahooMarket.js';

export function startWatchlistScanner(client, sendToChannel) {
  const channelId = config.channels.smcAlerts;

  cron.schedule(
    config.cron.smcScan,
    async () => {
      if (!isMarketHours()) return;

      const timeframes = getTimeframesDueNow();
      if (!timeframes.length) return;

      const tickers = await getAllWatchedTickers();

      for (const timeframe of timeframes) {
        for (const ticker of tickers) {
          try {
            const result = await scanTickerAlerts(ticker, timeframe);

            for (const signal of result.signals) {
              const alertKey = buildAlertKey(ticker, timeframe, signal);
              const existing = await getAlertsForKey(alertKey);
              const channelExisting = await getAlertsForKey(`${alertKey}:channel`);

              if (signal.swept || signal.invalidated) {
                if (existing.length || channelExisting.length) {
                  await deliverWatchlistAlerts(client, {
                    ticker,
                    timeframe,
                    signal,
                    channelId,
                    channelSend: sendToChannel,
                    guildId: config.discord.guildId,
                  });
                }
                continue;
              }

              if (existing.length || channelExisting.length) continue;

              const isRecent = signal.formationIndex >= result.scanEnd - 1
                || signal.barIndex === result.scanEnd;
              if (!isRecent) continue;

              const { dms, updated } = await deliverWatchlistAlerts(client, {
                ticker,
                timeframe,
                signal,
                channelId,
                channelSend: sendToChannel,
                guildId: config.discord.guildId,
              });

              if (dms > 0 || !updated) {
                console.log(`[watchlist-scanner] ${ticker} ${timeframe} ${signal.type ?? signal.structure} → ${dms} DM(s)`);
              }
            }
          } catch (err) {
            console.error(`[watchlist-scanner:${ticker}:${timeframe}]`, formatYahooError(err));
          }
        }
      }
    },
    { timezone: config.timezone },
  );

  console.log('[watchlist-scanner] EQH/EQL/FVG/volume → watchers (DM or private thread) + SMC channel');
}

function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}
