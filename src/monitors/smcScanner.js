import cron from 'node-cron';
import { config } from '../config.js';
import { scanAllTickersLive } from '../services/smcScanner.js';
import { buildSmcAlertEmbed } from '../utils/embeds.js';

const recentAlerts = new Map();
const DEDUP_MS = 5 * 60 * 1000;

export function startSmcScanner(client, sendToChannel) {
  if (!config.channels.smcAlerts) {
    console.warn('[smc-scanner] Skipped — CHANNEL_SMC_ALERTS not set');
    return;
  }

  cron.schedule(
    config.cron.smcScan,
    async () => {
      if (!isMarketHours()) return;

      const results = await scanAllTickersLive();

      for (const result of results) {
        for (const signal of result.signals) {
          const key = `${result.label}-${signal.type}-${signal.barTime}-${signal.zoneLow ?? signal.level}`;
          const last = recentAlerts.get(key);
          if (last && Date.now() - last < DEDUP_MS) continue;
          recentAlerts.set(key, Date.now());

          const embed = buildSmcAlertEmbed({
            ticker: result.label,
            signal,
            timeframe: '5m',
          });

          await sendToChannel(client, config.channels.smcAlerts, { embeds: [embed] });
        }
      }

      pruneDedupCache();
    },
    { timezone: config.timezone },
  );

  console.log('[smc-scanner] Yahoo Finance SMC monitor scheduled');
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
