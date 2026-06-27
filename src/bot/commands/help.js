import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const PAGES = {
  home: {
    title: 'AmanBot Help',
    description: 'Your trading alert assistant. Use the buttons below to learn about each feature.',
    color: 0xd4af37,
    fields: [
      { name: 'Quick Start', value: '1. `/watchlist add ticker:SPY`\n2. Enable DMs from server members\n3. Get alerts when setups form', inline: false },
    ],
  },
  watchlist: {
    title: 'Watchlist & DM Alerts',
    description: 'Personal ticker alerts delivered to your DMs.',
    color: 0x3498db,
    fields: [
      { name: '/watchlist add', value: 'Add a ticker (up to 15)', inline: false },
      { name: '/watchlist remove', value: 'Remove a ticker', inline: false },
      { name: '/watchlist list', value: 'View your watchlist', inline: false },
      { name: 'Alert types', value: '**EQH** — equal high wicks\n**EQL** — equal low wicks\n**FVG** — fair value gaps\n**Volume** — unusual volume spikes', inline: false },
      { name: 'Updates', value: 'The same DM embed updates when a level is **swept** or **invalidated**.', inline: false },
    ],
  },
  trading: {
    title: 'Trading Commands',
    description: 'On-demand market tools.',
    color: 0x2ecc71,
    fields: [
      { name: '/flow', value: 'Live EQH/EQL scan for SPY, SPX, QQQ', inline: true },
      { name: '/levels', value: 'All tickers in one view', inline: true },
      { name: '/quote', value: 'Quick price quote', inline: true },
      { name: '/chart', value: 'Candlestick chart image', inline: true },
      { name: '/news', value: 'Latest headlines', inline: true },
      { name: '/breakeven', value: 'Options R/R calculator', inline: true },
    ],
  },
  auto: {
    title: 'Automatic Alerts',
    description: 'Background monitors during market hours (EST).',
    color: 0xe67e22,
    fields: [
      { name: 'SMC Scanner', value: 'EQH/EQL on 5m, 1h, 4h', inline: false },
      { name: 'Morning Briefing', value: '9:25 AM — gap, macro, levels', inline: false },
      { name: 'Market Session', value: '9:30 open, 3:00 power hour, 4:00 close', inline: false },
      { name: 'IV Monitor', value: 'Volatility extremes on watchlist', inline: false },
      { name: 'Economic Calendar', value: 'CPI, FOMC, NFP warnings', inline: false },
    ],
  },
  mod: {
    title: 'Moderation & Security',
    description: 'Server protection tools.',
    color: 0xe74c3c,
    fields: [
      { name: '/warn', value: '3 warns = auto 24h mute', inline: true },
      { name: '/warnings', value: 'View warn history', inline: true },
      { name: '/purge', value: 'Delete messages', inline: true },
      { name: 'Auto', value: 'Scam filter, raid alerts, new account flags, impersonation detection', inline: false },
    ],
  },
};

function helpButtons(active = 'home') {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help:watchlist').setLabel('Watchlist').setStyle(active === 'watchlist' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:trading').setLabel('Trading').setStyle(active === 'trading' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:auto').setLabel('Auto Alerts').setStyle(active === 'auto' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:mod').setLabel('Moderation').setStyle(active === 'mod' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:home').setLabel('Home').setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  return row;
}

export function buildHelpPayload(page = 'home') {
  const content = PAGES[page] ?? PAGES.home;
  const embed = new EmbedBuilder()
    .setTitle(content.title)
    .setDescription(content.description)
    .setColor(content.color)
    .addFields(content.fields)
    .setFooter({ text: 'Aman Trades • Not financial advice' });

  return { embeds: [embed], components: [helpButtons(page)] };
}

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Interactive guide to AmanBot features');

export async function execute(interaction) {
  const payload = buildHelpPayload('home');
  await interaction.reply({ ...payload, ephemeral: true });
}

export function handleHelpButton(customId) {
  const page = customId.replace('help:', '');
  return buildHelpPayload(page);
}
