import cron from 'node-cron';
import { config } from '../config.js';
import {
  getEconomicCalendar,
  filterHighImpactEvents,
  getWeekRange,
} from '../services/finnhub.js';
import { buildEconomicEventEmbed, buildWeeklyEconomicEmbed } from '../utils/embeds.js';
import { query, getPool } from '../database/db.js';

export function startEconomicCalendar(client, sendToChannel) {
  if (!config.apis.finnhub || !config.channels.economic) {
    console.warn('[economic] Skipped — FINNHUB_API_KEY or CHANNEL_ECONOMIC not set');
    return;
  }

  cron.schedule(
    config.cron.economicWeekly,
    async () => {
      try {
        const { from, to } = getWeekRange();
        const events = filterHighImpactEvents(await getEconomicCalendar(from, to));
        const embed = buildWeeklyEconomicEmbed(events);
        await sendToChannel(client, config.channels.economic, { embeds: [embed] });
      } catch (err) {
        console.error('[economic:weekly]', err.message);
      }
    },
    { timezone: config.timezone },
  );

  cron.schedule(
    config.cron.economicWarning,
    async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const events = filterHighImpactEvents(await getEconomicCalendar(today, today));

        for (const event of events) {
          if (!event.time) continue;

          const eventTime = new Date(event.time);
          const now = new Date();
          const diffMin = (eventTime.getTime() - now.getTime()) / 60_000;

          if (diffMin < 25 || diffMin > 35) continue;

          const eventKey = event.eventKey;
          if (getPool()) {
            const existing = await query(
              'SELECT id FROM economic_warnings_sent WHERE event_key = $1',
              [eventKey],
            );
            if (existing.rows.length > 0) continue;

            await query('INSERT INTO economic_warnings_sent (event_key) VALUES ($1)', [eventKey]);
          }

          const embed = buildEconomicEventEmbed(event, { warning: true });
          await sendToChannel(client, config.channels.economic, {
            content: '@here High-impact event approaching — manage risk accordingly.',
            embeds: [embed],
          });
        }
      } catch (err) {
        console.error('[economic:warning]', err.message);
      }
    },
    { timezone: config.timezone },
  );

  console.log('[economic] Calendar monitors scheduled');
}
