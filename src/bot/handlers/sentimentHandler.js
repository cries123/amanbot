import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { query, getPool } from '../../database/db.js';
import { getSpyDailyChange } from '../../services/finnhub.js';

export function setupSentimentHandlers(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('sentiment_')) return;

    if (!getPool()) {
      await interaction.reply({ content: 'Voting is unavailable — database not configured.', ephemeral: true });
      return;
    }

    const vote = interaction.customId === 'sentiment_bullish' ? 'bullish' : 'bearish';
    const pollDate = new Date().toISOString().slice(0, 10);

    try {
      const poll = await query('SELECT id FROM sentiment_polls WHERE poll_date = $1', [pollDate]);
      if (poll.rows.length === 0) {
        await interaction.reply({ content: 'No active poll for today.', ephemeral: true });
        return;
      }

      const pollId = poll.rows[0].id;
      await query(
        `INSERT INTO sentiment_votes (poll_id, user_id, vote)
         VALUES ($1, $2, $3)
         ON CONFLICT (poll_id, user_id) DO UPDATE SET vote = EXCLUDED.vote`,
        [pollId, interaction.user.id, vote],
      );

      const counts = await query(
        `SELECT vote, COUNT(*)::int AS count FROM sentiment_votes WHERE poll_id = $1 GROUP BY vote`,
        [pollId],
      );

      const bullish = counts.rows.find((r) => r.vote === 'bullish')?.count ?? 0;
      const bearish = counts.rows.find((r) => r.vote === 'bearish')?.count ?? 0;

      await interaction.reply({
        content: `Your vote: **${vote}** 🗳️\nCurrent tally — 🐂 ${bullish} | 🐻 ${bearish}`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[sentiment vote]', err);
      await interaction.reply({ content: 'Failed to record your vote.', ephemeral: true });
    }
  });
}

export function buildSentimentPollMessage() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sentiment_bullish')
      .setLabel('Bullish 🐂')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('sentiment_bearish')
      .setLabel('Bearish 🐻')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content: '## ☀️ Good morning traders!\n**Bullish or Bearish on the open today?**\nVote below — results are graded at market close.',
    components: [row],
  };
}

export async function gradeTodaysPoll() {
  if (!getPool()) return;

  const pollDate = new Date().toISOString().slice(0, 10);
  const marketResult = await getSpyDailyChange();
  if (!marketResult) {
    console.warn('[sentiment] Could not determine SPY close direction');
    return;
  }

  await query(
    'UPDATE sentiment_polls SET market_result = $1 WHERE poll_date = $2 AND market_result IS NULL',
    [marketResult, pollDate],
  );

  console.log(`[sentiment] Graded ${pollDate} poll as ${marketResult}`);
}
