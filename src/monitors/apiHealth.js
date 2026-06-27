import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { runHealthChecks } from '../services/healthCheck.js';
import { postModLog } from '../utils/modLog.js';

const lastState = new Map();

export function startApiHealthMonitor(client) {
  const channelId = config.channels.adminHealth ?? config.channels.modLog;
  if (!channelId) {
    console.warn('[api-health] Skipped — CHANNEL_ADMIN_HEALTH or CHANNEL_MOD_LOG not set');
    return;
  }

  cron.schedule('*/10 * * * *', async () => {
    try {
      const checks = await runHealthChecks().then((all) => all.filter((c) => c.name !== 'Discord'));
      const failed = checks.filter((c) => !c.ok);

      for (const check of checks) {
        const wasOk = lastState.get(check.name) !== false;
        const isOk = check.ok;

        if (!isOk && wasOk) {
          await postModLog(client, {
            action: 'api',
            title: `🚨 API Failure — ${check.name}`,
            description: 'A data source just went down. Bot features using this API may fail.',
            fields: [
              { name: 'Service', value: check.name, inline: true },
              { name: 'Detail', value: check.detail, inline: false },
            ],
          });
          console.error(`[api-health] ${check.name} DOWN — ${check.detail}`);
        }

        if (isOk && lastState.get(check.name) === false) {
          await postModLog(client, {
            action: 'default',
            title: `✅ API Recovered — ${check.name}`,
            description: `${check.name} is reachable again.`,
            fields: [{ name: 'Detail', value: check.detail, inline: false }],
          });
          console.log(`[api-health] ${check.name} recovered`);
        }

        lastState.set(check.name, isOk);
      }

      if (failed.length && failed.every((f) => lastState.get(f.name) === false)) {
        // already alerted on individual transitions
      }
    } catch (err) {
      console.error('[api-health]', err.message);
    }
  });

  console.log('[api-health] API failure alerts every 10 minutes');
}
