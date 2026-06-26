import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { sendToChannel } from '../bot/client.js';

function tradingChannel() {
  return config.channels.marketAlerts ?? config.channels.smcAlerts;
}

export function startMarketSession(client, sendToChannelFn) {
  const channelId = tradingChannel();
  if (!channelId) {
    console.warn('[market-session] Skipped — no market/SMC alerts channel');
    return;
  }

  const send = sendToChannelFn ?? ((c, ch, p) => sendToChannel(c, ch, p));

  cron.schedule('30 9 * * 1-5', async () => {
    const embed = new EmbedBuilder()
      .setTitle('🔔 Regular Trading Hours Open')
      .setDescription('NYSE regular session is **open** (9:30 AM EST).')
      .setColor(0x2ecc71)
      .setTimestamp();
    await send(client, channelId, { embeds: [embed] });
  }, { timezone: config.timezone });

  cron.schedule('0 15 * * 1-5', async () => {
    const embed = new EmbedBuilder()
      .setTitle('⚡ Power Hour')
      .setDescription('Final hour of regular trading (3:00–4:00 PM EST). Manage risk.')
      .setColor(0xf39c12)
      .setTimestamp();
    await send(client, channelId, { embeds: [embed] });
  }, { timezone: config.timezone });

  cron.schedule('0 16 * * 1-5', async () => {
    const embed = new EmbedBuilder()
      .setTitle('🔕 Regular Trading Hours Closed')
      .setDescription('NYSE regular session is **closed** (4:00 PM EST).')
      .setColor(0x95a5a6)
      .setTimestamp();
    await send(client, channelId, { embeds: [embed] });
  }, { timezone: config.timezone });

  console.log('[market-session] RTH open / power hour / close scheduled');
}
