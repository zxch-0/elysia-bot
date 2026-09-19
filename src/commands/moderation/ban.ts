import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { moderationService } from '../../services/moderationService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { parseDuration, formatDuration } from '../../utils/duration';
import { UsageError } from '../../core/errors';
import { guildService } from '../../services/guildService';

/**
 * Bannissement complet : permanent ou temporaire, avec suppression de
 * messages, notification en MP et case de modération numérotée.
 * Le mot-clé `softban` bannit puis débannit immédiatement (nettoyage).
 */
const banCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre (durée optionnelle, softban possible)')
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à bannir').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('raison')
        .setDescription('Raison de la sanction (visible dans les logs et en MP)')
        .setMaxLength(480),
    )
    .addStringOption((option) =>
      option
        .setName('duree')
        .setDescription('Durée avant débannissement automatique (ex. 7j, 12h) — vide = permanent')
        .setMaxLength(24),
    )
    .addStringOption((option) =>
      option
        .setName('messages')
        .setDescription('Supprimer les messages récents du membre')
        .addChoices(
          { name: 'Ne rien supprimer', value: '0' },
          { name: 'Dernière heure', value: '3600' },
          { name: 'Dernières 24 h', value: '86400' },
          { name: '7 derniers jours', value: '604800' },
        ),
    )
    .addBooleanOption((option) =>
      option.setName('silencieux').setDescription('Ne pas prévenir le membre par message privé'),
    )
    .addBooleanOption((option) =>
      option.setName('softban').setDescription('Bannir puis débannir aussitôt (purge des messages)'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),
  category: 'moderation',
  summary: 'Bannissement (permanent, temporaire ou softban)',
  usage: ['/ban membre:@Léo raison:spam duree:7j messages:86400'],
  permissions: { user: [PermissionFlagsBits.BanMembers], bot: [PermissionFlagsBits.BanMembers] },
  cooldown: 4,
  async run(ctx: CommandContext) {
    const target = ctx.memberOf('membre');
    const reason = ctx.interaction.options.getString('raison');
    const durationRaw = ctx.interaction.options.getString('duree');
    const deleteSeconds = Number.parseInt(ctx.interaction.options.getString('messages') ?? '0', 10) || 0;
    const silent = ctx.interaction.options.getBoolean('silencieux') ?? false;
    const softban = ctx.interaction.options.getBoolean('softban') ?? false;

    const duration = durationRaw ? parseDuration(durationRaw) : 0;
    if (durationRaw && duration === null) {
      throw new UsageError('Durée invalide. Exemples acceptés : `30m`, `12h`, `7j`, `1j12h`.');
    }
    if (!softban && duration && duration > 0 && duration < 60_000) {
      throw new UsageError('La durée minimale d’un bannissement temporaire est de 1 minute.');
    }

    const result = softban
      ? await moderationService.softban({
          guild: ctx.guild,
          moderator: ctx.interaction.user,
          moderatorMember: ctx.member,
          target,
          reason: reason ?? 'Aucune raison fournie',
          deleteMessageSeconds: deleteSeconds || 604800,
          silent,
        })
      : await moderationService.ban({
          guild: ctx.guild,
          moderator: ctx.interaction.user,
          moderatorMember: ctx.member,
          target,
          reason: reason ?? 'Aucune raison fournie',
          deleteMessageSeconds: deleteSeconds,
          silent,
        });

    // Bannissement temporaire : programme le débannissement automatique.
    if (!softban && duration && duration > 0) {
      const { caseService } = await import('../../services/caseService');
      caseService.update(ctx.guild.id, result.caseEntry.caseNumber, {
        duration,
        expiresAt: Date.now() + duration,
        autoRevertAt: Date.now() + duration,
        metadata: { mode: 'tempban', temp: true },
      });

      const settings = guildService.get(ctx.guild.id);
      const embed = baseEmbed({
        title: '🔨 Bannissement temporaire appliqué',
        description: [
          `**Membre :** ${target.user.tag} (\`${target.id}\`)`,
          `**Durée :** ${formatDuration(duration)} → débannissement automatique`,
          `**Raison :** ${reason ?? 'Aucune raison fournie'}`,
          `**Case :** #${result.caseEntry.caseNumber}`,
        ].join('\n'),
        color: THEME.colors.warning,
        footer: settings.modules.logs && settings.channels.modLog ? `Logs envoyés dans #${ctx.guild.channels.cache.get(settings.channels.modLog)?.name ?? 'salon de logs'}` : undefined,
      });
      return ctx.send(embed);
    }

    return ctx.success('Bannissement effectué', result.message);
  },
};

export default banCommand;
