import { initDatabase } from './database/db.js';
import { createBot, sendToChannel } from './bot/client.js';
import { createWebhookServer } from './webhooks/tradingview.js';
import { startSmcScanner } from './monitors/smcScanner.js';
import { startIvMonitor } from './monitors/ivMonitor.js';
import { startEconomicCalendar } from './monitors/economicCalendar.js';
import { startMarketSession } from './monitors/marketSession.js';
import { startMorningBriefing } from './monitors/morningBriefing.js';
import { startAdminHeartbeat } from './monitors/adminHeartbeat.js';

async function main() {
  console.log('[amanbot] Starting...');

  await initDatabase();

  const { client } = await createBot();
  const send = (ch, payload) => sendToChannel(client, ch, payload);

  await createWebhookServer(client, send);

  startSmcScanner(client, send);
  startIvMonitor(client, send);
  startEconomicCalendar(client, send);
  startMarketSession(client, send);
  startMorningBriefing(client, send);
  startAdminHeartbeat(client, send);

  console.log('[amanbot] All modules loaded');
}

main().catch((err) => {
  console.error('[amanbot] Fatal error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[amanbot] Unhandled rejection:', err);
});
