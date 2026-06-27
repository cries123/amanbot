import { config } from '../config.js';

export class CommandsChannelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommandsChannelError';
  }
}

export function assertCommandsChannel(interaction) {
  const channelId = config.channels.commands;
  if (!channelId) return;

  if (interaction.channelId !== channelId) {
    throw new CommandsChannelError(`Use this command in <#${channelId}> only.`);
  }
}
