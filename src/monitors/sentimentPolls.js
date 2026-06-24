import cron from 'node-cron';
import { config } from '../config.js';
import { query, getPool } from '../database/db.js';
import {
  buildSentimentPollMessage,
  gradeTodaysPoll,
} from '../bot/handlers/sentimentHandler.js';

export function startSentimentPolls(client, sendToChannel) {
  if (!getPool() || !config.channels.sentiment) {
    console.warn('[sentiment] Skipped — DATABASE_URL or CHANNEL_SENTIMENT not set');
    return;
  }

  cron.schedule(
    config.cron.sentimentPoll,
    async () => {
      try {
        const pollDate = new Date().toISOString().slice(0, 10);
        const existing = await query('SELECT id FROM sentiment_polls WHERE poll_date = $1', [pollDate]);
        if (existing.rows.length > 0) return;

        const message = buildSentimentPollMessage();
        const sent = await sendToChannel(client, config.channels.sentiment, message);

        if (sent) {
          await query(
            'INSERT INTO sentiment_polls (poll_date, message_id) VALUES ($1, $2)',
            [pollDate, sent.id],
          );
          console.log(`[sentiment] Posted poll for ${pollDate}`);
        }
      } catch (err) {
        console.error('[sentiment:poll]', err.message);
      }
    },
    { timezone: config.timezone },
  );

  cron.schedule(
    '5 16 * * 1-5',
    async () => {
      try {
        await gradeTodaysPoll();
      } catch (err) {
        console.error('[sentiment:grade]', err.message);
      }
    },
    { timezone: config.timezone },
  );

  console.log('[sentiment] Polls scheduled');
}
