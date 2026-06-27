import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { addToWatchlist, removeFromWatchlist, getUserWatchlist } from '../../services/watchlist.js';
import { config } from '../../config.js';

export const data = new SlashCommandBuilder()
  .setName('watchlist')
  .setDescription('Manage your personal ticker watchlist for DM alerts')
  .addSubcommand((sub) =>
    sub.setName('add').setDescription('Add a ticker to your watchlist')
      .addStringOption((opt) => opt.setName('ticker').setDescription('e.g. SPY, AAPL, NVDA').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub.setName('remove').setDescription('Remove a ticker from your watchlist')
      .addStringOption((opt) => opt.setName('ticker').setDescription('Ticker to remove').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Show your watchlist'),
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'add') {
      const ticker = interaction.options.getString('ticker', true);
      const added = await addToWatchlist(interaction.user.id, ticker);
      const list = await getUserWatchlist(interaction.user.id);

      await interaction.reply({
        content: `Added **${added}** to your watchlist. You'll get DM alerts for EQH, EQL, FVG, and unusual volume.\nYour watchlist (${list.length}/${config.watchlist.maxPerUser}): ${list.join(', ') || 'empty'}`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'remove') {
      const ticker = interaction.options.getString('ticker', true);
      const removed = await removeFromWatchlist(interaction.user.id, ticker);
      const list = await getUserWatchlist(interaction.user.id);

      await interaction.reply({
        content: `Removed **${removed}**.\nYour watchlist: ${list.join(', ') || 'empty'}`,
        ephemeral: true,
      });
      return;
    }

    const list = await getUserWatchlist(interaction.user.id);
    const embed = new EmbedBuilder()
      .setTitle('Your Watchlist')
      .setColor(0xd4af37)
      .setDescription(list.length
        ? list.map((t) => `• **${t}**`).join('\n')
        : 'No tickers yet. Use `/watchlist add ticker:SPY` to get started.')
      .addFields(
        { name: 'Limit', value: `${list.length}/${config.watchlist.maxPerUser}`, inline: true },
        { name: 'Alerts', value: 'EQH, EQL, FVG, Volume', inline: true },
      )
      .setFooter({ text: 'Alerts are sent via DM when setups form or update' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}
