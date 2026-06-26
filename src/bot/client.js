import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from '../config.js';
import { loadCommands, handleInteraction } from './handlers/commandHandler.js';
import { startImpersonationGuard } from '../monitors/impersonationGuard.js';

export async function createBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.GuildMember],
  });

  const commands = await loadCommands();

  startImpersonationGuard(client);

  client.once('ready', () => {
    console.log(`[discord] Logged in as ${client.user.tag}`);
  });

  client.on('interactionCreate', (interaction) => handleInteraction(interaction, commands));

  await client.login(config.discord.token);
  return { client, commands };
}

export async function sendToChannel(client, channelId, payload) {
  if (!channelId) {
    console.warn('[discord] Channel ID not configured, skipping message');
    return null;
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    console.warn(`[discord] Channel ${channelId} is not text-based`);
    return null;
  }

  return channel.send(payload);
}

export async function editChannelMessage(client, channelId, messageId, payload) {
  if (!channelId || !messageId) return null;

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    console.warn(`[discord] Channel ${channelId} is not text-based`);
    return null;
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    console.warn(`[discord] Message ${messageId} not found in ${channelId}`);
    return null;
  }

  return message.edit(payload);
}
