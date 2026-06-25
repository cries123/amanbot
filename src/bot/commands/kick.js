import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
  assertModerator,
  assertCanActOn,
  assertBotCanAct,
  ModerationError,
  Perms,
} from '../../utils/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to kick').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the kick'),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.KickMembers);

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const member = await interaction.guild.members.fetch(user.id);
    assertCanActOn(interaction, member);
    assertBotCanAct(interaction, member, Perms.KickMembers);

    await member.kick(`${reason} | by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setTitle('👢 Member Kicked')
      .setColor(0xe67e22)
      .addFields(
        { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to kick member.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
