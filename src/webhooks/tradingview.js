import express from 'express';
import { config } from '../config.js';
import { buildSmcEmbed } from '../utils/embeds.js';

export async function createWebhookServer(client, sendToChannel) {
  if (!config.webhook.enabled) {
    console.log('[webhook] Disabled — set WEBHOOK_ENABLED=true to enable TradingView alerts');
    return null;
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'amanbot-webhook' });
  });

  app.post('/webhook/tradingview', async (req, res) => {
    if (config.webhook.secret) {
      const provided = req.headers['x-webhook-secret'] ?? req.query.secret;
      if (provided !== config.webhook.secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    try {
      const payload = req.body;
      console.log('[webhook] TradingView alert:', JSON.stringify(payload).slice(0, 500));

      const embed = buildSmcEmbed(payload);
      await sendToChannel(client, config.channels.smcAlerts, { embeds: [embed] });

      res.json({ ok: true });
    } catch (err) {
      console.error('[webhook]', err);
      res.status(500).json({ error: 'Failed to process alert' });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(config.webhook.port);

    server.on('listening', () => {
      console.log(`[webhook] Listening on port ${config.webhook.port}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(
          `[webhook] Port ${config.webhook.port} is already in use — skipping TradingView webhook.`,
        );
        console.warn(
          '[webhook] Stop the other process, change WEBHOOK_PORT, or set WEBHOOK_ENABLED=false.',
        );
        resolve(null);
        return;
      }

      console.error('[webhook] Failed to start:', err.message);
      resolve(null);
    });
  });
}
