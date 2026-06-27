import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { sendToChannel } from '../bot/client.js';
import { runHealthChecks } from '../services/healthCheck.js';

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
