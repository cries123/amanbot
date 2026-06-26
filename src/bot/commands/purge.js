import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { assertModerator, ModerationError, Perms } from '../../utils/moderation.js';
import { postModLog } from '../../utils/modLog.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Bulk delete messages in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((opt) =>
    opt.setName('amount').setDescription('Messages to delete (1–100)').setRequired(true).setMinValue(1).setMaxValue(100),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ManageMessages);

    const amount = interaction.options.getInteger('amount', true);
    await interaction.deferReply({ ephemeral: true });

    const deleted = await interaction.channel.bulkDelete(amount, true);

    await interaction.editReply({ content: `Deleted **${deleted.size}** message(s).` });

    await postModLog(interaction.client, {
      action: 'purge',
      title: '🧹 Channel Purged',
      fields: [
        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
        { name: 'Deleted', value: String(deleted.size), inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
      ],
    });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to purge messages.';
    const payload = { content: message, ephemeral: true };
    if (interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}
