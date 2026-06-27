import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';
import { getTickerEarnings, buildEarningsLine } from '../../services/earnings.js';
import { assertCommandsChannel, CommandsChannelError } from '../../utils/commandsChannel.js';

export const data = new SlashCommandBuilder()
  .setName('earnings')
  .setDescription('Upcoming earnings date and estimates for a ticker')
  .addStringOption((opt) =>
    opt.setName('ticker').setDescription('e.g. NVDA, AAPL, SPY').setRequired(true),
  );

export async function execute(interaction) {
  try {
    assertCommandsChannel(interaction);
  } catch (err) {
    const message = err instanceof CommandsChannelError ? err.message : 'Wrong channel.';
    await interaction.reply({ content: message, ephemeral: true });
    return;
  }

  if (!config.apis.finnhub) {
    await interaction.reply({ content: 'FINNHUB_API_KEY is not configured.', ephemeral: true });
    return;
  }

  const ticker = interaction.options.getString('ticker', true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const entries = await getTickerEarnings(ticker);

    if (!entries.length) {
      await interaction.editReply({
        content: `No upcoming earnings found for **${ticker.toUpperCase()}** in the next 90 days.`,
      });
      return;
    }

    const next = entries[0];
    const upcoming = entries.slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle(`📅 Earnings — ${next.symbol}`)
      .setColor(0x9b59b6)
      .setDescription(`Next report: **${next.date}** (${next.hour})`)
      .addFields(
        { name: 'Quarter', value: `Q${next.quarter ?? '?'} ${next.year ?? ''}`.trim(), inline: true },
        { name: 'EPS Estimate', value: next.epsEstimate != null ? String(next.epsEstimate) : '—', inline: true },
        { name: 'EPS Actual', value: next.epsActual != null ? String(next.epsActual) : '—', inline: true },
        {
          name: 'Upcoming dates',
          value: upcoming.map((e) => buildEarningsLine(e)).join('\n').slice(0, 1024),
          inline: false,
        },
      )
      .setFooter({ text: 'Finnhub • Not financial advice' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[earnings]', err.message);
    await interaction.editReply({ content: `Earnings lookup failed: ${err.message}` });
  }
}
