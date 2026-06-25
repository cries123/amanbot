import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { buildSocialEmbeds } from '../../utils/embeds.js';
import { ModerationError } from '../../utils/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('social')
  .setDescription('Post the official Aman Trades social media links')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    return;
  }

  try {
    const embeds = buildSocialEmbeds();
    await interaction.reply({ embeds });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to post social links.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
