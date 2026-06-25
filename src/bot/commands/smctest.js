import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerWicks } from '../../services/smcScanner.js';
import { formatYahooError } from '../../services/yahooMarket.js';
import { buildWickLevelEmbed } from '../../utils/embeds.js';

const TICKER_CHOICES = [
  { name: 'SPY', value: 'SPY' },
  { name: 'SPX', value: 'SPX' },
  { name: 'QQQ', value: 'QQQ' },
  { name: 'All (SPY, SPX, QQQ)', value: 'ALL' },
];

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
      .setDescription('Ticker to scan (default: all)')
      .addChoices(...TICKER_CHOICES),
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

  const selection = interaction.options.getString('ticker') ?? 'ALL';
  const timeframe = interaction.options.getString('timeframe') ?? '1h';
  const tickers = selection === 'ALL' ? config.monitors.smcTickers : [selection];

  await interaction.deferReply({ ephemeral: true });

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
      'Last **3 equal low wicks** and **3 equal high wicks** on the chart (no sweep logic).',
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
