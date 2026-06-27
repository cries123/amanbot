import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { assertModerator, ModerationError, Perms } from '../../utils/moderation.js';
import { getWarnings } from '../../services/warns.js';
import { config } from '../../config.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View a member\'s warning history')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to look up').setRequired(true),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ModerateMembers);

    const user = interaction.options.getUser('user', true);
    const rows = await getWarnings(interaction.guild.id, user.id);
    const threshold = config.moderation.warnThreshold;

    const embed = new EmbedBuilder()
      .setTitle(`Warnings — ${user.tag}`)
      .setColor(rows.length >= threshold ? 0xe74c3c : 0xf39c12)
      .setDescription(rows.length
        ? rows.map((w, i) => `**${i + 1}.** ${w.reason}\n— <t:${Math.floor(new Date(w.warned_at).getTime() / 1000)}:R> by <@${w.moderator_id}>`).join('\n\n')
        : 'No warnings on record.')
      .addFields({ name: 'Strike count', value: `${rows.length}/${threshold}`, inline: true })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to fetch warnings.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
