import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerHistory } from '../../services/smcScanner.js';
import { formatYahooError } from '../../services/yahooMarket.js';
import { buildSmcAlertEmbed } from '../../utils/embeds.js';

const TICKER_CHOICES = [
  { name: 'SPY', value: 'SPY' },
  { name: 'SPX', value: 'SPX' },
  { name: 'QQQ', value: 'QQQ' },
  { name: 'All (SPY, SPX, QQQ)', value: 'ALL' },
];

const TIMEFRAME_CHOICES = [
  { name: '5 minutes (FVG + EQH/EQL)', value: '5m' },
  { name: '1 hour (EQH/EQL)', value: '1h' },
  { name: '4 hours (EQH/EQL)', value: '4h' },
];

export const data = new SlashCommandBuilder()
  .setName('smctest')
  .setDescription('Admin: replay SMC detection on historical candles')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker to backtest (default: all)')
      .addChoices(...TICKER_CHOICES),
  )
  .addStringOption((opt) =>
    opt
      .setName('timeframe')
      .setDescription('Chart timeframe (default: 5m)')
      .addChoices(...TIMEFRAME_CHOICES),
  );

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    return;
  }

  const selection = interaction.options.getString('ticker') ?? 'ALL';
  const timeframe = interaction.options.getString('timeframe') ?? '5m';
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
      const result = await scanTickerHistory(ticker, { timeframe });
      const structureSignals = result.signals.filter((s) =>
        ['EQH', 'EQL', 'EQH_SWEEP', 'EQL_SWEEP'].includes(s.type),
      );
      const displaySignals = timeframe === '5m' ? result.signals : structureSignals;

      summary.push(
        `**${result.label}** \`${timeframe}\` (${result.tradingDate}): ${displaySignals.length} setup(s), ${result.candles.length} bars`,
      );

      for (const signal of displaySignals.slice(-5)) {
        embeds.push(buildSmcAlertEmbed({
          ticker: result.label,
          signal,
          timeframe,
        }));
      }
    } catch (err) {
      summary.push(`**${ticker}** \`${timeframe}\`: failed — ${formatYahooError(err)}`);
    }
  }

  const header = new EmbedBuilder()
    .setTitle(`SMC History Test — ${timeframe}`)
    .setColor(0x5865f2)
    .setDescription([
      timeframe === '5m'
        ? 'Replayed FVG + EQH/EQL on Yahoo Finance candles.'
        : 'Replayed EQH/EQL structure detection on higher-timeframe candles.',
      '',
      ...summary,
      '',
      `FVG min gap: **${config.monitors.fvgMinGapPct}%** | EQH/EQL tolerance: **${config.monitors.eqhEqlTolerancePct}%**`,
    ].join('\n'))
    .setTimestamp();

  const payload = {
    embeds: [header, ...embeds.slice(0, 9)],
    ephemeral: true,
  };

  if (embeds.length > 9) {
    payload.content = `Showing last 9 of ${embeds.length} setup embeds. Narrow to one ticker for the full list.`;
  }

  await interaction.editReply(payload);
}
