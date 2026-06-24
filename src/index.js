import { initDatabase } from './database/db.js';
import { createBot, sendToChannel } from './bot/client.js';
import { createWebhookServer } from './webhooks/tradingview.js';
import { startOptionsFlowMonitor } from './monitors/optionsFlow.js';
import { startIvMonitor } from './monitors/ivMonitor.js';
import { startEconomicCalendar } from './monitors/economicCalendar.js';
import { startSentimentPolls } from './monitors/sentimentPolls.js';

async function main() {
  console.log('[amanbot] Starting...');

  await initDatabase();

  const { client } = await createBot();
  const send = (ch, payload) => sendToChannel(client, ch, payload);

  await createWebhookServer(client, send);

  startOptionsFlowMonitor(client, send);
  startIvMonitor(client, send);
  startEconomicCalendar(client, send);
  startSentimentPolls(client, send);

  console.log('[amanbot] All modules loaded');
}

main().catch((err) => {
  console.error('[amanbot] Fatal error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[amanbot] Unhandled rejection:', err);
});
