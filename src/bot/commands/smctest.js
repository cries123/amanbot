import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerHistory } from '../../services/smcScanner.js';
import { buildSmcAlertEmbed } from '../../utils/embeds.js';

const TICKER_CHOICES = [
  { name: 'SPY', value: 'SPY' },
  { name: 'SPX', value: 'SPX' },
  { name: 'QQQ', value: 'QQQ' },
  { name: 'All (SPY, SPX, QQQ)', value: 'ALL' },
];

export const data = new SlashCommandBuilder()
  .setName('smctest')
  .setDescription('Admin: replay SMC detection on the last regular trading session')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker to backtest (default: all)')
      .addChoices(...TICKER_CHOICES),
  );

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    return;
  }

  const selection = interaction.options.getString('ticker') ?? 'ALL';
  const tickers = selection === 'ALL' ? config.monitors.smcTickers : [selection];

  await interaction.deferReply({ ephemeral: true });

  const summary = [];
  const embeds = [];

  for (const ticker of tickers) {
    try {
      const result = await scanTickerHistory(ticker);
      summary.push(`**${result.label}** (${result.tradingDate}): ${result.signals.length} setup(s), ${result.candles.length} bars`);

      for (const signal of result.signals.slice(0, 5)) {
        embeds.push(buildSmcAlertEmbed({
          ticker: result.label,
          signal,
          timeframe: '5m',
        }));
      }
    } catch (err) {
      summary.push(`**${ticker}**: failed — ${err.message}`);
    }
  }

  const header = new EmbedBuilder()
    .setTitle('SMC History Test — Last Trading Session')
    .setColor(0x5865f2)
    .setDescription([
      'Replayed FVG + EQH/EQL detection on Yahoo Finance 5m candles.',
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
    payload.content = `Showing first 9 of ${embeds.length} setup embeds. Narrow to one ticker for the full list.`;
  }

  await interaction.editReply(payload);
}
