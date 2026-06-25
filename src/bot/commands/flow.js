import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { getOptionsChainSnapshot, scan0DteFlow, get0DteDiagnostics } from '../../services/polygon.js';
import { buildOptionsFlowEmbed } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('flow')
  .setDescription('Test 0DTE options flow scan (manual trigger)')
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Underlying ticker')
      .setRequired(false)
      .addChoices(
        { name: 'SPY', value: 'SPY' },
        { name: 'SPX', value: 'SPX' },
      ),
  )
  .addBooleanOption((opt) =>
    opt
      .setName('test_mode')
      .setDescription('Use relaxed filters to verify the connection works'),
  );

export async function execute(interaction) {
  if (!config.apis.polygon) {
    await interaction.reply({ content: 'Polygon API key is not configured in `.env`.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker') ?? 'SPY';
  const testMode = interaction.options.getBoolean('test_mode') ?? true;

  await interaction.deferReply();

  try {
    const snapshots = await getOptionsChainSnapshot(ticker);
    const diagnostics = get0DteDiagnostics(snapshots);

    const thresholds = {
      minPremium: config.monitors.optionsMinPremium,
      minVoiRatio: config.monitors.optionsMinVoiRatio,
    };

    const signals = scan0DteFlow(snapshots, thresholds, { testMode });
    const displaySignals = signals.slice(0, 3);

    if (displaySignals.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Flow Test — ${ticker}`)
        .setColor(0x95a5a6)
        .setDescription(
          testMode
            ? 'Polygon connected, but no 0DTE contracts with volume found right now.'
            : 'No contracts passed your alert thresholds. Try again with `test_mode: True`.',
        )
        .addFields(
          { name: 'Polygon status', value: '✅ Connected', inline: true },
          { name: 'Contracts scanned', value: String(diagnostics.totalContracts), inline: true },
          { name: '0DTE today', value: String(diagnostics.zeroDteCount), inline: true },
          { name: '0DTE with volume', value: String(diagnostics.zeroDteWithVolume), inline: true },
          { name: 'Mode', value: testMode ? 'Test (relaxed)' : 'Production filters', inline: true },
          { name: 'Tip', value: diagnostics.zeroDteWithVolume === 0
            ? 'Market may be closed or volume is still zero. Try during market hours (9:30 AM–4 PM ET).'
            : `Raise activity or use test mode. Production needs premium ≥ $${thresholds.minPremium.toLocaleString()} and vol/OI ≥ ${thresholds.minVoiRatio}x.`,
            inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embeds = displaySignals.map((signal) => buildOptionsFlowEmbed(signal));
    const modeLabel = testMode ? '**Test mode** — relaxed filters' : '**Production filters**';

    await interaction.editReply({
      content: `✅ Flow test passed for **${ticker}** (${modeLabel})\nShowing top ${displaySignals.length} 0DTE signal(s):`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({
      content: `Flow test failed: ${err.message}\nCheck your Polygon API key and plan includes options data.`,
    });
  }
}
