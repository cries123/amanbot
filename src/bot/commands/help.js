import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const PAGES = {
  home: {
    title: 'AmanBot Help',
    description: 'Your trading alert assistant. Use the buttons below to learn about each feature.',
    color: 0xd4af37,
    fields: [
      { name: 'Quick Start', value: '1. `/watchlist` → click **Add**\n2. Enable DMs from server members\n3. Get alerts when setups form', inline: false },
      { name: 'Moderators', value: 'Mods can use `/mod` for server moderation help.', inline: false },
    ],
  },
  watchlist: {
    title: 'Watchlist & DM Alerts',
    description: 'Personal ticker alerts delivered to your DMs.',
    color: 0x3498db,
    fields: [
      { name: 'Setup', value: 'Run `/watchlist` — **Add**, **Remove**, **List**, **Alert Types**, **Delivery**', inline: false },
      { name: 'Delivery', value: '**DM** (private) or **Alerts Channel** (ping in server — no DMs needed)', inline: false },
      { name: 'Alert types', value: '**EQH** — equal high wicks\n**EQL** — equal low wicks\n**FVG** — fair value gaps\n**Volume** — unusual volume spikes\nToggle any off in **Alert Types**', inline: false },
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
      { name: '/news', value: 'Latest headlines (commands channel, only you see it)', inline: true },
      { name: '/breakeven', value: 'Options R/R calculator', inline: true },
    ],
  },
  auto: {
    title: 'Automatic Alerts',
    description: 'Background monitors during market hours (EST).',
    color: 0xe67e22,
    fields: [
      { name: 'SMC Scanner', value: 'EQH/EQL/FVG/volume on your watchlist tickers', inline: false },
      { name: 'Morning Briefing', value: '9:25 AM — gap, macro, levels', inline: false },
      { name: 'Market Session', value: '9:30 open, 3:00 power hour, 4:00 close', inline: false },
      { name: 'IV Monitor', value: 'Volatility extremes on watchlist', inline: false },
      { name: 'Economic Calendar', value: 'CPI, FOMC, NFP warnings', inline: false },
    ],
  },
};

function helpButtons(active = 'home') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help:watchlist').setLabel('Watchlist').setStyle(active === 'watchlist' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:trading').setLabel('Trading').setStyle(active === 'trading' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:auto').setLabel('Auto Alerts').setStyle(active === 'auto' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:home').setLabel('Home').setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
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
