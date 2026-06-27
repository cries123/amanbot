import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { assertModerator, ModerationError, Perms } from '../../utils/moderation.js';
import { runHealthChecks } from '../../services/healthCheck.js';
import { config } from '../../config.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check bot health — APIs, database, uptime')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  try {
    assertModerator(interaction, Perms.ModerateMembers);
    await interaction.deferReply({ ephemeral: true });

    const checks = await runHealthChecks();
    const failed = checks.filter((c) => !c.ok);

    const modules = [
      'Watchlist scanner',
      config.moderation.scamFilter ? 'Scam filter' : null,
      config.moderation.impersonationGuard ? 'Impersonation guard' : null,
      config.apis.finnhub ? 'IV monitor' : null,
      config.apis.finnhub ? 'Economic calendar' : null,
      config.apis.finnhub ? 'Earnings calendar' : null,
      'Morning briefing',
      'Market session',
      'End-of-day recap',
      'API health monitor',
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(failed.length ? '⚠️ Bot Status — Issues Detected' : '✅ Bot Status — Healthy')
      .setColor(failed.length ? 0xe67e22 : 0x2ecc71)
      .setDescription(checks.map((c) => `${c.ok ? '✅' : '❌'} **${c.name}** — ${c.detail}`).join('\n'))
      .addFields(
        { name: 'Active modules', value: modules.map((m) => `• ${m}`).join('\n').slice(0, 1024), inline: false },
      )
      .setFooter({ text: 'AmanBot admin status' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const message = err instanceof ModerationError ? err.message : 'Failed to run status check.';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
