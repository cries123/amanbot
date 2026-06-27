import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { sendToChannel } from '../bot/client.js';

const COLORS = {
  ban: 0xe74c3c,
  kick: 0xe67e22,
  mute: 0x95a5a6,
  warn: 0xf39c12,
  purge: 0x3498db,
  scam: 0xc0392b,
  raid: 0x9b59b6,
  newaccount: 0xe67e22,
  impersonation: 0xe67e22,
  api: 0xe74c3c,
  default: 0x5865f2,
};

export async function postModLog(client, { action, title, color, fields = [], description, thumbnail, components }) {
  const channelId = config.channels.modLog;
  if (!channelId) return null;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color ?? COLORS[action] ?? COLORS.default)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (fields.length) embed.addFields(fields);

  const payload = { embeds: [embed] };
  if (components?.length) payload.components = components;

  return sendToChannel(client, channelId, payload);
}
