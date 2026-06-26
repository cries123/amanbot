import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { sendToChannel } from '../bot/client.js';
import axios from 'axios';

export function startAdminHeartbeat(client, sendToChannelFn) {
  const channelId = config.channels.adminHealth ?? config.channels.modLog;
  if (!channelId) {
    console.warn('[heartbeat] Skipped — CHANNEL_ADMIN_HEALTH or CHANNEL_MOD_LOG not set');
    return;
  }

  const send = sendToChannelFn ?? ((c, ch, p) => sendToChannel(c, ch, p));

  cron.schedule('0 8 * * *', async () => {
    const checks = await runHealthChecks();

    const failed = checks.filter((c) => !c.ok);
    const embed = new EmbedBuilder()
      .setTitle(failed.length ? '⚠️ Bot Health — Issues Detected' : '✅ Bot Health — All Systems OK')
      .setColor(failed.length ? 0xe67e22 : 0x2ecc71)
      .setDescription(checks.map((c) => `${c.ok ? '✅' : '❌'} **${c.name}** — ${c.detail}`).join('\n'))
      .setTimestamp();

    await send(client, channelId, { embeds: [embed] });
  }, { timezone: config.timezone });

  console.log('[heartbeat] Daily health check scheduled for 8:00 AM ET');
}

async function runHealthChecks() {
  const checks = [];

  checks.push({
    name: 'Discord',
    ok: true,
    detail: 'Bot process running',
  });

  if (config.apis.finnhub) {
    try {
      const { status } = await axios.get('https://finnhub.io/api/v1/quote', {
        params: { symbol: 'SPY', token: config.apis.finnhub },
        timeout: 10_000,
        validateStatus: () => true,
      });
      checks.push({
        name: 'Finnhub',
        ok: status === 200,
        detail: status === 200 ? 'API reachable' : `HTTP ${status}`,
      });
    } catch (err) {
      checks.push({ name: 'Finnhub', ok: false, detail: err.message });
    }
  } else {
    checks.push({ name: 'Finnhub', ok: false, detail: 'Not configured' });
  }

  try {
    const { status } = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/SPY', {
      params: { interval: '5m', range: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AmanBot/1.0)' },
      timeout: 10_000,
      validateStatus: () => true,
    });
    checks.push({
      name: 'Yahoo Finance',
      ok: status === 200,
      detail: status === 200 ? 'API reachable' : `HTTP ${status}`,
    });
  } catch (err) {
    checks.push({ name: 'Yahoo Finance', ok: false, detail: err.message });
  }

  checks.push({
    name: 'Database',
    ok: Boolean(config.database.url),
    detail: config.database.url ? 'DATABASE_URL set' : 'Optional — not configured',
  });

  return checks;
}
