import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerWicks } from '../../services/smcScanner.js';
import { getUserSettings, getUserWatchlist } from '../../services/watchlist.js';
import { buildWickLevelEmbed } from '../../utils/embeds.js';

const TIMEFRAME_CHOICES = [
  { name: '5 minutes', value: '5m' },
  { name: '1 hour', value: '1h' },
  { name: '4 hours', value: '4h' },
];

const FLOW_LOOKBACK_DAYS = {
  '5m': 1,
  '1h': 7,
  '4h': 14,
};

const FLOW_WINDOW_LABEL = {
  '5m': 'today (regular session)',
  '1h': 'past 7 days',
  '4h': 'past 14 days',
};

const MAX_EMBEDS = 10;

export const data = new SlashCommandBuilder()
  .setName('flow')
  .setDescription('Find the last 3 EQH and 3 EQL wick levels on your watchlist')
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Single ticker to scan (default: your full watchlist)'),
  )
  .addStringOption((opt) =>
    opt
      .setName('timeframe')
      .setDescription('Chart timeframe')
      .addChoices(...TIMEFRAME_CHOICES),
  );

export async function execute(interaction) {
  const tickerArg = interaction.options.getString('ticker')?.toUpperCase().trim() || null;
  const timeframe = interaction.options.getString('timeframe') ?? '1h';
  const lookbackDays = FLOW_LOOKBACK_DAYS[timeframe] ?? 1;

  await interaction.deferReply();

  try {
    const watchlist = await getUserWatchlist(interaction.user.id);
    const tickers = tickerArg ? [tickerArg] : watchlist;

    if (!tickers.length) {
      await interaction.editReply({
        content: 'Your watchlist is empty. Use `/watchlist` → **Add** to add tickers first.',
      });
      return;
    }

    const { timezone } = await getUserSettings(interaction.user.id);
    const embeds = [];
    const scanned = [];
    const failed = [];

    for (const ticker of tickers) {
      try {
        const result = await scanTickerWicks(ticker, {
          timeframe,
          live: true,
          withSweepDetection: true,
          scanDays: lookbackDays,
          sessionOnly: lookbackDays <= 1,
          sortMode: 'level',
        });

        scanned.push(result.label);

        for (const level of [...result.eql, ...result.eqh]) {
          if (embeds.length >= MAX_EMBEDS) break;
          embeds.push(buildWickLevelEmbed({ ticker: result.label, level, timeframe, timezone }));
        }
      } catch (err) {
        failed.push(`${ticker}: ${err.message}`);
      }

      if (embeds.length >= MAX_EMBEDS) break;
    }

    if (!embeds.length) {
      const embed = new EmbedBuilder()
        .setTitle(`EQH/EQL Wick Scan — ${timeframe}`)
        .setColor(0x95a5a6)
        .setDescription(
          failed.length
            ? `Scan failed:\n${failed.join('\n')}`
            : `No equal wick levels found within **$${config.monitors.eqhEqlTolerance.toFixed(2)}** for your watchlist.`,
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const tickerLabel = scanned.join(', ');
    const truncated = embeds.length >= MAX_EMBEDS && tickers.length > 1
      ? ' *(showing first 10 levels)*'
      : '';

    await interaction.editReply({
      content: `**${tickerLabel}** \`${timeframe}\` — last **3 EQL** + **3 EQH** wick levels (${FLOW_WINDOW_LABEL[timeframe]}, ≤ $${config.monitors.eqhEqlTolerance.toFixed(2)})${truncated}`,
      embeds,
    });
  } catch (err) {
    console.error('[flow]', err.message);
    await interaction.editReply({ content: `EQH/EQL scan failed: ${err.message}` });
  }
}
