import { PermissionFlagsBits } from 'discord.js';

export function assertModerator(interaction, permission) {
  if (!interaction.memberPermissions?.has(permission)) {
    throw new ModerationError('You do not have permission to use this command.');
  }
}

export function assertCanActOn(interaction, targetMember) {
  if (!targetMember) return;

  if (targetMember.id === interaction.user.id) {
    throw new ModerationError('You cannot use moderation commands on yourself.');
  }

  if (targetMember.id === interaction.guild.ownerId) {
    throw new ModerationError('You cannot moderate the server owner.');
  }

  if (targetMember.id === interaction.client.user.id) {
    throw new ModerationError('You cannot moderate the bot.');
  }

  const actor = interaction.member;
  if (
    targetMember.roles.highest.position >= actor.roles.highest.position
    && interaction.guild.ownerId !== interaction.user.id
  ) {
    throw new ModerationError('You cannot moderate a member with an equal or higher role.');
  }
}

export function assertBotCanAct(interaction, targetMember, permission) {
  const me = interaction.guild.members.me;
  if (!me?.permissions.has(permission)) {
    throw new ModerationError('I do not have the required permission to do that.');
  }

  if (
    targetMember
    && targetMember.roles.highest.position >= me.roles.highest.position
  ) {
    throw new ModerationError('I cannot moderate a member with an equal or higher role than me.');
  }
}

export class ModerationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModerationError';
  }
}

export const Perms = PermissionFlagsBits;
