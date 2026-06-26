import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { getQuote } from '../../services/finnhub.js';

const DEFAULT_TICKERS = ['SPY', 'QQQ', 'SPX'];

export const data = new SlashCommandBuilder()
  .setName('quote')
  .setDescription('Quick live quote for a ticker')
  .addStringOption((opt) =>
    opt
      .setName('ticker')
      .setDescription('Ticker symbol (default: SPY)')
      .addChoices(
        { name: 'SPY', value: 'SPY' },
        { name: 'QQQ', value: 'QQQ' },
        { name: 'SPX', value: 'SPX' },
        { name: 'AAPL', value: 'AAPL' },
        { name: 'NVDA', value: 'NVDA' },
        { name: 'TSLA', value: 'TSLA' },
      ),
  );

export async function execute(interaction) {
  if (!config.apis.finnhub) {
    await interaction.reply({ content: 'FINNHUB_API_KEY is not configured.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker') ?? 'SPY';
  await interaction.deferReply();

  try {
    const q = await getQuote(ticker);
    const price = q.c ?? q.pc;
    const change = q.d ?? (q.c != null && q.pc != null ? q.c - q.pc : null);
    const changePct = q.dp ?? (change != null && q.pc ? (change / q.pc) * 100 : null);
    const sign = change >= 0 ? '+' : '';
    const color = change >= 0 ? 0x2ecc71 : 0xe74c3c;

    const embed = new EmbedBuilder()
      .setTitle(`${ticker} — Live Quote`)
      .setColor(color)
      .addFields(
        { name: 'Price', value: `\`$${Number(price).toFixed(2)}\``, inline: true },
        { name: 'Change', value: change != null ? `\`${sign}${change.toFixed(2)} (${sign}${changePct?.toFixed(2)}%)\`` : 'N/A', inline: true },
        { name: 'Day Range', value: `\`$${q.l?.toFixed(2)} – $${q.h?.toFixed(2)}\``, inline: true },
        { name: 'Open', value: q.o != null ? `\`$${q.o.toFixed(2)}\`` : 'N/A', inline: true },
        { name: 'Prev Close', value: q.pc != null ? `\`$${q.pc.toFixed(2)}\`` : 'N/A', inline: true },
      )
      .setFooter({ text: 'Finnhub • Not financial advice' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: `Quote failed: ${err.message}` });
  }
}
