import { buildWatchlistAlertEmbed } from '../utils/embeds.js';
import { editChannelMessage } from '../bot/client.js';
import { getWatchersForTickerAlert, getUserSettings, signalToAlertType } from './watchlist.js';
import { ensureUserAlertThread } from './alertThreads.js';
import { buildAlertKey, saveUserAlert, getAlertsForKey, updateAlertStatus } from './alertTracker.js';

const DEFAULT_TICKERS = new Set(['SPY', 'SPX', 'QQQ']);

async function sendUserAlert(client, guild, userId, embed) {
  const settings = await getUserSettings(userId);

  if (settings.deliveryMode === 'thread') {
    if (!guild) {
      throw new Error('Guild required for thread delivery');
    }

    let thread;
    if (settings.threadId) {
      thread = await client.channels.fetch(settings.threadId).catch(() => null);
    }

    if (!thread?.isThread()) {
      const user = await client.users.fetch(userId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) throw new Error('Member not in guild');
      thread = await ensureUserAlertThread(client, guild, user);
    }

    return thread.send({ embeds: [embed] });
  }

  const user = await client.users.fetch(userId);
  return user.send({ embeds: [embed] });
}

export async function deliverWatchlistAlerts(client, { ticker, timeframe, signal, channelId, channelSend, guildId }) {
  const alertKey = buildAlertKey(ticker, timeframe, signal);
  const embed = buildWatchlistAlertEmbed({ ticker, signal, timeframe });
  const isUpdate = Boolean(signal.swept || signal.invalidated);
  const existing = await getAlertsForKey(alertKey);

  const guild = guildId
    ? await client.guilds.fetch(guildId).catch(() => null)
    : client.guilds.cache.first() ?? null;

  if (isUpdate && existing.length) {
    await updateAlertStatus(alertKey, signal.invalidated ? 'invalidated' : 'swept');
    for (const row of existing) {
      if (row.user_id === 'channel') continue;
      await editChannelMessage(client, row.dm_channel_id, row.message_id, { embeds: [embed] }).catch(() => {});
    }

    const channelRows = await getAlertsForKey(`${alertKey}:channel`);
    for (const row of channelRows) {
      await editChannelMessage(client, row.dm_channel_id, row.message_id, { embeds: [embed] }).catch(() => {});
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
      const msg = await sendUserAlert(client, guild, userId, embed);
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

  if (channelId && channelSend && DEFAULT_TICKERS.has(ticker)) {
    const msg = await channelSend(channelId, { embeds: [embed] });
    if (msg?.id) {
      await saveUserAlert({
        alertKey: `${alertKey}:channel`,
        userId: 'channel',
        dmChannelId: channelId,
        messageId: msg.id,
        status: 'active',
      });
    }
  }

  return { alertKey, dms: delivered, updated: false };
}
