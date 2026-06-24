import { SlashCommandBuilder } from 'discord.js';
import { query, getPool } from '../../database/db.js';
import { buildStatsEmbed } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View community sentiment poll accuracy stats');

export async function execute(interaction) {
  if (!getPool()) {
    await interaction.reply({ content: 'Stats require a database connection. Set `DATABASE_URL` in your environment.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const stats = await getCommunityStats();
    await interaction.editReply({ embeds: [buildStatsEmbed(stats)] });
  } catch (err) {
    console.error('[stats]', err);
    await interaction.editReply({ content: 'Failed to load stats.' });
  }
}

async function getCommunityStats() {
  const polls = await query(`
    SELECT id, poll_date, market_result
    FROM sentiment_polls
    WHERE market_result IS NOT NULL
    ORDER BY poll_date DESC
  `);

  const votes = await query(`
    SELECT v.user_id, v.vote, p.market_result
    FROM sentiment_votes v
    JOIN sentiment_polls p ON p.id = v.poll_id
    WHERE p.market_result IS NOT NULL
  `);

  const totalPolls = polls.rows.length;
  const bullishVotes = votes.rows.filter((v) => v.vote === 'bullish').length;
  const bullishPct = votes.rows.length ? (bullishVotes / votes.rows.length) * 100 : 0;

  let communityWins = 0;
  for (const vote of votes.rows) {
    if (vote.vote === vote.market_result) communityWins++;
  }
  const communityWinRate = votes.rows.length ? (communityWins / votes.rows.length) * 100 : 0;

  const userMap = new Map();
  for (const vote of votes.rows) {
    if (!userMap.has(vote.user_id)) {
      userMap.set(vote.user_id, { wins: 0, losses: 0 });
    }
    const record = userMap.get(vote.user_id);
    if (vote.vote === vote.market_result) record.wins++;
    else record.losses++;
  }

  const topUsers = [...userMap.entries()]
    .map(([userId, { wins, losses }]) => ({
      userId,
      wins,
      losses,
      winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
    }))
    .filter((u) => u.wins + u.losses >= 3)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 5);

  return { totalPolls, communityWinRate, bullishPct, topUsers };
}
