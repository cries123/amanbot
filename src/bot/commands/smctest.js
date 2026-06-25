import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerHistory } from '../../services/smcScanner.js';
import { formatYahooError } from '../../services/yahooMarket.js';
import { buildSmcAlertEmbed } from '../../utils/embeds.js';
import { rankStructureSignals } from '../../utils/smcStructure.js';

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

function pickDisplaySignals(signals) {
  const eql = rankStructureSignals(signals.filter((s) => s.structure === 'EQL'), 'EQL');
  const eqh = rankStructureSignals(signals.filter((s) => s.structure === 'EQH'), 'EQH');
  return [...eql.slice(0, 4), ...eqh.slice(0, 4)];
}

export const data = new SlashCommandBuilder()
  .setName('smctest')
  .setDescription('Admin: replay EQH/EQL detection on historical candles')
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
      const result = await scanTickerHistory(ticker, { timeframe, structuresOnly: true });
      const displaySignals = pickDisplaySignals(result.signals);

      summary.push(
        `**${result.label}** \`${timeframe}\` (${result.tradingDate}): ${result.signals.length} level(s), showing ${displaySignals.length} key setup(s), ${result.sessionBars} session bars`,
      );

      for (const signal of displaySignals) {
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
    .setTitle(`EQH/EQL History Test — ${timeframe}`)
    .setColor(0x5865f2)
    .setDescription([
      'Previous regular session (9:30 AM – 4:00 PM ET). Shows lowest EQL / highest EQH first, including session-low clusters.',
      '',
      ...summary,
      '',
      `Pivot tolerance: **$${config.monitors.eqhEqlTolerance.toFixed(2)}** | Session extreme band: **$${config.monitors.eqhEqlSessionBand.toFixed(2)}**`,
    ].join('\n'))
    .setTimestamp();

  const payload = {
    embeds: [header, ...embeds.slice(0, 9)],
    ephemeral: true,
  };

  if (embeds.length > 9) {
    payload.content = `Showing top ${Math.min(9, embeds.length)} setup(s). Narrow to one ticker for more detail.`;
  }

  await interaction.editReply(payload);
}
