import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { assertModerator, ModerationError, Perms } from '../../utils/moderation.js';
import { config } from '../../config.js';

const PAGES = {
  home: {
    title: 'Moderator Panel',
    description: 'Server moderation tools and automatic security. Only visible to mods.',
    color: 0xe74c3c,
    fields: [
      { name: 'Quick reference', value: 'Use the buttons below to browse commands, the warn system, and auto-security features.', inline: false },
      { name: 'Mod log', value: 'Ban, kick, mute, warn, and security alerts post to `CHANNEL_MOD_LOG` when configured.', inline: false },
    ],
  },
  commands: {
    title: 'Member Actions',
    description: 'Slash commands for direct moderation.',
    color: 0xc0392b,
    fields: [
      { name: '/ban', value: 'Ban a member. Optional duration (`1h`, `1d`, `1w`) or permanent.', inline: true },
      { name: '/kick', value: 'Remove a member from the server.', inline: true },
      { name: '/mute', value: 'Timeout a member for a set duration.', inline: true },
      { name: '/purge', value: 'Bulk-delete messages in a channel.', inline: true },
      { name: '/status', value: 'Check bot health on demand (APIs, DB, uptime).', inline: true },
    ],
  },
  strikes: {
    title: 'Warning System',
    description: `Strike tracking with automatic escalation at ${config.moderation.warnThreshold} warns.`,
    color: 0xf39c12,
    fields: [
      { name: '/warn', value: `Warn a member with a reason. At **${config.moderation.warnThreshold} warns** → auto **${config.moderation.warnAutoMuteHours}h** mute.`, inline: false },
      { name: '/warnings', value: 'View a member\'s full warn history and strike count.', inline: true },
      { name: '/clearwarnings', value: 'Reset all warnings for a member.', inline: true },
    ],
  },
  auto: {
    title: 'Auto Security',
    description: 'Background protection — no command needed.',
    color: 0x9b59b6,
    fields: [
      { name: 'Impersonation guard', value: 'Alerts mod log with **Ban / Kick / Mute** buttons when impersonators are detected.', inline: false },
      { name: 'Scam filter', value: 'Auto-deletes scam messages and posts mod log with **Ban / Kick / Mute** buttons.', inline: false },
      { name: 'Raid protection', value: `Flags when **${config.moderation.raidJoinThreshold}+** members join within **${config.moderation.raidWindowSeconds}s**.`, inline: false },
      { name: 'New account alert', value: `Flags accounts younger than **${config.moderation.newAccountMaxDays} days** on join.`, inline: false },
      { name: 'Welcome', value: 'New members get a welcome message in `CHANNEL_WELCOME` when set.', inline: false },
      { name: 'API health', value: 'Alerts mod log immediately when Finnhub or Yahoo goes down (recovers too).', inline: false },
      { name: 'Daily heartbeat', value: '8:00 AM health summary in `CHANNEL_ADMIN_HEALTH`.', inline: false },
    ],
  },
};

function modButtons(active = 'home') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod:commands').setLabel('Commands').setStyle(active === 'commands' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mod:strikes').setLabel('Strikes').setStyle(active === 'strikes' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mod:auto').setLabel('Auto Security').setStyle(active === 'auto' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mod:home').setLabel('Home').setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

export function buildModPayload(page = 'home') {
  const content = PAGES[page] ?? PAGES.home;
  const embed = new EmbedBuilder()
    .setTitle(content.title)
    .setDescription(content.description)
    .setColor(content.color)
    .addFields(content.fields)
    .setFooter({ text: 'Moderator only • Aman Trades' });

  return { embeds: [embed], components: [modButtons(page)] };
}

export const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Interactive moderator guide — commands, strikes, and security')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ModerateMembers);
    const payload = buildModPayload('home');
    await interaction.reply({ ...payload, ephemeral: true });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'You do not have permission to use this command.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}

export async function handleModButton(interaction) {
  assertModerator(interaction, Perms.ModerateMembers);
  const page = interaction.customId.replace('mod:', '');
  const payload = buildModPayload(page);
  await interaction.update(payload);
}
