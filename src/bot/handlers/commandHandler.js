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
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('help:')) {
    const { handleHelpButton } = await import('../commands/help.js');
    const payload = handleHelpButton(interaction.customId);
    await interaction.update(payload);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('wl:')) {
    try {
      const { handleWatchlistButton } = await import('../commands/watchlist.js');
      await handleWatchlistButton(interaction);
    } catch (err) {
      console.error('[watchlist:button]', err);
      const reply = { content: err.message ?? 'Something went wrong.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else if (interaction.isRepliable()) {
        await interaction.reply(reply);
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('wl:modal:')) {
    try {
      const { handleWatchlistModal } = await import('../commands/watchlist.js');
      await handleWatchlistModal(interaction);
    } catch (err) {
      console.error('[watchlist:modal]', err);
      await interaction.reply({ content: err.message ?? 'Something went wrong.', ephemeral: true });
    }
  }
}
