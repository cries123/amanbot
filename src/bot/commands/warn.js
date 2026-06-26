import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
  assertModerator,
  assertCanActOn,
  assertBotCanAct,
  ModerationError,
  Perms,
} from '../../utils/moderation.js';
import { addWarning } from '../../services/warns.js';
import { postModLog } from '../../utils/modLog.js';
import { config } from '../../config.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a member (3 warns = automatic 24h mute)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to warn').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the warning').setRequired(true),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ModerateMembers);

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const member = await interaction.guild.members.fetch(user.id);
    assertCanActOn(interaction, member);

    const count = await addWarning(interaction.guild.id, user.id, interaction.user.id, reason);
    const threshold = config.moderation.warnThreshold;
    let autoAction = null;

    if (count >= threshold) {
      assertBotCanAct(interaction, member, Perms.ModerateMembers);
      const muteMs = config.moderation.warnAutoMuteHours * 60 * 60 * 1000;
      await member.timeout(muteMs, `Auto-mute — ${count} warnings reached`);
      autoAction = `Auto-muted for ${config.moderation.warnAutoMuteHours}h (${count}/${threshold} warns)`;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Member Warned')
      .setColor(0xf39c12)
      .addFields(
        { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        { name: 'Warnings', value: `${count}/${threshold}`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setTimestamp();

    if (autoAction) {
      embed.addFields({ name: 'Auto Action', value: autoAction, inline: false });
    }

    await interaction.reply({ embeds: [embed] });

    await postModLog(interaction.client, {
      action: 'warn',
      title: '⚠️ Member Warned',
      fields: [
        { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        { name: 'Warnings', value: `${count}/${threshold}`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false },
        ...(autoAction ? [{ name: 'Auto Action', value: autoAction, inline: false }] : []),
      ],
    });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to warn member.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
