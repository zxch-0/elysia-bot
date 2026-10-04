import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember, type Role } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { antiRaidService } from '../../services/antiRaidService';
import { baseEmbed, THEME } from '../../ui/embeds';

const PUNISHMENT_LABEL: Record<string, string> = {
  none: 'aucune (alerte)',
  timeout: 'timeout',
  kick: 'expulsion',
  ban: 'bannissement',
};

function summarize(guildId: string): string {
  const settings = antiRaidService.getSettings(guildId);
  const state = settings.state;
  return [
    `**Protection :** ${settings.enabled ? '✅ active' : '❌ désactivée'}`,
    `**Verrouillage :** ${state.lockdownActive ? `🔒 actif${state.lockdownUntil ? ` jusqu’à <t:${Math.floor(state.lockdownUntil / 1000)}:t>` : ' (manuel)'} — ${state.lockdownReason}` : 'ouverture normale'}`,
    `**Arrivées :** ${settings.joins.threshold} membres / ${settings.joins.windowSeconds} s`,
    `**Salons :** ${settings.channels.threshold} / ${settings.channels.windowSeconds} s${settings.channels.deleteCreated ? ' (créations supprimées)' : ''}`,
    `**Rôles :** ${settings.roles.threshold} / ${settings.roles.windowSeconds} s${settings.roles.deleteCreated ? ' (créations supprimées)' : ''}`,
    `**Bannissements :** ${settings.bans.threshold} / ${settings.bans.windowSeconds} s`,
    `**Comptes récents (< ${settings.accountAge.days} j) :** ${PUNISHMENT_LABEL[settings.accountAge.action]} • pendant un raid : ${PUNISHMENT_LABEL[settings.accountAge.actionDuringRaid]}`,
    `**Anti-spam :** ${settings.spam.enabled ? `${settings.spam.messages} messages / ${settings.spam.windowSeconds} s → ${PUNISHMENT_LABEL[settings.spam.action]}` : 'désactivé'}`,
    `**Verrouillage auto :** ${settings.lockdown.auto ? `oui (${Math.round(settings.lockdown.durationSeconds / 60)} min)` : 'non'}`,
    `**Raids détectés :** ${state.detections}${state.lastDetectionAt ? ` — dernier : <t:${Math.floor(state.lastDetectionAt / 1000)}:R>` : ''}`,
  ].join('\n');
}

/** 🛡️ Protection anti-raid d’un serveur (pilotage complet depuis Discord). */
const antiRaidCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Protection anti-raid : état, seuils, verrouillage et liste de confiance')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('statut').setDescription('Affiche l’état de la protection anti-raid'))
    .addSubcommand((sub) => sub.setName('activer').setDescription('Active la protection anti-raid'))
    .addSubcommand((sub) => sub.setName('desactiver').setDescription('Désactive la protection anti-raid'))
    .addSubcommand((sub) =>
      sub
        .setName('seuils')
        .setDescription('Ajuste les seuils de détection')
        .addIntegerOption((option) =>
          option.setName('arrivees').setDescription('Membres autorisés par fenêtre avant alerte').setMinValue(2).setMaxValue(200),
        )
        .addIntegerOption((option) =>
          option.setName('fenetre_arrivees').setDescription('Fenêtre d’observation des arrivées (secondes)').setMinValue(2).setMaxValue(300),
        )
        .addIntegerOption((option) =>
          option.setName('salons').setDescription('Salons autorisés par fenêtre avant alerte').setMinValue(2).setMaxValue(50),
        )
        .addStringOption((option) =>
          option
            .setName('sanction_raid')
            .setDescription('Sanction appliquée aux comptes récents pendant un raid')
            .addChoices(
              { name: 'Aucune (alerte)', value: 'none' },
              { name: 'Timeout', value: 'timeout' },
              { name: 'Expulsion', value: 'kick' },
              { name: 'Bannissement', value: 'ban' },
            ),
        )
        .addBooleanOption((option) =>
          option.setName('anti_spam').setDescription('Activer la détection de spam de messages'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('verrouiller')
        .setDescription('Verrouille immédiatement tous les salons textuels')
        .addStringOption((option) => option.setName('raison').setDescription('Motif du verrouillage').setMaxLength(300))
        .addIntegerOption((option) =>
          option.setName('duree').setDescription('Durée en minutes (0 = jusqu’à levée manuelle)').setMinValue(0).setMaxValue(1440),
        ),
    )
    .addSubcommand((sub) => sub.setName('deverrouiller').setDescription('Lève le verrouillage et restaure les permissions'))
    .addSubcommand((sub) =>
      sub
        .setName('confiance')
        .setDescription('Ajoute/retire un membre ou un rôle de la liste de confiance (jamais sanctionné)')
        .addMentionableOption((option) => option.setName('cible').setDescription('Membre ou rôle à ajouter/retirer').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('test').setDescription('Teste la détection avec les seuils actuels (sans aucun effet)')),
  category: 'moderation',
  summary: 'Protection anti-raid (seuils, verrouillage, confiance)',
  usage: ['/antiraid statut', '/antiraid verrouiller raison:raid duree:10', '/antiraid confiance cible:@Modérateur'],
  permissions: {
    user: [PermissionFlagsBits.ManageGuild],
    bot: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],
  },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const guildId = ctx.guild.id;
    const sub = ctx.subcommand() ?? 'statut';

    if (sub === 'statut') {
      const settings = antiRaidService.getSettings(guildId);
      await ctx.send(
        baseEmbed({
          title: '🛡️ Protection anti-raid',
          description: summarize(guildId),
          color: settings.state.lockdownActive ? THEME.colors.error : settings.enabled ? THEME.colors.success : THEME.colors.warning,
          footer: 'Elysia • /antiraid — configuration complète dans l’onglet admin',
        }),
      );
      return;
    }

    if (sub === 'activer' || sub === 'desactiver') {
      const enabled = sub === 'activer';
      antiRaidService.saveSettings(guildId, { enabled }, `${ctx.interaction.user.tag}`);
      await ctx.success(
        enabled ? 'Protection anti-raid activée' : 'Protection anti-raid désactivée',
        enabled ? 'Les vagues d’arrivées et de créations sont désormais surveillées.' : '⚠️ Le serveur n’est plus protégé automatiquement.',
      );
      return;
    }

    if (sub === 'seuils') {
      const arrivees = ctx.integer('arrivees');
      const fenetre = ctx.integer('fenetre_arrivees');
      const salons = ctx.integer('salons');
      const sanction = ctx.string('sanction_raid');
      const antiSpam = ctx.boolean('anti_spam');
      const current = antiRaidService.getSettings(guildId);

      antiRaidService.saveSettings(
        guildId,
        {
          joins: { windowSeconds: fenetre ?? current.joins.windowSeconds, threshold: arrivees ?? current.joins.threshold },
          channels: { ...current.channels, threshold: salons ?? current.channels.threshold },
          accountAge: {
            ...current.accountAge,
            actionDuringRaid: (sanction as 'none' | 'timeout' | 'kick' | 'ban' | null) ?? current.accountAge.actionDuringRaid,
          },
          spam: { ...current.spam, enabled: antiSpam ?? current.spam.enabled },
        },
        ctx.interaction.user.tag,
      );

      await ctx.success('Seuils mis à jour', summarize(guildId));
      return;
    }

    if (sub === 'verrouiller') {
      const reason = ctx.string('raison');
      const duration = ctx.integer('duree');
      const result = await antiRaidService.lockdown(ctx.guild, {
        reason: reason ?? `Verrouillage demandé par ${ctx.interaction.user.tag}`,
        durationSeconds: (duration ?? 10) * 60,
        by: ctx.interaction.user.tag,
      });
      if (!result.ok) {
        await ctx.error(result.error ?? 'Verrouillage impossible.');
        return;
      }
      await ctx.send(
        baseEmbed({
          title: '🔒 Serveur verrouillé',
          description: [
            `**Salons :** ${result.channels}`,
            `**Durée :** ${duration === 0 ? 'jusqu’à levée manuelle' : `${duration ?? 10} min`}`,
            'Utilisez `/antiraid deverrouiller` pour restaurer les permissions d’origine.',
          ].join('\n'),
          color: THEME.colors.error,
        }),
      );
      return;
    }

    if (sub === 'deverrouiller') {
      const result = await antiRaidService.release(ctx.guild, { reason: `Levée par ${ctx.interaction.user.tag}`, by: ctx.interaction.user.tag });
      await ctx.success('🔓 Serveur déverrouillé', `${result.channels} salon(s) restauré(s) à l’identique.`);
      return;
    }

    if (sub === 'confiance') {
      const target = ctx.interaction.options.getMentionable('cible', true) as GuildMember | Role;
      const settings = antiRaidService.getSettings(guildId);
      const isRole = 'name' in target && !('user' in target);
      const list = isRole ? settings.trusted.roleIds : settings.trusted.userIds;
      const id = target.id;
      const already = list.includes(id);
      const next = already ? list.filter((entry) => entry !== id) : [...list, id];

      antiRaidService.saveSettings(
        guildId,
        { trusted: isRole ? { ...settings.trusted, roleIds: next } : { ...settings.trusted, userIds: next } },
        ctx.interaction.user.tag,
      );

      await ctx.success(
        already ? 'Retiré de la liste de confiance' : 'Ajouté à la liste de confiance',
        `${isRole ? 'Rôle' : 'Membre'} concerné : **${'name' in target ? target.name : target.user.tag}** — les membres de confiance ne sont jamais sanctionnés par l’anti-raid.`,
      );
      return;
    }

    // sub === 'test'
    const types = ['arrivees', 'salons', 'roles', 'bans', 'spam'] as const;
    const lines = types.map((type) => {
      const result = antiRaidService.test(guildId, type);
      return `${result.detected ? '🚨' : '✅'} ${result.explain}`;
    });
    await ctx.send(
      baseEmbed({
        title: '🧪 Test de détection (aucun effet réel)',
        description: lines.join('\n\n'),
        color: THEME.colors.info,
        footer: 'Elysia • anti-raid',
      }),
    );
  },
};

export default antiRaidCommand;
