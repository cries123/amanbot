import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { scanTickerWicks } from '../../services/smcScanner.js';

const TICKERS = ['SPY', 'SPX', 'QQQ'];

export const data = new SlashCommandBuilder()
  .setName('levels')
  .setDescription('EQH/EQL levels for SPY, SPX, and QQQ in one view')
  .addStringOption((opt) =>
    opt
      .setName('timeframe')
      .setDescription('Chart timeframe (default 1h)')
      .addChoices(
        { name: '5 minutes', value: '5m' },
        { name: '1 hour', value: '1h' },
        { name: '4 hours', value: '4h' },
      ),
  );

export async function execute(interaction) {
  const timeframe = interaction.options.getString('timeframe') ?? '1h';

  await interaction.deferReply();

  try {
    const sections = [];

    for (const ticker of TICKERS) {
      const result = await scanTickerWicks(ticker, { timeframe, live: true, sortMode: 'level' });
      const eql = result.eql.slice(0, 2).map((l) => `$${l.level.toFixed(2)}`).join(', ') || '—';
      const eqh = result.eqh.slice(0, 2).map((l) => `$${l.level.toFixed(2)}`).join(', ') || '—';

      sections.push({
        name: `${result.label} (${timeframe})`,
        value: `**EQL:** ${eql}\n**EQH:** ${eqh}`,
        inline: false,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Market Levels — ${timeframe}`)
      .setColor(0xd4af37)
      .setDescription(`Nearest EQH/EQL wicks (≤ $${config.monitors.eqhEqlTolerance.toFixed(2)})`)
      .addFields(sections)
      .setFooter({ text: 'Yahoo Finance • Use /flow for full detail per ticker' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[levels]', err.message);
    await interaction.editReply({ content: `Levels scan failed: ${err.message}` });
  }
}
