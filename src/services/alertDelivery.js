import { buildWatchlistAlertEmbed } from '../utils/embeds.js';
import { editChannelMessage } from '../bot/client.js';
import { getWatchersForTickerAlert, signalToAlertType } from './watchlist.js';
import { buildAlertKey, saveUserAlert, getAlertsForKey, updateAlertStatus } from './alertTracker.js';

const DEFAULT_TICKERS = new Set(['SPY', 'SPX', 'QQQ']);

export async function deliverWatchlistAlerts(client, { ticker, timeframe, signal, channelId, channelSend }) {
  const alertKey = buildAlertKey(ticker, timeframe, signal);
  const embed = buildWatchlistAlertEmbed({ ticker, signal, timeframe });
  const isUpdate = Boolean(signal.swept || signal.invalidated);
  const existing = await getAlertsForKey(alertKey);

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
  let dms = 0;

  for (const userId of watchers) {
    try {
      const user = await client.users.fetch(userId);
      const dm = await user.send({ embeds: [embed] });
      await saveUserAlert({
        alertKey,
        userId,
        dmChannelId: dm.channel.id,
        messageId: dm.id,
        status: 'active',
      });
      dms++;
    } catch (err) {
      console.warn(`[alerts] DM failed for ${userId} (${ticker}):`, err.message);
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

  return { alertKey, dms, updated: false };
}
