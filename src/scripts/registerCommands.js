import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { loadCommands } from '../bot/handlers/commandHandler.js';

const commands = await loadCommands();
const body = commands.map((cmd) => cmd.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.discord.token);

try {
  if (config.discord.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
    console.log(`Registered ${body.length} guild commands`);
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
    console.log(`Registered ${body.length} global commands`);
  }
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
