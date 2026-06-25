import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerSmcFlow } from '../../services/finnhub.js';
import { buildSmcStructureEmbed } from '../../utils/embeds.js';

const TIMEFRAMES = [
  { name: '5 minutes', value: '5m' },
  { name: '15 minutes', value: '15m' },
  { name: '1 hour', value: '1h' },
];

export const data = new SlashCommandBuilder()
  .setName('flow')
  .setDescription('Scan for EQH/EQL levels (swing points within $0.05)')
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
  .addStringOption((opt) =>
    opt.setName('timeframe').setDescription('Chart timeframe').addChoices(...TIMEFRAMES),
  )
  .addBooleanOption((opt) =>
    opt.setName('sweeps_only').setDescription('Only show swept EQH/EQL levels'),
  );

export async function execute(interaction) {
  if (!config.apis.finnhub) {
    await interaction.reply({ content: 'FINNHUB_API_KEY is not configured in `.env`.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker') ?? 'SPY';
  const timeframe = interaction.options.getString('timeframe') ?? '5m';
  const sweepsOnly = interaction.options.getBoolean('sweeps_only') ?? false;

  await interaction.deferReply();

  try {
    const { signals, diagnostics, symbol } = await scanTickerSmcFlow(ticker, {
      timeframe,
      tolerance: config.monitors.eqhEqlTolerance,
      sweepsOnly,
    });

    const displaySignals = signals.slice(0, 5);

    if (displaySignals.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🔍 SMC Scan — ${symbol}`)
        .setColor(0x95a5a6)
        .setDescription(
          sweepsOnly
            ? 'No EQH/EQL sweeps detected right now.'
            : 'No EQH/EQL clusters found where swing points are within $0.05.',
        )
        .addFields(
          { name: 'Finnhub status', value: '✅ Connected', inline: true },
          { name: 'Bars scanned', value: String(diagnostics.bars), inline: true },
          { name: 'Swing highs / lows', value: `${diagnostics.swingHighs} / ${diagnostics.swingLows}`, inline: true },
          { name: 'EQH clusters', value: String(diagnostics.eqhClusters), inline: true },
          { name: 'EQL clusters', value: String(diagnostics.eqlClusters), inline: true },
          { name: 'Tolerance', value: `$${config.monitors.eqhEqlTolerance.toFixed(2)}`, inline: true },
          { name: 'Tip', value: diagnostics.bars < 10
            ? 'Market may be closed or not enough data. Try during market hours.'
            : 'EQH/EQL requires at least 2 swing points within $0.05 of each other.',
            inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embeds = displaySignals.map((signal) => buildSmcStructureEmbed(signal));

    await interaction.editReply({
      content: `✅ **${symbol}** \`${timeframe}\` — found ${displaySignals.length} EQH/EQL level(s) within **$${config.monitors.eqhEqlTolerance.toFixed(2)}**:`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({
      content: `Flow scan failed: ${err.message}\nCheck your FINNHUB_API_KEY in .env.`,
    });
  }
}
