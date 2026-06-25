import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerLive } from '../../services/smcScanner.js';
import { buildSmcAlertEmbed } from '../../utils/embeds.js';

const TICKER_CHOICES = [
  { name: 'SPY', value: 'SPY' },
  { name: 'SPX', value: 'SPX' },
  { name: 'QQQ', value: 'QQQ' },
];

export const data = new SlashCommandBuilder()
  .setName('flow')
  .setDescription('Live SMC scan — FVG, EQH, and EQL on 5m candles')
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker to scan')
      .addChoices(...TICKER_CHOICES),
  );

export async function execute(interaction) {
  const ticker = interaction.options.getString('ticker') ?? 'SPY';

  await interaction.deferReply();

  try {
    const result = await scanTickerLive(ticker);
    const { label, candles, signals } = result;

    if (signals.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`SMC Scan — ${label}`)
        .setColor(0x95a5a6)
        .setDescription('No new FVG, EQH, or EQL setups on the latest closed 5m candle.')
        .addFields(
          { name: 'Bars loaded', value: String(candles.length), inline: true },
          { name: 'FVG min gap', value: `${config.monitors.fvgMinGapPct}%`, inline: true },
          { name: 'EQH/EQL tolerance', value: `${config.monitors.eqhEqlTolerancePct}%`, inline: true },
          { name: 'Data source', value: 'Yahoo Finance (5m)', inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embeds = signals.map((signal) => buildSmcAlertEmbed({
      ticker: label,
      signal,
      timeframe: '5m',
    }));

    await interaction.editReply({
      content: `**${label}** — ${signals.length} setup(s) on the latest closed 5m bar`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({ content: `SMC scan failed: ${err.message}` });
  }
}
