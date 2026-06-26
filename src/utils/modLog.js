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
  default: 0x5865f2,
};

export async function postModLog(client, { action, title, color, fields = [], description, thumbnail }) {
  const channelId = config.channels.modLog;
  if (!channelId) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color ?? COLORS[action] ?? COLORS.default)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (fields.length) embed.addFields(fields);

  await sendToChannel(client, channelId, { embeds: [embed] });
}
