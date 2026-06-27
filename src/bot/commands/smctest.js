import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerWicks } from '../../services/smcScanner.js';
import { getAllWatchedTickers } from '../../services/watchlist.js';
import { formatYahooError } from '../../services/yahooMarket.js';
import { buildWickLevelEmbed } from '../../utils/embeds.js';

const TIMEFRAME_CHOICES = [
  { name: '5 minutes', value: '5m' },
  { name: '1 hour', value: '1h' },
  { name: '4 hours', value: '4h' },
];

export const data = new SlashCommandBuilder()
  .setName('smctest')
  .setDescription('Admin: find last 3 EQH and 3 EQL wick levels on a chart')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker to scan, or leave blank for all watched tickers'),
  )
  .addStringOption((opt) =>
    opt
      .setName('timeframe')
      .setDescription('Chart timeframe (default: 1h)')
      .addChoices(...TIMEFRAME_CHOICES),
  );

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    return;
  }

  const tickerArg = interaction.options.getString('ticker')?.toUpperCase().trim() || null;
  const timeframe = interaction.options.getString('timeframe') ?? '1h';
  const tickers = tickerArg ? [tickerArg] : await getAllWatchedTickers();

  await interaction.deferReply({ ephemeral: true });

  if (!tickers.length) {
    await interaction.editReply({ content: 'No tickers on any watchlist yet.' });
    return;
  }

  const summary = [];
  const embeds = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    }

    try {
      const result = await scanTickerWicks(ticker, { timeframe });

      summary.push(
        `**${result.label}** \`${timeframe}\` (${result.tradingDate}): ${result.eql.length} EQL + ${result.eqh.length} EQH`,
      );

      for (const level of [...result.eql, ...result.eqh]) {
        embeds.push(buildWickLevelEmbed({
          ticker: result.label,
          level,
          timeframe,
        }));
      }
    } catch (err) {
      summary.push(`**${ticker}** \`${timeframe}\`: failed — ${formatYahooError(err)}`);
    }
  }

  const header = new EmbedBuilder()
    .setTitle(`EQH/EQL Wick Scan — ${timeframe}`)
    .setColor(0x5865f2)
    .setDescription([
      'Last **3 equal low wicks** and **3 equal high wicks** on the chart.',
      '',
      ...summary,
      '',
      `Wick tolerance: **$${config.monitors.eqhEqlTolerance.toFixed(2)}**`,
    ].join('\n'))
    .setTimestamp();

  await interaction.editReply({
    embeds: [header, ...embeds.slice(0, 9)],
    ephemeral: true,
  });
}
