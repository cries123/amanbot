import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from '../config.js';
import { loadCommands, handleInteraction } from './handlers/commandHandler.js';
import { setupSentimentHandlers } from './handlers/sentimentHandler.js';

export async function createBot() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });

  const commands = await loadCommands();

  client.once('ready', () => {
    console.log(`[discord] Logged in as ${client.user.tag}`);
  });

  client.on('interactionCreate', (interaction) => handleInteraction(interaction, commands));
  setupSentimentHandlers(client);

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
