import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService, SANCTION_META } from '../../services/moderationService';
import { baseEmbed } from '../../ui/embeds';
import { parseDuration, formatDuration, MAX_TIMEOUT_MS } from '../../utils/duration';
import { UsageError } from '../../core/errors';
import { guildService } from '../../services/guildService';

/**
 * Réduction au silence. Deux moteurs possibles :
 *  • `timeout` (défaut) : timeout natif Discord, maximum 28 jours ;
 *  • `role` : attribue le rôle muet configuré (durée illimitée possible).
 */
const muteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Réduit un membre au silence (timeout Discord ou rôle muet)')
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à rendre muet').setRequired(true))
    .addStringOption((option) =>
      option.setName('duree').setDescription('Durée : 10m, 2h, 3j (max 28j en mode timeout)').setMaxLength(24),
    )
    .addStringOption((option) => option.setName('raison').setDescription('Motif du mute').setMaxLength(480))
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Mécanisme de mute à utiliser')
        .addChoices(
          { name: 'Timeout Discord (recommandé, max 28 j)', value: 'timeout' },
          { name: 'Rôle muet (durée illimitée, nécessite un rôle configuré)', value: 'role' },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Mute temporaire ou illimité',
  usage: ['/mute membre:@Léo duree:30m raison:flood', '/mute membre:@Léo mode:role raison:récidive'],
  permissions: { user: [PermissionFlagsBits.ModerateMembers], bot: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageRoles] },
  cooldown: 4,
  async run(ctx: CommandContext) {
    const target = ctx.memberOf('membre');
    const durationRaw = ctx.interaction.options.getString('duree');
    const reason = ctx.interaction.options.getString('raison') ?? 'Aucune raison fournie';
    const mode = (ctx.interaction.options.getString('mode') as 'timeout' | 'role' | null) ?? guildService.get(ctx.guild.id).mute.mode;

    const parsed = durationRaw ? parseDuration(durationRaw) : undefined;
    if (durationRaw && parsed === null) {
      throw new UsageError('Durée invalide. Exemples : `30m`, `2h`, `3j`, `1j12h`, ou `perm` pour illimité (mode rôle).');
    }
    const duration = parsed === undefined ? undefined : parsed;

    if (mode === 'timeout' && duration && duration > MAX_TIMEOUT_MS) {
      throw new UsageError(
        'Le mode **timeout** est limité à **28 jours** par Discord.\n➜ Utilisez `mode:role` (rôle muet) pour une sanction plus longue, ou `/ban` si elle doit être définitive.',
      );
    }

    const result = await moderationService.mute({
      guild: ctx.guild,
      moderator: ctx.interaction.user,
      moderatorMember: ctx.member,
      target,
      reason,
      duration: duration ?? null,
      useRole: mode === 'role',
    });

    const meta = SANCTION_META.mute;
    return ctx.send(
      baseEmbed({
        title: `${meta.emoji} Membre réduit au silence`,
        description: result.message,
        color: meta.color,
        footer: `Case #${result.caseEntry.caseNumber} • mode ${mode === 'role' ? 'rôle muet' : 'timeout'}`,
      }),
    );
  },
};

export { formatDuration };
export default muteCommand;
