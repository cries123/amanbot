import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
  assertModerator,
  assertCanActOn,
  ModerationError,
  Perms,
} from '../../utils/moderation.js';
import { clearWarnings, getWarningCount } from '../../services/warns.js';
import { postModLog } from '../../utils/modLog.js';

export const data = new SlashCommandBuilder()
  .setName('clearwarnings')
  .setDescription('Clear all warnings for a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to clear').setRequired(true),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ModerateMembers);

    const user = interaction.options.getUser('user', true);
    const member = await interaction.guild.members.fetch(user.id);
    assertCanActOn(interaction, member);

    const before = await getWarningCount(interaction.guild.id, user.id);
    await clearWarnings(interaction.guild.id, user.id);

    const embed = new EmbedBuilder()
      .setTitle('Warnings Cleared')
      .setColor(0x2ecc71)
      .addFields(
        { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        { name: 'Removed', value: String(before), inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    if (before > 0) {
      await postModLog(interaction.client, {
        action: 'clearwarnings',
        title: 'Warnings Cleared',
        fields: [
          { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
          { name: 'Removed', value: String(before), inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
        ],
      });
    }
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to clear warnings.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
