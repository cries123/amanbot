import cron from 'node-cron';
import { config } from '../config.js';
import { estimateIvPercentile } from '../services/finnhub.js';
import { buildIvAlertEmbed } from '../utils/embeds.js';
import { query, getPool } from '../database/db.js';

const dailyAlerted = new Set();

export function startIvMonitor(client, sendToChannel) {
  if (!config.apis.finnhub || !config.channels.ivAlerts) {
    console.warn('[iv-monitor] Skipped — FINNHUB_API_KEY or CHANNEL_IV_ALERTS not set');
    return;
  }

  cron.schedule(
    config.cron.ivScan,
    async () => {
      for (const ticker of config.monitors.ivWatchlist) {
        try {
          const result = await estimateIvPercentile(ticker);
          if (result?.ivPercentile == null) continue;

          const { ivPercentile, currentIv } = result;
          let alertType = null;

          if (ivPercentile <= config.monitors.ivLowThreshold) alertType = 'low';
          else if (ivPercentile >= config.monitors.ivHighThreshold) alertType = 'high';
          else continue;

          const dedupKey = `${ticker}-${alertType}-${new Date().toISOString().slice(0, 10)}`;
          if (dailyAlerted.has(dedupKey)) continue;
          dailyAlerted.add(dedupKey);

          if (getPool()) {
            await query(
              'INSERT INTO iv_alert_history (ticker, iv_percentile, alert_type) VALUES ($1, $2, $3)',
              [ticker, ivPercentile, alertType],
            );
          }

          const embed = buildIvAlertEmbed({ ticker, ivPercentile, alertType, currentIv });
          await sendToChannel(client, config.channels.ivAlerts, { embeds: [embed] });
        } catch (err) {
          console.error(`[iv-monitor:${ticker}]`, err.message);
        }
      }
    },
    { timezone: config.timezone },
  );

  console.log('[iv-monitor] Scheduled');
}
