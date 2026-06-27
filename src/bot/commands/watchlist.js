import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  addToWatchlist,
  removeFromWatchlist,
  getUserWatchlist,
  getUserAlertPrefs,
  toggleAlertPref,
} from '../../services/watchlist.js';
import { config } from '../../config.js';

const ALERT_LABELS = {
  eqh: { name: 'EQH', desc: 'Equal high wicks' },
  eql: { name: 'EQL', desc: 'Equal low wicks' },
  fvg: { name: 'FVG', desc: 'Fair value gaps' },
  volume: { name: 'Volume', desc: 'Unusual volume spikes' },
};

function navButtons(active = 'home') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wl:add').setLabel('Add').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('wl:remove').setLabel('Remove').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('wl:list').setLabel('List').setStyle(active === 'list' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wl:alerts').setLabel('Alert Types').setStyle(active === 'alerts' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wl:home').setLabel('Home').setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function alertToggleButtons(prefs) {
  return new ActionRowBuilder().addComponents(
    ...Object.entries(ALERT_LABELS).map(([key, { name }]) =>
      new ButtonBuilder()
        .setCustomId(`wl:toggle:${key}`)
        .setLabel(`${name} ${prefs[key] ? 'ON' : 'OFF'}`)
        .setStyle(prefs[key] ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
}

function formatAlertTypes(prefs) {
  return Object.entries(ALERT_LABELS)
    .map(([key, { name, desc }]) => {
      const on = prefs[key];
      return `${on ? '✅' : '❌'} **${name}** — ${desc}`;
    })
    .join('\n');
}

export async function buildWatchlistPayload(page, userId) {
  const tickers = await getUserWatchlist(userId);
  const prefs = await getUserAlertPrefs(userId);
  const components = [navButtons(page)];

  if (page === 'list') {
    const embed = new EmbedBuilder()
      .setTitle('Your Watchlist')
      .setColor(0xd4af37)
      .setDescription(tickers.length
        ? tickers.map((t) => `• **${t}**`).join('\n')
        : 'No tickers yet. Click **Add** below to add one.')
      .addFields(
        { name: 'Tickers', value: `${tickers.length}/${config.watchlist.maxPerUser}`, inline: true },
        { name: 'Enabled alerts', value: Object.entries(prefs).filter(([, v]) => v).map(([k]) => ALERT_LABELS[k].name).join(', ') || 'None', inline: true },
      )
      .setFooter({ text: 'Alerts are sent via DM when setups form or update' });

    return { embeds: [embed], components };
  }

  if (page === 'alerts') {
    components.push(alertToggleButtons(prefs));

    const embed = new EmbedBuilder()
      .setTitle('Alert Types')
      .setColor(0x3498db)
      .setDescription('Toggle which alerts you receive via DM. Click a button to turn it on or off.')
      .addFields(
        { name: 'Your settings', value: formatAlertTypes(prefs), inline: false },
        { name: 'Updates', value: 'The same DM embed updates when a level is **swept** or **invalidated**.', inline: false },
      )
      .setFooter({ text: 'Green = ON • Gray = OFF' });

    return { embeds: [embed], components };
  }

  const embed = new EmbedBuilder()
    .setTitle('Watchlist & DM Alerts')
    .setColor(0x3498db)
    .setDescription('Personal ticker alerts delivered to your DMs.')
    .addFields(
      { name: 'Add', value: 'Click **Add** to add a ticker (up to 15)', inline: false },
      { name: 'Remove', value: 'Click **Remove** to drop a ticker', inline: false },
      { name: 'List', value: 'View your current watchlist', inline: false },
      { name: 'Alert types', value: formatAlertTypes(prefs), inline: false },
      { name: 'Your tickers', value: tickers.length ? tickers.join(', ') : '_None yet_', inline: false },
      { name: 'Updates', value: 'The same DM embed updates when a level is **swept** or **invalidated**.', inline: false },
    )
    .setFooter({ text: 'Enable DMs from server members • Aman Trades' });

  return { embeds: [embed], components };
}

export const data = new SlashCommandBuilder()
  .setName('watchlist')
  .setDescription('Manage your personal ticker watchlist for DM alerts');

export async function execute(interaction) {
  const payload = await buildWatchlistPayload('home', interaction.user.id);
  await interaction.reply({ ...payload, ephemeral: true });
}

export function buildAddModal() {
  return new ModalBuilder()
    .setCustomId('wl:modal:add')
    .setTitle('Add Ticker')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticker')
          .setLabel('Ticker symbol')
          .setPlaceholder('SPY, AAPL, NVDA...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10),
      ),
    );
}

export function buildRemoveModal() {
  return new ModalBuilder()
    .setCustomId('wl:modal:remove')
    .setTitle('Remove Ticker')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ticker')
          .setLabel('Ticker symbol')
          .setPlaceholder('SPY, AAPL, NVDA...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10),
      ),
    );
}

export async function handleWatchlistButton(interaction) {
  const id = interaction.customId;

  if (id === 'wl:add') {
    await interaction.showModal(buildAddModal());
    return;
  }

  if (id === 'wl:remove') {
    await interaction.showModal(buildRemoveModal());
    return;
  }

  if (id.startsWith('wl:toggle:')) {
    const alertType = id.replace('wl:toggle:', '');
    await toggleAlertPref(interaction.user.id, alertType);
    const payload = await buildWatchlistPayload('alerts', interaction.user.id);
    await interaction.update(payload);
    return;
  }

  const page = id.replace('wl:', '');
  const payload = await buildWatchlistPayload(page, interaction.user.id);
  await interaction.update(payload);
}

export async function handleWatchlistModal(interaction) {
  const ticker = interaction.fields.getTextInputValue('ticker');

  try {
    if (interaction.customId === 'wl:modal:add') {
      const added = await addToWatchlist(interaction.user.id, ticker);
      const payload = await buildWatchlistPayload('list', interaction.user.id);
      await interaction.reply({
        content: `Added **${added}** to your watchlist.`,
        ...payload,
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === 'wl:modal:remove') {
      const removed = await removeFromWatchlist(interaction.user.id, ticker);
      const payload = await buildWatchlistPayload('list', interaction.user.id);
      await interaction.reply({
        content: `Removed **${removed}** from your watchlist.`,
        ...payload,
        ephemeral: true,
      });
    }
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}
