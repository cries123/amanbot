import { Events, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { detectImpersonation, formatImpersonationReason } from '../utils/impersonation.js';

const BAN_REASON = 'Impersonation — automatic ban';
const recentlyHandled = new Set();

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

  console.log('[impersonation] Guard active — watching for impersonator name/@ combos');
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
  if (recentlyHandled.has(dedupKey)) return;
  recentlyHandled.add(dedupKey);
  setTimeout(() => recentlyHandled.delete(dedupKey), 60_000);

  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
    console.error('[impersonation] Bot lacks Ban Members permission');
    return;
  }

  if (member.roles.highest.position >= me.roles.highest.position) {
    console.warn(`[impersonation] Cannot ban ${member.user.tag} — role hierarchy`);
    return;
  }

  const reason = formatImpersonationReason(rule);
  console.log(`[impersonation] Banning ${member.user.tag} (${member.id}) — ${reason}`);

  try {
    await member.send({
      content: `You were removed from **${member.guild.name}** for impersonation (${rule.label} identity).`,
    }).catch(() => {});

    await member.ban({
      reason: `${BAN_REASON} | ${reason}`,
      deleteMessageSeconds: 60 * 60 * 24,
    });

    await notifyMods(member, rule, reason);
  } catch (err) {
    console.error(`[impersonation] Failed to ban ${member.user.tag}:`, err.message);
  }
}

async function notifyMods(member, rule, reason) {
  const channelId = config.channels.modLog ?? config.channels.smcAlerts;
  if (!channelId) return;

  const channel = await member.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle('🚫 Impersonator Banned')
    .setColor(0xe74c3c)
    .addFields(
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
      { name: 'Matched', value: `${rule.label} (@${rule.username})`, inline: true },
      { name: 'Display Name', value: member.displayName, inline: true },
      { name: 'Reason', value: reason, inline: false },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}
