import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { buildSmcEmbed } from '../utils/embeds.js';
import {
  getStatusPayload,
  getSmcPayload,
  getQuotesPayload,
  getIvPayload,
  getCalendarPayload,
  getNewsPayload,
  getChartBuffer,
} from './dashboardApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../../public');

export async function createWebServer(client, sendToChannel) {
  const shouldStart = config.web.uiEnabled || config.webhook.enabled;
  if (!shouldStart) {
    console.log('[web] Disabled — set WEB_UI_ENABLED=true or WEBHOOK_ENABLED=true');
    return null;
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    res.json(await getStatusPayload());
  });

  app.get('/api/status', async (_req, res) => {
    try {
      res.json(await getStatusPayload());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smc', async (req, res) => {
    try {
      const timeframe = req.query.timeframe ?? '1h';
      res.json(await getSmcPayload(timeframe));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/quotes', async (req, res) => {
    try {
      const tickers = req.query.tickers?.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
      res.json(await getQuotesPayload(tickers));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/iv', async (_req, res) => {
    try {
      res.json(await getIvPayload());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/calendar', async (_req, res) => {
    try {
      res.json(await getCalendarPayload());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/news', async (req, res) => {
    try {
      const ticker = req.query.ticker ?? 'SPY';
      res.json(await getNewsPayload(ticker));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/chart', async (req, res) => {
    try {
      const ticker = req.query.ticker ?? 'SPY';
      const timeframe = req.query.timeframe ?? '5m';
      const { buffer, symbol, interval, source } = await getChartBuffer(ticker, timeframe);
      res.set('Content-Type', 'image/png');
      res.set('X-Chart-Source', source);
      res.set('X-Chart-Symbol', symbol);
      res.set('X-Chart-Interval', interval);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  if (config.webhook.enabled) {
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
  }

  if (config.web.uiEnabled) {
    app.use(express.static(publicDir));

    app.get('/dashboard', (_req, res) => {
      res.sendFile(path.join(publicDir, 'dashboard.html'));
    });

    app.get('/', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(config.webhook.port);

    server.on('listening', () => {
      const routes = [];
      if (config.web.uiEnabled) routes.push('landing', 'dashboard', 'API');
      if (config.webhook.enabled) routes.push('TradingView webhook');
      console.log(`[web] Listening on port ${config.webhook.port} (${routes.join(', ')})`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[web] Port ${config.webhook.port} is already in use — skipping web server.`);
        console.warn('[web] Stop the other process, change WEBHOOK_PORT, or disable WEB_UI_ENABLED / WEBHOOK_ENABLED.');
        resolve(null);
        return;
      }

      console.error('[web] Failed to start:', err.message);
      resolve(null);
    });
  });
}

/** @deprecated use createWebServer */
export const createWebhookServer = createWebServer;
