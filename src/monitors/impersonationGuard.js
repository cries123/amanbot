import { Events, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { detectImpersonation, formatImpersonationReason } from '../utils/impersonation.js';

const recentlyAlerted = new Set();

export function startImpersonationGuard(client) {
  if (!config.moderation.impersonationGuard) {
    console.log('[impersonation] Disabled — set IMPERSONATION_GUARD_ENABLED=true');
    return;
  }

  client.on(Events.GuildMemberAdd, (member) => {
    checkMember(member).catch((err) => console.error('[impersonation:add]', err.message));
  });

  client.on(Events.GuildMemberUpdate, (_oldMember, newMember) => {
    checkMember(newMember).catch((err) => console.error('[impersonation:update]', err.message));
  });

  client.on(Events.UserUpdate, async (_oldUser, newUser) => {
    for (const [, guild] of client.guilds.cache) {
      const member = await guild.members.fetch(newUser.id).catch(() => null);
      if (member) {
        await checkMember(member).catch((err) => console.error('[impersonation:user]', err.message));
      }
    }
  });

  client.once(Events.ClientReady, () => {
    scanExistingMembers(client).catch((err) => console.error('[impersonation:scan]', err.message));
  });

  console.log('[impersonation] Guard active — alerts for impersonator name/@ combos');
}

async function scanExistingMembers(client) {
  const guildId = config.discord.guildId;
  if (!guildId) {
    console.warn('[impersonation] DISCORD_GUILD_ID not set — skipping startup member scan');
    return;
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const members = await guild.members.fetch();
  console.log(`[impersonation] Scanning ${members.size} existing members…`);

  for (const member of members.values()) {
    await checkMember(member);
  }
}

async function checkMember(member) {
  if (!member?.guild || member.user.bot) return;
  if (config.moderation.impersonationAllowlist.includes(member.id)) return;
  if (member.id === member.guild.ownerId) return;
  if (member.id === member.client.user.id) return;

  const rule = detectImpersonation(member);
  if (!rule) return;

  const dedupKey = `${member.guild.id}:${member.id}:${rule.username}`;
  if (recentlyAlerted.has(dedupKey)) return;
  recentlyAlerted.add(dedupKey);
  setTimeout(() => recentlyAlerted.delete(dedupKey), 60 * 60 * 1000);

  const reason = formatImpersonationReason(rule);
  console.log(`[impersonation] Alert — ${member.user.tag} (${member.id}) — ${reason}`);

  await sendAlert(member, rule, reason);
}

async function sendAlert(member, rule, reason) {
  const channelId = config.channels.modLog;
  if (!channelId) {
    console.warn('[impersonation] CHANNEL_MOD_LOG not set — cannot send alert');
    return;
  }

  const channel = await member.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    console.warn(`[impersonation] Mod log channel ${channelId} is not text-based`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Possible Impersonator Detected')
    .setColor(0xe67e22)
    .setDescription('A member matched a known impersonation signature. Review and take action if needed.')
    .addFields(
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
      { name: 'Matched', value: `${rule.label} (@${rule.username})`, inline: true },
      { name: 'Display Name', value: member.displayName, inline: true },
      { name: '@ Username', value: `\`${member.user.username}\``, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Joined Server', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
      { name: 'Details', value: reason, inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error('[impersonation] Failed to send alert:', err.message);
  });
}
