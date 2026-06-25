import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerWicks } from '../../services/smcScanner.js';
import { buildWickLevelEmbed } from '../../utils/embeds.js';

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
  .setDescription('Find the last 3 EQH and 3 EQL wick levels on a chart')
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
  const timeframe = interaction.options.getString('timeframe') ?? '1h';

  await interaction.deferReply();

  try {
    const result = await scanTickerWicks(ticker, { timeframe, live: true });
    const embeds = [
      ...result.eql.map((level) => buildWickLevelEmbed({ ticker: result.label, level, timeframe })),
      ...result.eqh.map((level) => buildWickLevelEmbed({ ticker: result.label, level, timeframe })),
    ];

    if (embeds.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`EQH/EQL Wick Scan — ${result.label} (${timeframe})`)
        .setColor(0x95a5a6)
        .setDescription(`No equal wick levels found within **$${config.monitors.eqhEqlTolerance.toFixed(2)}** on the loaded chart.`)
        .addFields(
          { name: 'Bars scanned', value: String(result.sessionBars), inline: true },
          { name: 'Window', value: result.tradingDate, inline: true },
          { name: 'Data', value: `Yahoo Finance (${timeframe})`, inline: false },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await interaction.editReply({
      content: `**${result.label}** \`${timeframe}\` — last **3 EQL** + **3 EQH** wick levels (≤ $${config.monitors.eqhEqlTolerance.toFixed(2)})`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({ content: `EQH/EQL scan failed: ${err.message}` });
  }
}
