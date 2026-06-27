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
  getUserSettings,
  toggleAlertPref,
} from '../../services/watchlist.js';
import { ensureUserAlertThread, activateDmDelivery } from '../../services/alertThreads.js';
import { config } from '../../config.js';

const ALERT_LABELS = {
  eqh: { name: 'EQH', desc: 'Equal high wicks' },
  eql: { name: 'EQL', desc: 'Equal low wicks' },
  fvg: { name: 'FVG', desc: 'Fair value gaps' },
  volume: { name: 'Volume', desc: 'Unusual volume spikes' },
};

function navRow(active = 'home') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wl:add').setLabel('Add').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('wl:remove').setLabel('Remove').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('wl:list').setLabel('List').setStyle(active === 'list' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wl:alerts').setLabel('Alert Types').setStyle(active === 'alerts' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wl:delivery').setLabel('Delivery').setStyle(active === 'delivery' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function overviewRow(active = 'home') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wl:home').setLabel('Overview').setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function alertToggleRow(settings) {
  return new ActionRowBuilder().addComponents(
    ...Object.entries(ALERT_LABELS).map(([key, { name }]) =>
      new ButtonBuilder()
        .setCustomId(`wl:toggle:${key}`)
        .setLabel(`${name} ${settings[key] ? 'ON' : 'OFF'}`)
        .setStyle(settings[key] ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
}

function deliveryToggleRow(settings) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wl:delivery:dm')
      .setLabel(`DMs ${settings.deliveryMode === 'dm' ? '✓' : ''}`)
      .setStyle(settings.deliveryMode === 'dm' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl:delivery:thread')
      .setLabel(`Private Thread ${settings.deliveryMode === 'thread' ? '✓' : ''}`)
      .setStyle(settings.deliveryMode === 'thread' ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
}

function formatAlertTypes(settings) {
  return Object.entries(ALERT_LABELS)
    .map(([key, { name, desc }]) => {
      const on = settings[key];
      return `${on ? '✅' : '❌'} **${name}** — ${desc}`;
    })
    .join('\n');
}

function formatDeliveryMode(settings) {
  if (settings.deliveryMode === 'thread') {
    return '**Private Thread** — alerts post in a thread only you can see. No DMs needed.';
  }
  return '**DMs** — alerts sent directly to your Discord messages.';
}

export async function buildWatchlistPayload(page, userId) {
  const tickers = await getUserWatchlist(userId);
  const settings = await getUserSettings(userId);
  const components = [navRow(page), overviewRow(page)];

  if (page === 'list') {
    const embed = new EmbedBuilder()
      .setTitle('Your Watchlist')
      .setColor(0xd4af37)
      .setDescription(tickers.length
        ? tickers.map((t) => `• **${t}**`).join('\n')
        : 'No tickers yet. Click **Add** below to add one.')
      .addFields(
        { name: 'Tickers', value: `${tickers.length}/${config.watchlist.maxPerUser}`, inline: true },
        { name: 'Delivery', value: settings.deliveryMode === 'thread' ? 'Private Thread' : 'DMs', inline: true },
        { name: 'Enabled alerts', value: Object.entries(settings).filter(([k, v]) => ALERT_LABELS[k] && v).map(([k]) => ALERT_LABELS[k].name).join(', ') || 'None', inline: false },
      )
      .setFooter({ text: 'Same alert embed updates when swept or invalidated' });

    return { embeds: [embed], components };
  }

  if (page === 'alerts') {
    components.push(alertToggleRow(settings));

    const embed = new EmbedBuilder()
      .setTitle('Alert Types')
      .setColor(0x3498db)
      .setDescription('Toggle which setups you receive. Click a button to turn a type **on** or **off**.')
      .addFields(
        { name: 'Your settings', value: formatAlertTypes(settings), inline: false },
        { name: 'Updates', value: 'The same alert embed updates when a level is **swept** or **invalidated**.', inline: false },
      )
      .setFooter({ text: 'Green = ON • Gray = OFF' });

    return { embeds: [embed], components };
  }

  if (page === 'delivery') {
    components.push(deliveryToggleRow(settings));

    const fields = [
      { name: 'Current', value: formatDeliveryMode(settings), inline: false },
      { name: 'DMs', value: 'Sent to your Discord DMs.\nRequires allowing messages from server members.', inline: true },
      { name: 'Private Thread', value: 'Bot creates a private thread only you can access.\n**Safer** — no need to open DMs to strangers.', inline: true },
    ];

    if (settings.deliveryMode === 'thread' && settings.threadId) {
      fields.push({ name: 'Your thread', value: `<#${settings.threadId}>`, inline: false });
    }

    const embed = new EmbedBuilder()
      .setTitle('Alert Delivery')
      .setColor(0x9b59b6)
      .setDescription('Choose how you want to receive watchlist alerts.')
      .addFields(fields)
      .setFooter({ text: 'You can switch anytime' });

    return { embeds: [embed], components };
  }

  const embed = new EmbedBuilder()
    .setTitle('Watchlist & Alerts')
    .setColor(0x3498db)
    .setDescription('Personal ticker alerts for setups on your watchlist.')
    .addFields(
      { name: 'Add / Remove', value: 'Use **Add** or **Remove** to manage tickers (up to 15)', inline: false },
      { name: 'Alert types', value: formatAlertTypes(settings), inline: false },
      { name: 'Delivery', value: formatDeliveryMode(settings), inline: false },
      { name: 'Your tickers', value: tickers.length ? tickers.join(', ') : '_None yet — click Add_', inline: false },
      { name: 'Updates', value: 'The same alert embed updates when a level is **swept** or **invalidated**.', inline: false },
    )
    .setFooter({ text: 'Use the buttons below to configure everything' });

  return { embeds: [embed], components };
}

export const data = new SlashCommandBuilder()
  .setName('watchlist')
  .setDescription('Manage your ticker watchlist and alert settings');

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

  if (id === 'wl:delivery:dm') {
    await activateDmDelivery(interaction.user.id);
    const payload = await buildWatchlistPayload('delivery', interaction.user.id);
    await interaction.update(payload);
    return;
  }

  if (id === 'wl:delivery:thread') {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Use this in a server channel to enable private threads.', ephemeral: true });
      return;
    }

    const thread = await ensureUserAlertThread(interaction.client, interaction.guild, interaction.user);
    const payload = await buildWatchlistPayload('delivery', interaction.user.id);
    await interaction.update({
      ...payload,
      content: `Delivery set to **Private Thread** — alerts will post in ${thread}.`,
    });
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
