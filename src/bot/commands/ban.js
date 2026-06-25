import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { parseDuration, formatDuration } from '../../utils/duration.js';
import {
  assertModerator,
  assertCanActOn,
  assertBotCanAct,
  ModerationError,
  Perms,
} from '../../utils/moderation.js';

const tempBans = new Map();

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to ban').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('time').setDescription('Ban length: 1h, 1d, 1w (leave empty for permanent)'),
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Reason for the ban'),
  );

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.BanMembers);

    const user = interaction.options.getUser('user', true);
    const timeInput = interaction.options.getString('time');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      assertCanActOn(interaction, member);
      assertBotCanAct(interaction, member, Perms.BanMembers);
    }

    const durationMs = timeInput ? parseDuration(timeInput) : null;

    await interaction.guild.members.ban(user.id, {
      reason: `${reason} | by ${interaction.user.tag}`,
      deleteMessageSeconds: 60 * 60 * 24,
    });

    if (durationMs) {
      scheduleUnban(interaction.guild.id, user.id, durationMs, interaction.client);
    }

    const embed = new EmbedBuilder()
      .setTitle('🔨 Member Banned')
      .setColor(0xe74c3c)
      .addFields(
        { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await handleModError(interaction, err);
  }
}

function scheduleUnban(guildId, userId, durationMs, client) {
  const key = `${guildId}:${userId}`;
  if (tempBans.has(key)) clearTimeout(tempBans.get(key));

  const timeout = setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.members.unban(userId, 'Temporary ban expired');
    } catch {
      // User may already be unbanned or guild unavailable
    }
    tempBans.delete(key);
  }, durationMs);

  tempBans.set(key, timeout);
}

async function handleModError(interaction, err) {
  const message = err instanceof ModerationError ? err.message : 'Failed to execute moderation action.';
  const payload = { content: message, ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}
