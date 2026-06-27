import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  assertModerator,
  assertCanActOn,
  assertBotCanAct,
  ModerationError,
  Perms,
} from './moderation.js';
import { postModLog } from './modLog.js';
import { config } from '../config.js';

export function buildModActionRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`modact:ban:${userId}`)
      .setLabel('Ban')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`modact:kick:${userId}`)
      .setLabel('Kick')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`modact:mute:${userId}`)
      .setLabel('Mute 24h')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function handleModActionButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const userId = parts[2];

  if (!userId || !['ban', 'kick', 'mute'].includes(action)) {
    throw new ModerationError('Invalid moderation action.');
  }

  const permMap = {
    ban: Perms.BanMembers,
    kick: Perms.KickMembers,
    mute: Perms.ModerateMembers,
  };

  assertModerator(interaction, permMap[action]);

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    if (action === 'ban') {
      await interaction.guild.members.ban(userId, { reason: `Mod action button — ${interaction.user.tag}` });
      await interaction.reply({ content: `Banned user \`${userId}\` (not in server).`, ephemeral: true });
      return;
    }
    throw new ModerationError('Member not found in this server.');
  }

  assertCanActOn(interaction, member);
  assertBotCanAct(interaction, member, permMap[action]);

  const reason = `Mod action button (${action}) — ${interaction.user.tag}`;

  if (action === 'ban') {
    await member.ban({ reason, deleteMessageSeconds: 86_400 });
    await interaction.reply({ content: `Banned **${member.user.tag}**.`, ephemeral: true });
    await postModLog(interaction.client, {
      action: 'ban',
      title: '🔨 Member Banned (Button)',
      fields: [
        { name: 'User', value: `${member.user.tag} (\`${userId}\`)`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
      ],
    });
    return;
  }

  if (action === 'kick') {
    await member.kick(reason);
    await interaction.reply({ content: `Kicked **${member.user.tag}**.`, ephemeral: true });
    await postModLog(interaction.client, {
      action: 'kick',
      title: '👢 Member Kicked (Button)',
      fields: [
        { name: 'User', value: `${member.user.tag} (\`${userId}\`)`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
      ],
    });
    return;
  }

  const muteMs = config.moderation.warnAutoMuteHours * 60 * 60 * 1000;
  await member.timeout(muteMs, reason);
  await interaction.reply({
    content: `Muted **${member.user.tag}** for ${config.moderation.warnAutoMuteHours}h.`,
    ephemeral: true,
  });
  await postModLog(interaction.client, {
    action: 'mute',
    title: '🔇 Member Muted (Button)',
    fields: [
      { name: 'User', value: `${member.user.tag} (\`${userId}\`)`, inline: true },
      { name: 'Duration', value: `${config.moderation.warnAutoMuteHours}h`, inline: true },
      { name: 'Moderator', value: interaction.user.tag, inline: true },
    ],
  });
}
