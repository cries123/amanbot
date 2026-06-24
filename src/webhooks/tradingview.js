import express from 'express';
import { config } from '../config.js';
import { buildSmcEmbed } from '../utils/embeds.js';

export function createWebhookServer(client, sendToChannel) {
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
    const server = app.listen(config.webhook.port, () => {
      console.log(`[webhook] Listening on port ${config.webhook.port}`);
      resolve(server);
    });
  });
}
