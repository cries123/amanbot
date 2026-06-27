import { Events, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { detectScamContent } from '../utils/scamPatterns.js';
import { postModLog } from '../utils/modLog.js';
import { buildModActionRow } from '../utils/modActionButtons.js';

export function startScamFilter(client) {
  if (!config.moderation.scamFilter) {
    console.log('[scam-filter] Disabled');
    return;
  }

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

      const combined = [message.content, ...message.embeds.map((e) => [e.title, e.description, e.url].filter(Boolean).join(' '))].join(' ');
      const match = detectScamContent(combined);
      if (!match) return;

      await message.delete().catch(() => {});

      await postModLog(client, {
        action: 'scam',
        title: '🚨 Scam Message Deleted',
        description: `Matched pattern: **${match}**`,
        fields: [
          { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Content', value: combined.slice(0, 900) || '(empty)', inline: false },
        ],
        thumbnail: message.author.displayAvatarURL(),
        components: [buildModActionRow(message.author.id)],
      });

      console.log(`[scam-filter] Deleted message from ${message.author.tag} — ${match}`);
    } catch (err) {
      console.error('[scam-filter]', err.message);
    }
  });

  console.log('[scam-filter] Active');
}
