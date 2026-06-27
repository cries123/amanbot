import { ChannelType } from 'discord.js';
import { config } from '../config.js';
import { getUserSettings, setDeliveryMode } from './watchlist.js';

export async function ensureUserAlertThread(client, guild, user) {
  const settings = await getUserSettings(user.id);

  if (settings.threadId) {
    const existing = await client.channels.fetch(settings.threadId).catch(() => null);
    if (existing?.isThread() && !existing.archived) {
      await existing.members.add(user.id).catch(() => {});
      return existing;
    }
  }

  const parentId = config.channels.watchlistAlerts;
  if (!parentId) {
    throw new Error('Private threads are not set up yet. Ask an admin to configure CHANNEL_WATCHLIST_ALERTS.');
  }

  const parent = await guild.channels.fetch(parentId);
  if (!parent?.isTextBased()) {
    throw new Error('Watchlist alerts channel is missing or invalid.');
  }

  const safeName = user.username.replace(/[^a-z0-9-_]/gi, '-').slice(0, 40);
  const thread = await parent.threads.create({
    name: `alerts-${safeName}`,
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: 'Personal watchlist alerts',
  });

  await thread.members.add(user.id);
  await setDeliveryMode(user.id, 'thread', thread.id);

  await thread.send({
    content: `${user} — your private alert feed. Watchlist setups will post here instead of DMs.`,
  });

  return thread;
}

export async function activateDmDelivery(userId) {
  await setDeliveryMode(userId, 'dm', null);
}
