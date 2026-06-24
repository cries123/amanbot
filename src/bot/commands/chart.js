import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { fetchChartImage } from '../../services/chartimg.js';

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
  .setDescription('Render a TradingView chart snapshot')
  .addStringOption((opt) =>
    opt.setName('ticker').setDescription('Stock ticker (e.g. AAPL, SPY)').setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName('timeframe').setDescription('Chart timeframe').setRequired(true).addChoices(...TIMEFRAMES),
  );

export async function execute(interaction) {
  const ticker = interaction.options.getString('ticker');
  const timeframe = interaction.options.getString('timeframe');

  await interaction.deferReply();

  try {
    const { buffer, symbol, interval } = await fetchChartImage(ticker, timeframe);
    const attachment = new AttachmentBuilder(buffer, { name: `${ticker}-${timeframe}.png` });

    await interaction.editReply({
      content: `📈 **${symbol}** — \`${interval}\``,
      files: [attachment],
    });
  } catch (err) {
    console.error('[chart]', err.message);
    await interaction.editReply({
      content: `Failed to render chart: ${err.message}`,
    });
  }
}
