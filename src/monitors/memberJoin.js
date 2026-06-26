import { Events } from 'discord.js';
import { config } from '../config.js';
import { postModLog } from '../utils/modLog.js';
import { sendToChannel } from '../bot/client.js';
import { EmbedBuilder } from 'discord.js';
import { detectImpersonation, formatImpersonationReason } from '../utils/impersonation.js';

const recentJoins = [];
let raidAlertedAt = 0;

export function startMemberJoinMonitor(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    try {
      await handleWelcome(client, member);
      await handleNewAccountAlert(client, member);
      await handleRaidAlert(client, member);
    } catch (err) {
      console.error('[member-join]', err.message);
    }
  });

  console.log('[member-join] Welcome, new-account, and raid monitors active');
}

async function handleWelcome(client, member) {
  const channelId = config.channels.welcome;
  if (!channelId) return;

  const embed = new EmbedBuilder()
    .setTitle(`Welcome to ${member.guild.name}`)
    .setDescription([
      `Hey ${member}, glad you're here.`,
      '',
      '**Before you jump in:**',
      '• Read the rules',
      '• Check #smc-alerts for live structure levels',
      '• This is not financial advice — trade your own plan',
      '',
      'Official Aman Trades:',
      '• [Instagram](https://www.instagram.com/amantradesss)',
      '• [X](https://x.com/amantradesss)',
      '• [YouTube](https://www.youtube.com/@amantradess)',
    ].join('\n'))
    .setColor(0xd4af37)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await sendToChannel(client, channelId, {
    content: `${member}`,
    embeds: [embed],
    allowedMentions: { users: [member.id] },
  });
}

async function handleNewAccountAlert(client, member) {
  if (!config.moderation.newAccountAlert) return;

  const ageDays = (Date.now() - member.user.createdTimestamp) / (86_400_000);
  if (ageDays >= config.moderation.newAccountMaxDays) return;

  await postModLog(client, {
    action: 'newaccount',
    title: '🆕 New Account Joined',
    description: `Account is only **${Math.floor(ageDays)} day(s)** old.`,
    fields: [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Joined', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    ],
    thumbnail: member.user.displayAvatarURL(),
  });
}

async function handleRaidAlert(client, member) {
  if (!config.moderation.raidProtection) return;

  const now = Date.now();
  const windowMs = config.moderation.raidWindowSeconds * 1000;
  recentJoins.push(now);
  while (recentJoins.length && recentJoins[0] < now - windowMs) {
    recentJoins.shift();
  }

  if (recentJoins.length < config.moderation.raidJoinThreshold) return;
  if (now - raidAlertedAt < windowMs) return;

  raidAlertedAt = now;

  await postModLog(client, {
    action: 'raid',
    title: '🚨 Possible Raid Detected',
    description: `**${recentJoins.length}** members joined within **${config.moderation.raidWindowSeconds}s**. Review recent joins.`,
    fields: [
      { name: 'Latest join', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
    ],
  });
}
