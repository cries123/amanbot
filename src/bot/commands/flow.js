import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerLive } from '../../services/smcScanner.js';
import { buildSmcAlertEmbed } from '../../utils/embeds.js';

const TICKER_CHOICES = [
  { name: 'SPY', value: 'SPY' },
  { name: 'SPX', value: 'SPX' },
  { name: 'QQQ', value: 'QQQ' },
];

const TIMEFRAME_CHOICES = [
  { name: '5 minutes', value: '5m' },
  { name: '1 hour', value: '1h' },
  { name: '4 hours', value: '4h' },
];

export const data = new SlashCommandBuilder()
  .setName('flow')
  .setDescription('Live EQH/EQL scan on 5m, 1h, or 4h candles')
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker to scan')
      .addChoices(...TICKER_CHOICES),
  )
  .addStringOption((opt) =>
    opt
      .setName('timeframe')
      .setDescription('Chart timeframe')
      .addChoices(...TIMEFRAME_CHOICES),
  );

export async function execute(interaction) {
  const ticker = interaction.options.getString('ticker') ?? 'SPY';
  const timeframe = interaction.options.getString('timeframe') ?? '5m';

  await interaction.deferReply();

  try {
    const result = await scanTickerLive(ticker, { timeframe, structuresOnly: true });
    const { label, candles, signals } = result;

    if (signals.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`EQH/EQL Scan — ${label} (${timeframe})`)
        .setColor(0x95a5a6)
        .setDescription(`No new EQH or EQL setups on the latest closed ${timeframe} candle.`)
        .addFields(
          { name: 'Bars loaded', value: String(candles.length), inline: true },
          { name: 'EQH/EQL tolerance', value: `${config.monitors.eqhEqlTolerancePct}%`, inline: true },
          { name: 'Data source', value: `Yahoo Finance (${timeframe})`, inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embeds = signals.map((signal) => buildSmcAlertEmbed({
      ticker: label,
      signal,
      timeframe,
    }));

    await interaction.editReply({
      content: `**${label}** \`${timeframe}\` — ${signals.length} EQH/EQL setup(s) on the latest closed bar`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({ content: `EQH/EQL scan failed: ${err.message}` });
  }
}
