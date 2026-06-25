import { SlashCommandBuilder } from 'discord.js';
import { config } from '../../config.js';
import { fetchTickerNews } from '../../services/news.js';
import { buildNewsEmbed } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('Get live market news for a ticker')
  .addStringOption((opt) =>
    opt.setName('ticker').setDescription('Stock ticker (e.g. NVDA, SPY)').setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt.setName('count').setDescription('Number of articles (3–5)').setMinValue(3).setMaxValue(5),
  );

export async function execute(interaction) {
  if (!config.apis.finnhub) {
    await interaction.reply({ content: 'FINNHUB_API_KEY is not configured in `.env`.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker', true);
  const count = interaction.options.getInteger('count') ?? 5;

  await interaction.deferReply();

  try {
    const result = await fetchTickerNews(ticker, count);
    const embed = buildNewsEmbed(result);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[news]', err.message);
    await interaction.editReply({
      content: `Failed to fetch news for **${ticker.toUpperCase()}**: ${err.message}`,
    });
  }
}
