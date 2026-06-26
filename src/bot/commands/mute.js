import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { parseDuration, formatDuration } from '../../utils/duration.js';
import {
  assertModerator,
  assertCanActOn,
  assertBotCanAct,
  ModerationError,
  Perms,
} from '../../utils/moderation.js';
import { postModLog } from '../../utils/modLog.js';

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Timeout (mute) a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to mute').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('time').setDescription('Mute length: 30m, 2h, 1d, 1w').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the mute'),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ModerateMembers);

    const user = interaction.options.getUser('user', true);
    const timeInput = interaction.options.getString('time', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const member = await interaction.guild.members.fetch(user.id);
    assertCanActOn(interaction, member);
    assertBotCanAct(interaction, member, Perms.ModerateMembers);

    const durationMs = parseDuration(timeInput);
    if (!durationMs) {
      throw new ModerationError('Mute requires a duration (e.g. `30m`, `2h`, `1d`).');
    }

    await member.timeout(durationMs, `${reason} | by ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setTitle('🔇 Member Muted')
      .setColor(0x95a5a6)
      .addFields(
        { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    await postModLog(interaction.client, {
      action: 'mute',
      title: '🔇 Member Muted',
      fields: embed.data.fields,
    });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to mute member.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
