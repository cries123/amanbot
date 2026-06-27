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
  activateDmDelivery,
  activateChannelDelivery,
  setUserTimezone,
  setLookbackDays,
  TIMEZONE_OPTIONS,
} from '../../services/watchlist.js';
import { LOOKBACK_PRESETS, formatLookbackLabel } from '../../utils/lookback.js';
import { config } from '../../config.js';
import { hasDatabaseUrl } from '../../database/db.js';
import { formatTimeInZone } from '../../utils/time.js';

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
    new ButtonBuilder().setCustomId('wl:settings').setLabel('Settings').setStyle(active === 'settings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wl:lookback').setLabel('Lookback').setStyle(active === 'lookback' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function timezoneRow(settings) {
  return new ActionRowBuilder().addComponents(
    ...TIMEZONE_OPTIONS.map(({ id, label }) =>
      new ButtonBuilder()
        .setCustomId(`wl:tz:${id}`)
        .setLabel(`${label.split(' ')[0]}${settings.timezone === id ? ' ✓' : ''}`)
        .setStyle(settings.timezone === id ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
}

function formatTimezone(settings) {
  const match = TIMEZONE_OPTIONS.find((tz) => tz.id === settings.timezone);
  const label = match?.label ?? settings.timezone;
  const sample = formatTimeInZone(Math.floor(Date.now() / 1000), settings.timezone);
  return `**${label}** — e.g. ${sample}`;
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
      .setLabel(`DM ${settings.deliveryMode === 'dm' ? '✓' : ''}`)
      .setStyle(settings.deliveryMode === 'dm' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl:delivery:channel')
      .setLabel(`Alerts Channel ${settings.deliveryMode === 'channel' ? '✓' : ''}`)
      .setStyle(settings.deliveryMode === 'channel' ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
}

function alertsChannelMention() {
  return config.channels.watchlistAlerts ? `<#${config.channels.watchlistAlerts}>` : '#watchlist-alerts';
}

function formatAlertTypes(settings) {
  return Object.entries(ALERT_LABELS)
    .map(([key, { name, desc }]) => {
      const on = settings[key];
      return `${on ? '✅' : '❌'} **${name}** — ${desc}`;
    })
    .join('\n');
}

function formatLookbackSettings(settings) {
  return Object.entries(LOOKBACK_PRESETS).map(([tf]) => {
    const days = settings.lookbackDays?.[tf] ?? 7;
    return `**${tf}** — ${formatLookbackLabel(days, tf)} (\`${days}d\`)`;
  }).join('\n');
}

function lookbackPresetRows(settings, timeframe) {
  const presets = LOOKBACK_PRESETS[timeframe] ?? [];
  const current = settings.lookbackDays?.[timeframe];
  const rows = [];

  for (let i = 0; i < presets.length; i += 5) {
    const chunk = presets.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(
      ...chunk.map(({ days, label }) =>
        new ButtonBuilder()
          .setCustomId(`wl:lb:${timeframe}:${days}`)
          .setLabel(`${label}${current === days ? ' ✓' : ''}`)
          .setStyle(current === days ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      ...(i + 5 >= presets.length
        ? [new ButtonBuilder().setCustomId(`wl:lbcustom:${timeframe}`).setLabel('Custom').setStyle(ButtonStyle.Secondary)]
        : []),
    ));
  }

  return rows;
}

function formatDeliveryMode(settings) {
  if (settings.deliveryMode === 'channel') {
    return `**Alerts Channel** — pings you in ${alertsChannelMention()}. No DMs needed.`;
  }
  return '**DM** — private alerts sent directly to your Discord messages.';
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
        { name: 'Delivery', value: settings.deliveryMode === 'channel' ? 'Alerts Channel' : 'DM', inline: true },
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

  if (page === 'settings') {
    components.push(timezoneRow(settings));
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wl:customtz').setLabel('Custom Timezone').setStyle(ButtonStyle.Secondary),
    ));

    const embed = new EmbedBuilder()
      .setTitle('Your Settings')
      .setColor(0x1abc9c)
      .setDescription('Customize how times appear in your alerts and `/flow` results.')
      .addFields(
        { name: 'Timezone', value: formatTimezone(settings), inline: false },
        { name: 'Tip', value: 'Market scanners still run on **US market hours (ET)**. This only changes how times display for you.', inline: false },
      )
      .setFooter({ text: 'Pick a preset or use Custom for any IANA timezone' });

    return { embeds: [embed], components };
  }

  if (page === 'lookback' || page.startsWith('lookback:')) {
    const activeTf = page.includes(':') ? page.split(':')[1] : '1h';
    return buildLookbackPage(userId, activeTf);
  }

  if (page === 'delivery') {
    components.push(deliveryToggleRow(settings));

    const fields = [
      { name: 'Current', value: formatDeliveryMode(settings), inline: false },
      { name: 'DM', value: 'Private message from the bot.\nRequires **Allow DMs from server members**.', inline: true },
      { name: 'Alerts Channel', value: `Posts in ${alertsChannelMention()} and **pings you**.\nUse this if you keep DMs disabled.`, inline: true },
    ];

    const embed = new EmbedBuilder()
      .setTitle('Alert Delivery')
      .setColor(0x9b59b6)
      .setDescription('Choose how you want to receive watchlist alerts.')
      .addFields(fields)
      .setFooter({ text: 'You can switch anytime' });

    return { embeds: [embed], components };
  }

  const fields = [
      { name: 'Add / Remove', value: 'Use **Add** or **Remove** to manage tickers (up to 15)', inline: false },
      { name: 'Alert types', value: formatAlertTypes(settings), inline: false },
      { name: 'Delivery', value: formatDeliveryMode(settings), inline: false },
      { name: 'Timezone', value: formatTimezone(settings), inline: false },
      { name: 'Lookback', value: formatLookbackSettings(settings), inline: false },
      { name: 'DMs disabled?', value: `If you don't allow DMs from server members, go to **Delivery** and pick **Alerts Channel** instead of **DM**.`, inline: false },
      { name: 'Your tickers', value: tickers.length ? tickers.join(', ') : '_None yet — click Add_', inline: false },
      { name: 'Updates', value: 'The same alert embed updates when a level is **swept** or **invalidated**.', inline: false },
    ];

  if (!hasDatabaseUrl()) {
    fields.unshift({
      name: '⚠️ Watchlist won\'t save',
      value: '`DATABASE_URL` is missing from `.env`. Tickers reset every time the bot restarts. Add your Neon connection string.',
      inline: false,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Watchlist & Alerts')
    .setColor(0x3498db)
    .setDescription('Personal ticker alerts for setups on your watchlist.')
    .addFields(fields)
    .setFooter({ text: 'Use the buttons below to configure everything' });

  return { embeds: [embed], components };
}

async function buildLookbackPage(userId, activeTf = '1h') {
  const settings = await getUserSettings(userId);
  const components = [navRow('lookback'), overviewRow('lookback')];

  components.push(
    new ActionRowBuilder().addComponents(
      ...['5m', '1h', '4h'].map((tf) =>
        new ButtonBuilder()
          .setCustomId(`wl:lbview:${tf}`)
          .setLabel(tf)
          .setStyle(tf === activeTf ? ButtonStyle.Primary : ButtonStyle.Secondary),
      ),
    ),
  );
  components.push(...lookbackPresetRows(settings, activeTf));

  const embed = new EmbedBuilder()
    .setTitle('Chart Lookback')
    .setColor(0xe67e22)
    .setDescription('How far back `/flow` and `/levels` scan for EQH/EQL on each timeframe.')
    .addFields(
      { name: 'Your lookback', value: formatLookbackSettings(settings), inline: false },
      { name: 'Editing', value: `Setting **${activeTf}** — pick a preset or **Custom** for exact days.`, inline: false },
    )
    .setFooter({ text: 'Used by /flow and /levels • Alerts still fire on live bar closes' });

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

export function buildTimezoneModal() {
  return new ModalBuilder()
    .setCustomId('wl:modal:timezone')
    .setTitle('Custom Timezone')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('timezone')
          .setLabel('IANA timezone')
          .setPlaceholder('America/Chicago, Europe/London, Asia/Tokyo...')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(64),
      ),
    );
}

export function buildLookbackModal(timeframe) {
  return new ModalBuilder()
    .setCustomId(`wl:modal:lookback:${timeframe}`)
    .setTitle(`Custom Lookback — ${timeframe}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('Days to look back')
          .setPlaceholder(timeframe === '5m' ? '1–10' : timeframe === '1h' ? '1–90' : '1–180')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(3),
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

  if (id === 'wl:customtz') {
    await interaction.showModal(buildTimezoneModal());
    return;
  }

  if (id.startsWith('wl:tz:')) {
    const timezone = id.replace('wl:tz:', '');
    await setUserTimezone(interaction.user.id, timezone);
    const payload = await buildWatchlistPayload('settings', interaction.user.id);
    await interaction.update(payload);
    return;
  }

  if (id === 'wl:delivery:dm') {
    await activateDmDelivery(interaction.user.id);
    const payload = await buildWatchlistPayload('delivery', interaction.user.id);
    await interaction.update(payload);
    return;
  }

  if (id === 'wl:delivery:channel') {
    try {
      await activateChannelDelivery(interaction.user.id);
      const payload = await buildWatchlistPayload('delivery', interaction.user.id);
      await interaction.update(payload);
    } catch (err) {
      await interaction.reply({ content: err.message, ephemeral: true });
    }
    return;
  }

  if (id.startsWith('wl:lb:')) {
    const [, , tf, days] = id.split(':');
    await setLookbackDays(interaction.user.id, tf, Number(days));
    const payload = await buildLookbackPage(interaction.user.id, tf);
    await interaction.update(payload);
    return;
  }

  if (id.startsWith('wl:lbview:')) {
    const tf = id.replace('wl:lbview:', '');
    const payload = await buildLookbackPage(interaction.user.id, tf);
    await interaction.update(payload);
    return;
  }

  if (id.startsWith('wl:lbcustom:')) {
    const tf = id.replace('wl:lbcustom:', '');
    await interaction.showModal(buildLookbackModal(tf));
    return;
  }

  const page = id.replace('wl:', '');
  const payload = await buildWatchlistPayload(page, interaction.user.id);
  await interaction.update(payload);
}

export async function handleWatchlistModal(interaction) {
  try {
    if (interaction.customId === 'wl:modal:add') {
      const ticker = interaction.fields.getTextInputValue('ticker');
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
      const ticker = interaction.fields.getTextInputValue('ticker');
      const removed = await removeFromWatchlist(interaction.user.id, ticker);
      const payload = await buildWatchlistPayload('list', interaction.user.id);
      await interaction.reply({
        content: `Removed **${removed}** from your watchlist.`,
        ...payload,
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === 'wl:modal:timezone') {
      const timezone = interaction.fields.getTextInputValue('timezone').trim();
      await setUserTimezone(interaction.user.id, timezone);
      const payload = await buildWatchlistPayload('settings', interaction.user.id);
      await interaction.reply({
        content: `Timezone set to **${timezone}**.`,
        ...payload,
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId.startsWith('wl:modal:lookback:')) {
      const timeframe = interaction.customId.replace('wl:modal:lookback:', '');
      const days = Number(interaction.fields.getTextInputValue('days').trim());
      await setLookbackDays(interaction.user.id, timeframe, days);
      const payload = await buildLookbackPage(interaction.user.id, timeframe);
      await interaction.reply({
        content: `**${timeframe}** lookback set to **${days} days**.`,
        ...payload,
        ephemeral: true,
      });
    }
  } catch (err) {
    await interaction.reply({ content: err.message, ephemeral: true });
  }
}
