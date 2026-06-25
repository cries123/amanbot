import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { fetchChartImage } from '../../services/finnhub.js';
import { config } from '../../config.js';

const TIMEFRAMES = [
  { name: '1 minute', value: '1m' },
  { name: '5 minutes', value: '5m' },
  { name: '15 minutes', value: '15m' },
  { name: '1 hour', value: '1h' },
  { name: '4 hours', value: '4h' },
  { name: '1 day', value: '1D' },
];

export const data = new SlashCommandBuilder()
  .setName('chart')
  .setDescription('Render a candlestick chart from Finnhub market data')
  .addStringOption((opt) =>
    opt.setName('ticker').setDescription('Stock ticker (e.g. AAPL, SPY)').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('timeframe').setDescription('Chart timeframe').setRequired(true).addChoices(...TIMEFRAMES),
  );

export async function execute(interaction) {
  if (!config.apis.finnhub) {
    await interaction.reply({ content: 'FINNHUB_API_KEY is not configured in `.env`.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker');
  const timeframe = interaction.options.getString('timeframe');

  await interaction.deferReply();

  try {
    const { buffer, symbol, interval, source } = await fetchChartImage(ticker, timeframe);
    const attachment = new AttachmentBuilder(buffer, { name: `${ticker}-${timeframe}.png` });

    await interaction.editReply({
      content: `📈 **${symbol}** — \`${interval}\`\n*${source === 'yahoo' ? 'Yahoo Finance (Finnhub free plan has no candles)' : 'Finnhub'}*`,
      files: [attachment],
    });
  } catch (err) {
    console.error('[chart]', err.message);
    await interaction.editReply({
      content: `Failed to render chart: ${err.message}`,
    });
  }
}
