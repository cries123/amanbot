import cron from 'node-cron';
import { config } from '../config.js';
import { scanTickerVolumeFlow } from '../services/finnhub.js';
import { buildVolumeFlowEmbed } from '../utils/embeds.js';

const recentAlerts = new Map();
const DEDUP_MS = 5 * 60 * 1000;

export function startOptionsFlowMonitor(client, sendToChannel) {
  if (!config.apis.finnhub || !config.channels.optionsFlow) {
    console.warn('[volume-flow] Skipped — FINNHUB_API_KEY or CHANNEL_OPTIONS_FLOW not set');
    return;
  }

  cron.schedule(
    config.cron.optionsFlow,
    async () => {
      if (!isMarketHours()) return;

      for (const ticker of config.monitors.optionsTickers) {
        try {
          const { signals } = await scanTickerVolumeFlow(ticker, {
            minPremium: config.monitors.optionsMinPremium,
            minVoiRatio: config.monitors.optionsMinVoiRatio,
          });

          for (const signal of signals.slice(0, 3)) {
            const key = `${signal.underlying}-${signal.barTime}`;
            const last = recentAlerts.get(key);
            if (last && Date.now() - last < DEDUP_MS) continue;
            recentAlerts.set(key, Date.now());

            const embed = buildVolumeFlowEmbed(signal);
            await sendToChannel(client, config.channels.optionsFlow, { embeds: [embed] });
          }
        } catch (err) {
          console.error(`[volume-flow:${ticker}]`, err.message);
        }
      }

      pruneDedupCache();
    },
    { timezone: config.timezone },
  );

  console.log('[volume-flow] Monitor scheduled');
}

function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

function pruneDedupCache() {
  const cutoff = Date.now() - DEDUP_MS;
  for (const [key, ts] of recentAlerts) {
    if (ts < cutoff) recentAlerts.delete(key);
  }
}
