import { Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands() {
  const commands = new Collection();
  const files = readdirSync(join(__dirname, '../commands')).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    try {
      const command = await import(`../commands/${file}`);
      if (command.data && command.execute) {
        commands.set(command.data.name, command);
      }
    } catch (err) {
      console.warn(`[commands] Skipped ${file} — ${err.message}`);
      console.warn(`[commands] Delete src/bot/commands/${file} if this command was removed from the repo.`);
    }
  }

  return commands;
}

export async function handleInteraction(interaction, commands) {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[command:${interaction.commandName}]`, err);
    const reply = { content: 'An error occurred while running this command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}
