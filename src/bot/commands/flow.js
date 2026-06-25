import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerVolumeFlow } from '../../services/finnhub.js';
import { buildVolumeFlowEmbed } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('flow')
  .setDescription('Scan for unusual volume flow via Finnhub (manual trigger)')
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker to scan')
      .setRequired(false)
      .addChoices(
        { name: 'SPY', value: 'SPY' },
        { name: 'SPX (via SPY)', value: 'SPX' },
        { name: 'QQQ', value: 'QQQ' },
      ),
  )
  .addBooleanOption((opt) =>
    opt
      .setName('test_mode')
      .setDescription('Use relaxed filters to verify the connection works'),
  );

export async function execute(interaction) {
  if (!config.apis.finnhub) {
    await interaction.reply({ content: 'FINNHUB_API_KEY is not configured in `.env`.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker') ?? 'SPY';
  const testMode = interaction.options.getBoolean('test_mode') ?? true;

  await interaction.deferReply();

  try {
    const thresholds = {
      minPremium: config.monitors.optionsMinPremium,
      minVoiRatio: config.monitors.optionsMinVoiRatio,
    };

    const { signals, diagnostics, symbol } = await scanTickerVolumeFlow(ticker, thresholds, { testMode });
    const displaySignals = signals.slice(0, 3);

    if (displaySignals.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Volume Flow Test — ${symbol}`)
        .setColor(0x95a5a6)
        .setDescription(
          testMode
            ? 'Finnhub connected, but no unusual volume bars found right now.'
            : 'No bars passed your alert thresholds. Try again with `test_mode: True`.',
        )
        .addFields(
          { name: 'Finnhub status', value: '✅ Connected', inline: true },
          { name: 'Bars scanned', value: String(diagnostics.bars), inline: true },
          { name: 'Bars with volume', value: String(diagnostics.barsWithVolume), inline: true },
          { name: 'Mode', value: testMode ? 'Test (relaxed)' : 'Production filters', inline: true },
          { name: 'Note', value: 'Finnhub tracks **stock volume flow**, not options contracts. SPX scans use SPY as a proxy.', inline: false },
          { name: 'Tip', value: diagnostics.barsWithVolume === 0
            ? 'Market may be closed. Try during market hours (9:30 AM–4 PM ET).'
            : `Production needs dollar volume ≥ $${thresholds.minPremium.toLocaleString()} and vol ratio ≥ ${thresholds.minVoiRatio}x.`,
            inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embeds = displaySignals.map((signal) => buildVolumeFlowEmbed(signal));
    const modeLabel = testMode ? '**Test mode** — relaxed filters' : '**Production filters**';

    await interaction.editReply({
      content: `✅ Volume flow test passed for **${symbol}** (${modeLabel})\nShowing top ${displaySignals.length} signal(s):`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({
      content: `Flow test failed: ${err.message}\nCheck your FINNHUB_API_KEY in .env.`,
    });
  }
}
