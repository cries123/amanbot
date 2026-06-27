import { buildWatchlistAlertEmbed } from '../utils/embeds.js';
import { editChannelMessage, sendToChannel } from '../bot/client.js';
import { getWatchersForTickerAlert, getUserSettings, signalToAlertType } from './watchlist.js';
import { buildAlertKey, saveUserAlert, getAlertsForKey, updateAlertStatus } from './alertTracker.js';
import { config } from '../config.js';

async function sendUserAlert(client, userId, embed) {
  const settings = await getUserSettings(userId);

  if (settings.deliveryMode === 'channel') {
    const channelId = config.channels.watchlistAlerts;
    if (!channelId) {
      throw new Error('CHANNEL_WATCHLIST_ALERTS is not configured');
    }

    return sendToChannel(client, channelId, {
      content: `<@${userId}>`,
      embeds: [embed],
      allowedMentions: { users: [userId] },
    });
  }

  const user = await client.users.fetch(userId);
  return user.send({ embeds: [embed] });
}

export async function deliverWatchlistAlerts(client, { ticker, timeframe, signal, channelId, channelSend, guildId }) {
  const alertKey = buildAlertKey(ticker, timeframe, signal);
  const isUpdate = Boolean(signal.swept || signal.invalidated);
  const existing = await getAlertsForKey(alertKey);

  if (isUpdate && existing.length) {
    await updateAlertStatus(alertKey, signal.invalidated ? 'invalidated' : 'swept');
    for (const row of existing) {
      if (row.user_id === 'channel') continue;
      const settings = await getUserSettings(row.user_id);
      const embed = buildWatchlistAlertEmbed({ ticker, signal, timeframe, timezone: settings.timezone });
      await editChannelMessage(client, row.dm_channel_id, row.message_id, { embeds: [embed] }).catch(() => {});
    }

    const channelRows = await getAlertsForKey(`${alertKey}:channel`);
    const channelEmbed = buildWatchlistAlertEmbed({ ticker, signal, timeframe });
    for (const row of channelRows) {
      await editChannelMessage(client, row.dm_channel_id, row.message_id, { embeds: [channelEmbed] }).catch(() => {});
    }

    return { alertKey, dms: existing.length, updated: true };
  }

  if (isUpdate) return { alertKey, dms: 0, updated: false };

  const isNew = !signal.swept && !signal.invalidated;
  if (!isNew) return { alertKey, dms: 0, updated: false };

  const watchers = await getWatchersForTickerAlert(ticker, signalToAlertType(signal));
  let delivered = 0;

  for (const userId of watchers) {
    try {
      const settings = await getUserSettings(userId);
      const embed = buildWatchlistAlertEmbed({ ticker, signal, timeframe, timezone: settings.timezone });
      const msg = await sendUserAlert(client, userId, embed);
      if (!msg?.id) continue;

      await saveUserAlert({
        alertKey,
        userId,
        dmChannelId: msg.channel.id,
        messageId: msg.id,
        status: 'active',
      });
      delivered++;
    } catch (err) {
      console.warn(`[alerts] Delivery failed for ${userId} (${ticker}):`, err.message);
    }
  }

  return { alertKey, dms: delivered, updated: false };
}
