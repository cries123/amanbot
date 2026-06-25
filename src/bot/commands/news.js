import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { fetchTickerNews } from '../../services/news.js';

function formatRelativeTime(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function buildNewsEmbed({ symbol, articles, source }) {
  const embed = new EmbedBuilder()
    .setTitle(`📰 Live News — ${symbol}`)
    .setColor(0x2563eb)
    .setDescription(`Most recent headlines affecting **${symbol}** — fetched live.`)
    .setTimestamp();

  for (const article of articles) {
    const headline = article.headline.length > 200
      ? `${article.headline.slice(0, 197)}...`
      : article.headline;

    embed.addFields({
      name: headline,
      value: [
        `**[Read article](${article.url})**`,
        `**${article.source}** • ${formatRelativeTime(article.publishedAt)}`,
        '',
        article.summary,
      ].join('\n').slice(0, 1024),
      inline: false,
    });
  }

  embed.setFooter({ text: `Live via ${source} • Not financial advice` });
  return embed;
}

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
