import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { guildService, type GuildSettings } from '../../services/guildService';
import { baseEmbed, THEME, errorEmbed, successEmbed, warningEmbed } from '../../ui/embeds';
import { bulletList, humanizeNumber } from '../../utils/format';
import { parseDuration, formatDuration } from '../../utils/duration';
import { confirmRow } from '../../ui/components';
import { registerConfirmation } from '../../modules/confirmationModule';
import { shortCode } from '../../utils/random';
import { RECOMMENDED_PERMISSIONS, formatPermissionName, isTextChannel } from '../../utils/permissions';
import { UsageError } from '../../core/errors';

const MODULE_CHOICES = [
  { name: '🛡️ Modération (ban, mute, warn…)', value: 'moderation' },
  { name: '🎁 Giveaways', value: 'giveaways' },
  { name: '🎭 Panneaux de rôles', value: 'rolePanels' },
  { name: '📁 Logs (modération, messages, membres)', value: 'logs' },
  { name: '👋 Messages de bienvenue', value: 'welcome' },
  { name: '⚙️ Rôles automatiques', value: 'autoRole' },
  { name: '🎮 Mini-jeux', value: 'games' },
  { name: '📈 Niveaux & XP', value: 'levels' },
  { name: '🎂 Anniversaires', value: 'birthdays' },
  { name: '💡 Suggestions', value: 'suggestions' },
] as const;

/** Diagnostic de santé du serveur : permissions, salons, hiérarchie des rôles. */
function buildHealthReport(ctx: CommandContext): string[] {
  const problems: string[] = [];
  const bot = ctx.guild.members.me;

  if (!bot) return ['❌ Le bot n’est pas dans le cache du serveur — réinvitez-le.'];
  if (bot.roles.highest.position <= 1) {
    problems.push('❌ Le rôle du bot est tout en bas : la modération et les rôles ne fonctionneront pas.');
  }

  const missing = RECOMMENDED_PERMISSIONS.filter((permission) => !bot.permissions.has(permission)).map((permission) =>
    formatPermissionName(permission),
  );
  if (missing.length > 0) problems.push(`❌ Permissions manquantes : ${missing.join(', ')}`);

  const settings = ctx.settings;
  if (settings.channels.modLog && !ctx.guild.channels.cache.get(settings.channels.modLog)) {
    problems.push('❌ Le salon de logs de modération configuré n’existe plus.');
  }
  if (settings.mute.mode === 'role' && !settings.roles.mute) {
    problems.push('❌ Mode de mute « rôle » actif mais aucun rôle muet configuré (`/config role-muet`).');
  }
  if (settings.mute.mode === 'role' && settings.roles.mute && !ctx.guild.roles.cache.get(settings.roles.mute)) {
    problems.push('❌ Le rôle muet configuré a été supprimé.');
  }

  const silentChannels = [...ctx.guild.channels.cache.values()].filter(
    (channel) =>
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
      !channel.permissionsFor(bot)?.has(PermissionFlagsBits.SendMessages),
  );
  if (silentChannels.length > 0) {
    problems.push(`⚠️ ${silentChannels.length} salon(s) où je ne peux pas écrire (les logs/panneaux y échoueront).`);
  }

  if (problems.length === 0) problems.push('✅ Tout est correctement configuré — le bot est pleinement opérationnel !');
  return problems;
}

export function renderConfig(settings: GuildSettings): string {
  const mentionChannel = (id?: string | null) => (id ? `<#${id}>` : '❌ non configuré');
  const mentionRole = (id?: string | null) => (id ? `<@&${id}>` : '❌ non configuré');
  const roles = (ids: string[]) => (ids.length > 0 ? ids.map((id) => `<@&${id}>`).join(', ') : '❌ aucun');

  return [
    `**Modules :** ${Object.entries(settings.modules)
      .map(([key, enabled]) => `${enabled ? '🟢' : '🔴'} \`${key}\``)
      .join(' ')}`,
    '',
    '**📁 Salons**',
    bulletList([
      `Logs modération : ${mentionChannel(settings.channels.modLog)}`,
      `Logs messages : ${mentionChannel(settings.channels.messageLog)}`,
      `Logs membres : ${mentionChannel(settings.channels.memberLog)}`,
      `Bienvenue : ${mentionChannel(settings.channels.welcome)}`,
      `Départs : ${mentionChannel(settings.channels.goodbye)}`,
      `Anniversaires : ${mentionChannel(settings.channels.birthday)}`,
      `Montées de niveau : ${mentionChannel(settings.channels.levelUp)}`,
      `Suggestions : ${mentionChannel(settings.channels.suggestions)}`,
    ]),
    '',
    '**🎭 Rôles**',
    bulletList([
      `Rôle muet : ${mentionRole(settings.roles.mute)}`,
      `Rôles automatiques : ${roles(settings.roles.autoRoles)}`,
      `Rôles staff : ${roles(settings.roles.staff)}`,
      `Hôtes de giveaway : ${roles(settings.roles.giveawayHosts)}`,
      `Rôles blacklistés (giveaway) : ${roles(settings.giveaway.blacklistedRoleIds)}`,
    ]),
    '',
    '**🔇 Mute**',
    bulletList([
      `Mode : \`${settings.mute.mode}\` (${settings.mute.mode === 'timeout' ? 'timeout natif Discord' : 'rôle muet'})`,
      `Durée par défaut : ${formatDuration(settings.mute.defaultDuration)}`,
    ]),
    '',
    '**⚠️ Seuils d’avertissements**',
    bulletList(
      settings.warnings.thresholds.map(
        (threshold) =>
          `${threshold.count} avertissement(s) → \`${threshold.action}\`${threshold.duration ? ` (${formatDuration(threshold.duration)})` : ''}`,
      ),
      { emptyText: 'aucun seuil configuré' },
    ),
    '',
    '**🎁 Giveaways**',
    bulletList([
      `Durée par défaut : ${formatDuration(settings.giveaway.defaultDuration)}`,
      `Gagnants par défaut : ${settings.giveaway.defaultWinners}`,
      `Âge de compte minimum : ${settings.giveaway.requireAccountAge} jour(s)`,
      `Ancienneté membre minimum : ${settings.giveaway.requireMemberSince} jour(s)`,
      `MP aux gagnants : ${settings.giveaway.dmWinners ? 'oui' : 'non'}`,
    ]),
    '',
    '',
    '**📈 Niveaux & XP**',
    bulletList([
      `Module : ${settings.modules.levels && settings.levels.enabled ? '🟢 actif' : '🔴 inactif'}`,
      `XP par message : ${settings.levels.xpMin} à ${settings.levels.xpMax}`,
      `Délai anti-spam : ${Math.round(settings.levels.cooldownMs / 1_000)} s`,
      `Annonces de niveau : ${settings.levels.announce ? 'oui' : 'non'}`,
      `Rôles de récompense : ${settings.levels.rewards.length > 0 ? settings.levels.rewards.map((reward) => `niv. ${reward.level} → <@&${reward.roleId}>`).join(', ') : 'aucun'}`,
    ]),
    '',
    '**🎉 Communauté**',
    bulletList([
      `Anniversaires annoncés : ${settings.community.birthdays.announce ? 'oui' : 'non'}`,
      `Suggestions anonymes par défaut : ${settings.community.suggestions.anonymousByDefault ? 'oui' : 'non'}`,
      `Fils de discussion sous les suggestions : ${settings.community.suggestions.createThreads ? 'oui' : 'non'}`,
    ]),
    '',
    `**Compteurs :** ${humanizeNumber(settings.counters.caseId)} case(s) • ${humanizeNumber(settings.counters.giveawayId)} giveaway(s) • ${humanizeNumber(settings.counters.suggestionId)} suggestion(s)`,
  ].join('\n');
}

/** Configuration complète du serveur, organisée par sous-commandes. */
const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure Elysia sur ce serveur (salons, rôles, modules, seuils…)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('voir').setDescription('Affiche la configuration actuelle'))
    .addSubcommand((sub) => sub.setName('salut').setDescription('Diagnostic : vérifie permissions, salons et hiérarchie des rôles'))
    .addSubcommand((sub) =>
      sub
        .setName('convivialite')
        .setDescription('Configuration guidée en une commande (recommandé pour débuter)')
        .addChannelOption((option) => option.setName('logs_moderation').setDescription('Salon des sanctions').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option.setName('logs_messages').setDescription('Salon des messages supprimés/modifiés').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option.setName('logs_membres').setDescription('Salon des arrivées/départs').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option.setName('bienvenue').setDescription('Salon des messages de bienvenue').addChannelTypes(ChannelType.GuildText))
        .addChannelOption((option) => option.setName('departs').setDescription('Salon des messages de départ').addChannelTypes(ChannelType.GuildText))
        .addRoleOption((option) => option.setName('role_muet').setDescription('Rôle appliqué par /mute mode:role'))
        .addRoleOption((option) => option.setName('role_auto').setDescription('Rôle donné automatiquement à l’arrivée'))
        .addRoleOption((option) => option.setName('role_staff').setDescription('Rôle autorisé à utiliser les commandes d’administration'))
        .addRoleOption((option) => option.setName('role_hote').setDescription('Rôle autorisé à lancer des giveaways')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('salon')
        .setDescription('Définit un salon spécifique')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Type de salon à configurer')
            .setRequired(true)
            .addChoices(
              { name: 'Logs modération', value: 'modLog' },
              { name: 'Logs messages', value: 'messageLog' },
              { name: 'Logs membres', value: 'memberLog' },
              { name: 'Bienvenue', value: 'welcome' },
              { name: 'Départs', value: 'goodbye' },
              { name: 'Anniversaires', value: 'birthday' },
              { name: 'Montées de niveau', value: 'levelUp' },
              { name: 'Suggestions', value: 'suggestions' },
            ),
        )
        .addChannelOption((option) => option.setName('salon').setDescription('Salon cible (« aucun » pour désactiver)').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('role-muet')
        .setDescription('Définit (ou crée) le rôle muet utilisé par /mute mode:role')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle muet existant'))
        .addBooleanOption((option) => option.setName('creer').setDescription('Créer un rôle « Muted » avec les bonnes permissions')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles-staff')
        .setDescription('Gère les rôles autorisés à administrer le bot')
        .addStringOption((option) =>
          option.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Ajouter', value: 'ajouter' }, { name: 'Retirer', value: 'retirer' }, { name: 'Vider', value: 'vider' }),
        )
        .addRoleOption((option) => option.setName('role').setDescription('Rôle concerné')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles-hotes')
        .setDescription('Gère les rôles autorisés à lancer des giveaways')
        .addStringOption((option) =>
          option.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Ajouter', value: 'ajouter' }, { name: 'Retirer', value: 'retirer' }, { name: 'Vider', value: 'vider' }),
        )
        .addRoleOption((option) => option.setName('role').setDescription('Rôle concerné')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('modules')
        .setDescription('Active ou désactive un module du bot')
        .addStringOption((option) => option.setName('module').setDescription('Module concerné').setRequired(true).addChoices(...MODULE_CHOICES))
        .addBooleanOption((option) => option.setName('actif').setDescription('Activer (true) ou désactiver (false)').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mute-mode')
        .setDescription('Choisit le mécanisme de mute et la durée par défaut')
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Mode de mute')
            .addChoices(
              { name: 'Timeout Discord (max 28 j)', value: 'timeout' },
              { name: 'Rôle muet (durée illimitée)', value: 'role' },
            ),
        )
        .addStringOption((option) => option.setName('duree').setDescription('Durée par défaut (ex. 10m, 1h, 1j)').setMaxLength(24)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('seuils')
        .setDescription('Configure les sanctions automatiques par palier d’avertissements')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Action à effectuer')
            .setRequired(true)
            .addChoices({ name: 'Ajouter un palier', value: 'ajouter' }, { name: 'Retirer un palier', value: 'retirer' }, { name: 'Tout effacer', value: 'vider' }),
        )
        .addIntegerOption((option) => option.setName('nombre').setDescription('Nombre d’avertissements déclencheur').setMinValue(1).setMaxValue(50))
        .addStringOption((option) =>
          option
            .setName('sanction')
            .setDescription('Sanction appliquée')
            .addChoices({ name: 'Mute', value: 'mute' }, { name: 'Expulsion', value: 'kick' }, { name: 'Bannissement', value: 'ban' }),
        )
        .addStringOption((option) => option.setName('duree').setDescription('Durée (mute uniquement, ex. 1h)').setMaxLength(24)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('giveaway')
        .setDescription('Règle les paramètres par défaut des giveaways')
        .addIntegerOption((option) => option.setName('gagnants').setDescription('Nombre de gagnants par défaut').setMinValue(1).setMaxValue(50))
        .addStringOption((option) => option.setName('duree').setDescription('Durée par défaut (ex. 24h, 3j)').setMaxLength(24))
        .addIntegerOption((option) => option.setName('age_compte').setDescription('Âge de compte minimum en jours').setMinValue(0).setMaxValue(365))
        .addIntegerOption((option) => option.setName('anciennete').setDescription('Ancienneté membre minimum en jours').setMinValue(0).setMaxValue(365))
        .addBooleanOption((option) => option.setName('mp_gagnants').setDescription('Prévenir les gagnants par MP')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('blacklist')
        .setDescription('Rôles exclus des giveaways (bots, comptes secondaires…)')
        .addStringOption((option) =>
          option.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Ajouter', value: 'ajouter' }, { name: 'Retirer', value: 'retirer' }, { name: 'Vider', value: 'vider' }),
        )
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à exclure')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bienvenue')
        .setDescription('Personnalise le message de bienvenue')
        .addStringOption((option) =>
          option.setName('message').setDescription('Variables : {mention} {user} {server} {membercount}').setMaxLength(1000),
        )
        .addStringOption((option) => option.setName('couleur').setDescription('Couleur de l’embed (#8b5cf6)').setMaxLength(7))
        .addBooleanOption((option) => option.setName('actif').setDescription('Activer les messages de bienvenue'))
        .addBooleanOption((option) => option.setName('embed').setDescription('Afficher un embed (sinon message simple)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('depart')
        .setDescription('Personnalise le message de départ')
        .addStringOption((option) => option.setName('message').setDescription('Variables : {user} {server} {membercount}').setMaxLength(1000))
        .addBooleanOption((option) => option.setName('actif').setDescription('Activer les messages de départ')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('niveaux')
        .setDescription('Règle le système d’XP et de niveaux')
        .addBooleanOption((option) => option.setName('actif').setDescription('Activer le gain d’XP en discutant'))
        .addBooleanOption((option) => option.setName('annonce').setDescription('Annoncer les montées de niveau'))
        .addIntegerOption((option) => option.setName('xp_min').setDescription('XP minimum gagné par message').setMinValue(1).setMaxValue(200))
        .addIntegerOption((option) => option.setName('xp_max').setDescription('XP maximum gagné par message').setMinValue(1).setMaxValue(300))
        .addIntegerOption((option) => option.setName('delai').setDescription('Délai minimum entre deux gains, en secondes').setMinValue(5).setMaxValue(3_600)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('niveau-role')
        .setDescription('Attribue un rôle automatiquement à partir d’un niveau')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Action à effectuer')
            .setRequired(true)
            .addChoices({ name: 'Ajouter', value: 'ajouter' }, { name: 'Retirer', value: 'retirer' }, { name: 'Vider', value: 'vider' }),
        )
        .addIntegerOption((option) => option.setName('niveau').setDescription('Niveau déclencheur').setMinValue(1).setMaxValue(500))
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à attribuer')),
    )
    .addSubcommand((sub) => sub.setName('reset').setDescription('Réinitialise toute la configuration du serveur (confirmation requise)')),
  category: 'config',
  summary: 'Configuration complète du serveur',
  usage: ['/config convivialite logs_moderation:#logs role_muet:@Muted', '/config voir', '/config salut'],
  permissions: { user: [PermissionFlagsBits.ManageGuild], bot: [PermissionFlagsBits.ManageRoles] },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'voir';
    const settings = guildService.get(ctx.guild.id);

    // ── Voir ───────────────────────────────────────────────────────────────
    if (sub === 'voir') {
      return ctx.send(
        baseEmbed({
          title: '🛠️ Configuration d’Elysia',
          description: renderConfig(settings),
          color: THEME.colors.primary,
          thumbnail: ctx.guild.iconURL({ size: 128 }),
          footer: `Serveur ${ctx.guild.name} • /config convivialite pour tout régler d’un coup`,
        }),
      );
    }

    // ── Diagnostic ─────────────────────────────────────────────────────────
    if (sub === 'salut') {
      const report = buildHealthReport(ctx);
      const ok = report.every((line) => line.startsWith('✅'));
      const embed = baseEmbed({
        title: '🩺 Diagnostic du serveur',
        description: report.join('\n'),
        color: ok ? THEME.colors.success : THEME.colors.warning,
        footer: ok ? 'Tout est prêt !' : 'Corrigez les points ci-dessus pour un fonctionnement optimal',
      });
      embed.addFields({
        name: 'Rappel des commandes utiles',
        value: ['`/config convivialite` — configuration guidée', '`/rolepanel creer` — panneau de rôles', '`/giveaway creer` — giveaway'].join('\n'),
      });
      return ctx.send(embed);
    }

    // ── Configuration guidée ───────────────────────────────────────────────
    if (sub === 'convivialite') {
      const channels: Record<string, string | null> = {};
      const roles: Record<string, string | string[] | null> = {};

      const mapping: Array<[string, string]> = [
        ['logs_moderation', 'modLog'],
        ['logs_messages', 'messageLog'],
        ['logs_membres', 'memberLog'],
        ['bienvenue', 'welcome'],
        ['departs', 'goodbye'],
      ];
      for (const [optionName, key] of mapping) {
        const channel = ctx.interaction.options.getChannel(optionName);
        if (channel) channels[key] = channel.id;
      }

      const roleMuet = ctx.interaction.options.getRole('role_muet');
      const roleAuto = ctx.interaction.options.getRole('role_auto');
      const roleStaff = ctx.interaction.options.getRole('role_staff');
      const roleHote = ctx.interaction.options.getRole('role_hote');
      if (roleMuet) roles.mute = roleMuet.id;
      if (roleAuto) roles.autoRoles = [roleAuto.id];
      if (roleStaff) roles.staff = [roleStaff.id];
      if (roleHote) roles.giveawayHosts = [roleHote.id];

      if (Object.keys(channels).length === 0 && Object.keys(roles).length === 0) {
        throw new UsageError('Renseignez au moins un salon ou un rôle à configurer (ou utilisez `/config voir`).');
      }

      // On n'active que les modules correspondant aux options fournies :
      // configurer uniquement la bienvenue ne doit pas couper les logs.
      const modules: Record<string, boolean> = {};
      if (channels.welcome) modules.welcome = true;
      if (channels.goodbye) modules.goodbye = true;
      if (channels.modLog || channels.messageLog || channels.memberLog) modules.logs = true;
      if (roleAuto) modules.autoRole = true;

      const updated = guildService.update(ctx.guild.id, {
        channels,
        roles,
        ...(Object.keys(modules).length > 0 ? { modules } : {}),
      } as never);

      const embed = successEmbed(
        'Configuration appliquée',
        [
          'Voici l’état après mise à jour :',
          '',
          renderConfig(updated),
          '',
          '➜ Lancez `/config salut` pour vérifier que tout est bon !',
        ].join('\n'),
      );
      return ctx.send(embed);
    }

    // ── Salons ─────────────────────────────────────────────────────────────
    if (sub === 'salon') {
      const type = ctx.string('type') as
        | 'modLog'
        | 'messageLog'
        | 'memberLog'
        | 'welcome'
        | 'goodbye'
        | 'birthday'
        | 'levelUp'
        | 'suggestions';
      const channel = ctx.interaction.options.getChannel('salon');
      const updated = guildService.update(ctx.guild.id, { channels: { [type]: channel?.id ?? null } } as never);
      return ctx.send(
        successEmbed(
          channel ? 'Salon enregistré' : 'Salon désactivé',
          channel
            ? `Les événements **${type}** seront désormais envoyés dans <#${channel.id}>.`
            : `Le salon **${type}** a été retiré de la configuration.\nÉtat : ${renderConfig(updated).split('\n').slice(0, 1).join('')}`,
        ),
      );
    }

    // ── Rôle muet ──────────────────────────────────────────────────────────
    if (sub === 'role-muet') {
      const create = ctx.interaction.options.getBoolean('creer') ?? false;
      let role = ctx.interaction.options.getRole('role');

      if (!role && create) {
        role = await ctx.guild.roles.create({
          name: 'Muted',
          color: 0x808080,
          reason: `Création du rôle muet par ${ctx.interaction.user.tag}`,
          permissions: [],
        });
        // Réplique les permissions « muet » sur tous les salons textuels.
        for (const channel of ctx.guild.channels.cache.values()) {
          if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) continue;
          await (channel as TextChannel).permissionOverwrites
            .edit(role, {
              SendMessages: false,
              AddReactions: false,
              Speak: false,
              SendMessagesInThreads: false,
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
            })
            .catch(() => undefined);
        }
      }

      if (!role) throw new UsageError('Indiquez un rôle existant (`role:@Muted`) ou utilisez `creer:true`.');

      guildService.update(ctx.guild.id, { roles: { mute: role.id }, mute: { mode: 'role' } } as never);
      return ctx.send(
        successEmbed(
          'Rôle muet configuré',
          [
            `Le rôle muet est désormais ${role}.`,
            'Le mode de mute par défaut a été basculé sur `role` (durée illimitée possible).',
            '',
            'Pour repasser au timeout natif : `/config mute-mode mode:timeout`.',
          ].join('\n'),
        ),
      );
    }

    // ── Rôles staff / hôtes ────────────────────────────────────────────────
    if (sub === 'roles-staff' || sub === 'roles-hotes') {
      const isStaff = sub === 'roles-staff';
      const action = ctx.string('action');
      const role = ctx.interaction.options.getRole('role');
      const current = isStaff ? settings.roles.staff : settings.roles.giveawayHosts;

      if (action === 'vider') {
        guildService.update(ctx.guild.id, { roles: isStaff ? { staff: [] } : { giveawayHosts: [] } } as never);
        return ctx.send(successEmbed('Liste vidée', 'Aucun rôle personnalisé n’est plus autorisé (seuls les administrateurs le sont).'));
      }
      if (!role) throw new UsageError('Précisez un `role:` pour cette action.');

      const next = action === 'ajouter' ? [...new Set([...current, role.id])] : current.filter((id) => id !== role.id);
      guildService.update(ctx.guild.id, { roles: isStaff ? { staff: next } : { giveawayHosts: next } } as never);

      return ctx.send(
        successEmbed(
          action === 'ajouter' ? 'Rôle ajouté' : 'Rôle retiré',
          [
            `${role} ${action === 'ajouter' ? 'peut désormais' : 'ne peut plus'} ${isStaff ? 'utiliser les commandes de configuration' : 'lancer des giveaways'}.`,
            `**Liste actuelle :** ${next.length > 0 ? next.map((id) => `<@&${id}>`).join(', ') : 'vide'}`,
          ].join('\n'),
        ),
      );
    }

    // ── Modules ────────────────────────────────────────────────────────────
    if (sub === 'modules') {
      const module = ctx.string('module') as keyof GuildSettings['modules'];
      const active = ctx.boolean('actif');
      const updated = guildService.update(ctx.guild.id, { modules: { [module]: active } } as never);
      return ctx.send(
        successEmbed(
          active ? 'Module activé' : 'Module désactivé',
          `Le module \`${module}\` est maintenant **${active ? 'actif' : 'inactif'}**.\n\n**Modules :** ${Object.entries(updated.modules)
            .map(([key, enabled]) => `${enabled ? '🟢' : '🔴'} \`${key}\``)
            .join(' ')}`,
        ),
      );
    }

    // ── Mode de mute ───────────────────────────────────────────────────────
    if (sub === 'mute-mode') {
      const mode = ctx.interaction.options.getString('mode') as 'timeout' | 'role' | null;
      const durationRaw = ctx.interaction.options.getString('duree');
      const patch: Record<string, unknown> = {};
      if (mode) patch.mode = mode;
      if (durationRaw) {
        const parsed = parseDuration(durationRaw);
        if (parsed === null || parsed <= 0) throw new UsageError('Durée invalide (ex. `10m`, `1h`, `1j`).');
        patch.defaultDuration = parsed;
      }
      if (Object.keys(patch).length === 0) throw new UsageError('Précisez `mode:` ou `duree:`.');

      if (patch.mode === 'role' && !settings.roles.mute) {
        return ctx.send(
          warningEmbed(
            'Rôle muet requis',
            'Configurez d’abord un rôle muet : `/config role-muet creer:true`, puis relancez cette commande.',
          ),
        );
      }

      const updated = guildService.update(ctx.guild.id, { mute: patch } as never);
      return ctx.send(
        successEmbed(
          'Paramètres de mute mis à jour',
          `Mode : **${updated.mute.mode}** • Durée par défaut : **${formatDuration(updated.mute.defaultDuration)}**`,
        ),
      );
    }

    // ── Seuils d'avertissements ────────────────────────────────────────────
    if (sub === 'seuils') {
      const action = ctx.string('action');
      if (action === 'vider') {
        guildService.update(ctx.guild.id, { warnings: { thresholds: [] } } as never);
        return ctx.send(warningEmbed('Seuils supprimés', 'Aucune sanction automatique ne sera plus déclenchée par les avertissements.'));
      }

      const count = ctx.interaction.options.getInteger('nombre');
      const sanction = ctx.interaction.options.getString('sanction') as 'mute' | 'kick' | 'ban' | null;
      if (!count) throw new UsageError('Précisez `nombre:` (nombre d’avertissements déclencheur).');

      if (action === 'retirer') {
        const next = settings.warnings.thresholds.filter((threshold) => threshold.count !== count);
        guildService.update(ctx.guild.id, { warnings: { thresholds: next } } as never);
        return ctx.send(successEmbed('Palier retiré', `Le palier de ${count} avertissement(s) a été supprimé.`));
      }

      if (!sanction) throw new UsageError('Précisez `sanction:` (mute, kick ou ban).');
      const durationRaw = ctx.interaction.options.getString('duree');
      const duration = durationRaw ? parseDuration(durationRaw) ?? undefined : sanction === 'mute' ? 3_600_000 : undefined;
      if (durationRaw && duration === null) throw new UsageError('Durée invalide (ex. `1h`, `1j`).');

      const next = [
        ...settings.warnings.thresholds.filter((threshold) => threshold.count !== count),
        { count, action: sanction, duration: duration ?? undefined },
      ].sort((a, b) => a.count - b.count);
      guildService.update(ctx.guild.id, { warnings: { thresholds: next } } as never);

      return ctx.send(
        successEmbed(
          'Palier enregistré',
          [
            `À **${count} avertissement(s)**, le bot appliquera : **${sanction}**${duration ? ` pendant ${formatDuration(duration)}` : ''}.`,
            '',
            '**Paliers configurés :**',
            bulletList(
              next.map((threshold) => `${threshold.count} → ${threshold.action}${threshold.duration ? ` (${formatDuration(threshold.duration)})` : ''}`),
              { emptyText: 'aucun' },
            ),
          ].join('\n'),
        ),
      );
    }

    // ── Paramètres des giveaways ───────────────────────────────────────────
    if (sub === 'giveaway') {
      const patch: Record<string, unknown> = {};
      const winners = ctx.interaction.options.getInteger('gagnants');
      const durationRaw = ctx.interaction.options.getString('duree');
      const accountAge = ctx.interaction.options.getInteger('age_compte');
      const memberSince = ctx.interaction.options.getInteger('anciennete');
      const dmWinners = ctx.interaction.options.getBoolean('mp_gagnants');

      if (winners !== null) patch.defaultWinners = winners;
      if (accountAge !== null) patch.requireAccountAge = accountAge;
      if (memberSince !== null) patch.requireMemberSince = memberSince;
      if (dmWinners !== null) patch.dmWinners = dmWinners;
      if (durationRaw) {
        const parsed = parseDuration(durationRaw);
        if (parsed === null || parsed <= 0) throw new UsageError('Durée invalide (ex. `24h`, `3j`).');
        patch.defaultDuration = parsed;
      }
      if (Object.keys(patch).length === 0) throw new UsageError('Renseignez au moins une option à modifier.');

      guildService.update(ctx.guild.id, { giveaway: patch } as never);
      return ctx.send(successEmbed('Paramètres de giveaway mis à jour', renderConfig(guildService.get(ctx.guild.id)).split('**🎁 Giveaways**')[1] ?? ''));
    }

    // ── Blacklist giveaway ─────────────────────────────────────────────────
    if (sub === 'blacklist') {
      const action = ctx.string('action');
      const role = ctx.interaction.options.getRole('role');
      const current = settings.giveaway.blacklistedRoleIds;

      if (action === 'vider') {
        guildService.update(ctx.guild.id, { giveaway: { blacklistedRoleIds: [] } } as never);
        return ctx.send(successEmbed('Blacklist vidée', 'Plus aucun rôle n’est exclu des giveaways.'));
      }
      if (!role) throw new UsageError('Précisez un `role:`.');

      const next = action === 'ajouter' ? [...new Set([...current, role.id])] : current.filter((id) => id !== role.id);
      guildService.update(ctx.guild.id, { giveaway: { blacklistedRoleIds: next } } as never);
      return ctx.send(
        successEmbed(
          'Blacklist mise à jour',
          `**Rôles exclus :** ${next.length > 0 ? next.map((id) => `<@&${id}>`).join(', ') : 'aucun'}`,
        ),
      );
    }

    // ── Bienvenue / départ ─────────────────────────────────────────────────
    if (sub === 'bienvenue' || sub === 'depart') {
      const message = ctx.interaction.options.getString('message');
      const isWelcome = sub === 'bienvenue';
      const patch: Record<string, unknown> = {};

      if (message) patch.message = message;
      if (isWelcome) {
        const active = ctx.interaction.options.getBoolean('actif');
        const embedMode = ctx.interaction.options.getBoolean('embed');
        const color = ctx.interaction.options.getString('couleur');
        if (active !== null) patch.enabled = active;
        if (embedMode !== null) patch.embed = embedMode;
        if (color) {
          const hex = color.replace('#', '');
          if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new UsageError('Couleur invalide : format `#8b5cf6`.');
          patch.color = Number.parseInt(hex, 16);
        }
      } else {
        const active = ctx.interaction.options.getBoolean('actif');
        if (active !== null) patch.enabled = active;
      }

      if (Object.keys(patch).length === 0) throw new UsageError('Renseignez `message:`, `actif:` ou `couleur:`.');

      guildService.update(ctx.guild.id, isWelcome ? { welcome: patch } : { goodbye: patch } as never);
      const embed = baseEmbed({
        title: isWelcome ? '👋 Message de bienvenue mis à jour' : '📤 Message de départ mis à jour',
        description: `**Aperçu :**\n${message ?? (isWelcome ? settings.welcome.message : settings.goodbye.message)}`,
        color: THEME.colors.success,
        footer: `Variables disponibles : {mention} {user} {server} {membercount}`,
      });
      embed.addFields({
        name: 'Rappel',
        value: `Le message est envoyé dans ${
          isWelcome
            ? settings.channels.welcome
              ? `<#${settings.channels.welcome}>`
              : '**aucun salon configuré**'
            : settings.channels.goodbye
              ? `<#${settings.channels.goodbye}>`
              : '**aucun salon configuré**'
        } — configurez-le avec \`/config salon\`.`,
      });
      return ctx.send(embed);
    }

    // ── Système de niveaux ─────────────────────────────────────────────────
    if (sub === 'niveaux') {
      const active = ctx.interaction.options.getBoolean('actif');
      const announce = ctx.interaction.options.getBoolean('annonce');
      const xpMin = ctx.interaction.options.getInteger('xp_min');
      const xpMax = ctx.interaction.options.getInteger('xp_max');
      const delay = ctx.interaction.options.getInteger('delai');

      const patch: Record<string, unknown> = {};
      if (active !== null) patch.enabled = active;
      if (announce !== null) patch.announce = announce;
      if (xpMin !== null) patch.xpMin = xpMin;
      if (xpMax !== null) patch.xpMax = xpMax;
      if (delay !== null) patch.cooldownMs = delay * 1_000;
      if (Object.keys(patch).length === 0) throw new UsageError('Renseignez au moins une option (`actif`, `annonce`, `xp_min`, `xp_max`, `delai`).');

      const merged = { ...settings.levels, ...patch } as GuildSettings['levels'];
      if (merged.xpMax < merged.xpMin) throw new UsageError('`xp_max` doit être supérieur ou égal à `xp_min`.');

      const updated = guildService.update(ctx.guild.id, { levels: patch } as never);
      const modules = guildService.update(ctx.guild.id, { modules: { levels: merged.enabled } } as never);
      return ctx.send(
        successEmbed(
          'Système de niveaux mis à jour',
          [
            `**Gain d’XP :** ${updated.levels.xpMin} à ${updated.levels.xpMax} par message`,
            `**Délai anti-spam :** ${Math.round(updated.levels.cooldownMs / 1_000)} s`,
            `**Annonces :** ${updated.levels.announce ? 'oui' : 'non'}`,
            `**Module :** ${modules.modules.levels ? '🟢 actif' : '🔴 inactif'}`,
            '',
            'Consultez le classement avec `/niveau classement`.',
          ].join('\n'),
        ),
      );
    }

    if (sub === 'niveau-role') {
      const action = ctx.string('action');
      const current = settings.levels.rewards;

      if (action === 'vider') {
        guildService.update(ctx.guild.id, { levels: { rewards: [] } } as never);
        return ctx.send(successEmbed('Récompenses supprimées', 'Plus aucun rôle ne sera attribué automatiquement par niveau.'));
      }

      const level = ctx.interaction.options.getInteger('niveau');
      const role = ctx.interaction.options.getRole('role');
      if (!level) throw new UsageError('Précisez le `niveau` déclencheur.');
      if (!role) throw new UsageError('Précisez le `role` à attribuer.');

      const next =
        action === 'ajouter'
          ? [...current.filter((reward) => reward.level !== level), { level, roleId: role.id }].sort((a, b) => a.level - b.level)
          : current.filter((reward) => reward.level !== level);
      guildService.update(ctx.guild.id, { levels: { rewards: next } } as never);

      return ctx.send(
        successEmbed(
          action === 'ajouter' ? 'Récompense enregistrée' : 'Récompense retirée',
          [
            action === 'ajouter' ? `Les membres de niveau **${level}** et plus recevront ${role}.` : `Plus aucune attribution au niveau **${level}**.`,
            '',
            '**Récompenses :**',
            next.length > 0 ? bulletList(next.map((reward) => `niveau ${reward.level} → <@&${reward.roleId}>`)) : '*aucune*',
          ].join('\n'),
        ),
      );
    }

    // ── Réinitialisation ───────────────────────────────────────────────────
    if (sub === 'reset') {
      const token = shortCode(10);
      registerConfirmation(token, {
        userId: ctx.interaction.user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        cancelMessage: 'La configuration est inchangée.',
        onConfirm: async (buttonInteraction) => {
          const fresh = guildService.reset(ctx.guild.id);
          await buttonInteraction.editReply({
            embeds: [
              baseEmbed({
                title: '♻️ Configuration réinitialisée',
                description: `Toutes les valeurs par défaut ont été restaurées.\n\n${renderConfig(fresh)}`,
                color: THEME.colors.warning,
              }),
            ],
            components: [],
          });
        },
      });

      return ctx.interaction.editReply({
        embeds: [
          warningEmbed(
            '⚠️ Confirmation requise',
            [
              'Vous êtes sur le point de **réinitialiser toute la configuration** de ce serveur :',
              'salons de logs, rôles staff/hôtes, rôle muet, seuils de sanctions, messages de bienvenue…',
              '',
              'Les **cases de modération** et les **giveaways** ne sont pas supprimés.',
              'Cette action est immédiate et irréversible.',
            ].join('\n'),
          ),
        ],
        components: [confirmRow(token, { yes: 'Réinitialiser', no: 'Annuler' })],
      });
    }

    return ctx.error(`Sous-commande inconnue : \`${sub}\``);
  },
};

export { errorEmbed, isTextChannel };
export default configCommand;
