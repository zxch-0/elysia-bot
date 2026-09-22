import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { levelService, levelProgress, totalXpForLevel } from '../../services/levelService';
import { guildService } from '../../services/guildService';
import { humanizeNumber, progressBar, truncate } from '../../utils/format';
import { UsageError } from '../../core/errors';

const MENTION = (id: string) => `<@${id}>`;

/**
 * Système d'XP et de niveaux : classement, progression, rôles de récompense.
 * L'XP se gagne en discutant (une fois par minute et par membre) et peut être
 * réglé par les administrateurs.
 */
const levelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Système d’XP : progression, classement et rôles de récompense')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Affiche la progression d’un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné (vous par défaut)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('classement')
        .setDescription('Top des membres les plus actifs')
        .addIntegerOption((option) => option.setName('taille').setDescription('Nombre de membres affichés (5 à 25)').setMinValue(5).setMaxValue(25)),
    )
    .addSubcommand((sub) => sub.setName('recompenses').setDescription('Liste les rôles attribués automatiquement selon le niveau'))
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Réglages du système d’XP (administrateurs)')
        .addBooleanOption((option) => option.setName('actif').setDescription('Activer ou désactiver le gain d’XP'))
        .addBooleanOption((option) => option.setName('annonce').setDescription('Annoncer les montées de niveau'))
        .addChannelOption((option) => option.setName('salon').setDescription('Salon des annonces de niveau'))
        .addIntegerOption((option) => option.setName('xp_min').setDescription('XP minimum par message').setMinValue(1).setMaxValue(200))
        .addIntegerOption((option) => option.setName('xp_max').setDescription('XP maximum par message').setMinValue(1).setMaxValue(300))
        .addIntegerOption((option) => option.setName('delai').setDescription('Délai minimum entre deux gains, en secondes').setMinValue(5).setMaxValue(3_600)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('recompense')
        .setDescription('Gère les rôles de récompense (administrateurs)')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Action à effectuer')
            .setRequired(true)
            .addChoices({ name: 'Ajouter', value: 'ajouter' }, { name: 'Retirer', value: 'retirer' }, { name: 'Vider', value: 'vider' }),
        )
        .addIntegerOption((option) => option.setName('niveau').setDescription('Niveau déclencheur').setMinValue(1).setMaxValue(500))
        .addRoleOption((option) => option.setName('role').setDescription('Rôle attribué à ce niveau')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ajuster')
        .setDescription('Ajoute ou retire de l’XP à un membre (staff)')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addIntegerOption((option) => option.setName('xp').setDescription('XP à ajouter (négatif pour retirer)').setRequired(true).setMinValue(-100_000).setMaxValue(100_000)),
    ),
  category: 'community',
  summary: 'XP, niveaux et classement',
  usage: ['/niveau voir', '/niveau classement', '/niveau recompense action:ajouter niveau:5 role:@Actif'],
  cooldown: 4,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'voir';
    const settings = guildService.get(ctx.guild.id);

    // ── Progression d'un membre ─────────────────────────────────────────────
    if (sub === 'voir') {
      const target = ctx.interaction.options.getMember('membre') ?? ctx.member;
      const member = Array.isArray(target) ? target[0] : target;
      const entry = levelService.entry(ctx.guild.id, member.id);
      const progress = levelProgress(entry?.xp ?? 0);
      const rank = levelService.rank(ctx.guild.id, member.id);
      const nextReward = settings.levels.rewards
        .filter((reward) => reward.level > progress.level && ctx.guild.roles.cache.has(reward.roleId))
        .sort((a, b) => a.level - b.level)[0];

      const embed = baseEmbed({
        title: `📈 Niveau de ${member.displayName}`,
        description: [
          `**Niveau ${progress.level}** — ${humanizeNumber(progress.into)} / ${humanizeNumber(progress.needed)} XP`,
          progressBar(progress.into, Math.max(progress.needed, 1), 18),
          `Total : **${humanizeNumber(progress.xp)} XP** • rang : ${rank ? `#${rank}` : 'non classé'}`,
        ].join('\n'),
        color: member.displayColor || THEME.colors.primary,
        thumbnail: member.user.displayAvatarURL({ size: 256 }),
        footer: `Il reste ${humanizeNumber(progress.needed - progress.into)} XP avant le niveau ${progress.level + 1}`,
      });

      embed.addFields(
        { name: '💬 Messages récompensés', value: humanizeNumber(entry?.messages ?? 0), inline: true },
        {
          name: '🎯 Prochain palier',
          value: `${humanizeNumber(totalXpForLevel(progress.level + 1))} XP au total${nextReward ? ` → <@&${nextReward.roleId}>` : ''}`,
          inline: true,
        },
      );

      if (settings.levels.rewards.length > 0) {
        embed.addFields({
          name: '🎁 Récompenses du serveur',
          value: settings.levels.rewards
            .sort((a, b) => a.level - b.level)
            .map((reward) => `Niveau ${reward.level} → <@&${reward.roleId}>${progress.level >= reward.level ? ' ✅' : ''}`)
            .join('\n'),
        });
      }

      return ctx.send(embed);
    }

    // ── Classement ──────────────────────────────────────────────────────────
    if (sub === 'classement') {
      const size = ctx.interaction.options.getInteger('taille') ?? 10;
      const board = levelService.leaderboard(ctx.guild.id, size);
      if (board.length === 0) {
        return ctx.send(warningEmbed('Classement vide', 'Personne n’a encore gagné d’XP. Il suffit de discuter pour démarrer !'));
      }

      const medals = ['🥇', '🥈', '🥉'];
      const embed = baseEmbed({
        title: `🏆 Classement d’activité — ${ctx.guild.name}`,
        description: board
          .map((entry, index) => {
            const progress = levelProgress(entry.xp);
            const medal = medals[index] ?? `**${index + 1}.**`;
            return `${medal} ${MENTION(entry.userId)} — niveau **${progress.level}** • ${humanizeNumber(entry.xp)} XP${index < 10 ? `\n┕ ${progressBar(progress.into, Math.max(progress.needed, 1), 12)}` : ''}`;
          })
          .join('\n'),
        color: THEME.colors.primary,
        thumbnail: ctx.guild.iconURL({ size: 128 }),
        footer: `${humanizeNumber(levelService.countActive(ctx.guild.id))} membre(s) classé(s) • ${humanizeNumber(levelService.totalXp(ctx.guild.id))} XP distribué(s)`,
      });
      return ctx.send(embed);
    }

    // ── Liste des récompenses ───────────────────────────────────────────────
    if (sub === 'recompenses') {
      if (settings.levels.rewards.length === 0) {
        return ctx.send(
          warningEmbed(
            'Aucune récompense configurée',
            'Les administrateurs peuvent en ajouter : `/niveau recompense action:ajouter niveau:5 role:@Actif`.',
          ),
        );
      }
      return ctx.send(
        baseEmbed({
          title: '🎁 Rôles de récompense',
          description: settings.levels.rewards
            .sort((a, b) => a.level - b.level)
            .map((reward) => {
              const role = ctx.guild.roles.cache.get(reward.roleId);
              return `**Niveau ${reward.level}** → ${role ? role.toString() : `\`${reward.roleId}\` *(rôle supprimé)*`}`;
            })
            .join('\n'),
          color: THEME.colors.secondary,
          footer: `XP par message : ${settings.levels.xpMin}-${settings.levels.xpMax} • délai ${Math.round(settings.levels.cooldownMs / 1_000)} s`,
        }),
      );
    }

    // ── Configuration ───────────────────────────────────────────────────────
    if (sub === 'config') {
      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return ctx.send(errorEmbed('La configuration des niveaux est réservée aux administrateurs.', 'Action refusée'));
      }

      const active = ctx.interaction.options.getBoolean('actif');
      const announce = ctx.interaction.options.getBoolean('annonce');
      const channel = ctx.interaction.options.getChannel('salon');
      const xpMin = ctx.interaction.options.getInteger('xp_min');
      const xpMax = ctx.interaction.options.getInteger('xp_max');
      const delay = ctx.interaction.options.getInteger('delai');

      const levelPatch: Record<string, unknown> = {};
      const channelPatch: Record<string, string | null> = {};

      if (active !== null) levelPatch.enabled = active;
      if (announce !== null) levelPatch.announce = announce;
      if (xpMin !== null) levelPatch.xpMin = xpMin;
      if (xpMax !== null) levelPatch.xpMax = xpMax;
      if (delay !== null) levelPatch.cooldownMs = delay * 1_000;
      if (channel) channelPatch.levelUp = channel.id;

      if (Object.keys(levelPatch).length === 0 && Object.keys(channelPatch).length === 0) {
        throw new UsageError('Renseignez au moins une option à modifier.');
      }

      const merged = { ...settings.levels, ...levelPatch } as typeof settings.levels;
      if (merged.xpMax < merged.xpMin) throw new UsageError('`xp_max` doit être supérieur ou égal à `xp_min`.');

      const updated = guildService.update(ctx.guild.id, {
        ...(Object.keys(levelPatch).length > 0 ? { levels: levelPatch } : {}),
        ...(Object.keys(channelPatch).length > 0 ? { channels: channelPatch } : {}),
      } as never);

      return ctx.send(
        successEmbed(
          'Système d’XP mis à jour',
          [
            `**Actif :** ${updated.levels.enabled ? 'oui' : 'non'}`,
            `**XP par message :** ${updated.levels.xpMin} → ${updated.levels.xpMax}`,
            `**Délai anti-spam :** ${Math.round(updated.levels.cooldownMs / 1_000)} s`,
            `**Annonces :** ${updated.levels.announce ? 'oui' : 'non'}${updated.channels.levelUp ? ` dans <#${updated.channels.levelUp}>` : ' (salon courant)'}`,
          ].join('\n'),
        ),
      );
    }

    // ── Ajout / retrait de récompense ───────────────────────────────────────
    if (sub === 'recompense') {
      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return ctx.send(errorEmbed('Seuls les administrateurs peuvent gérer les récompenses.', 'Action refusée'));
      }
      const action = ctx.string('action');
      const current = settings.levels.rewards;

      if (action === 'vider') {
        guildService.update(ctx.guild.id, { levels: { rewards: [] } } as never);
        return ctx.send(successEmbed('Récompenses supprimées', 'Plus aucun rôle ne sera attribué automatiquement.'));
      }

      const level = ctx.interaction.options.getInteger('niveau');
      const role = ctx.interaction.options.getRole('role');
      if (!level) throw new UsageError('Précisez le `niveau` concerné.');
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
            action === 'ajouter'
              ? `Au niveau **${level}**, les membres recevront ${role}.`
              : `Aucun rôle ne sera plus attribué au niveau **${level}**.`,
            '',
            '**Récompenses configurées :**',
            next.length > 0 ? next.map((reward) => `• Niveau ${reward.level} → <@&${reward.roleId}>`).join('\n') : '*aucune*',
          ].join('\n'),
        ),
      );
    }

    // ── Ajustement manuel ───────────────────────────────────────────────────
    const targetMember = ctx.memberOf('membre');
    if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return ctx.send(errorEmbed('Seuls les administrateurs peuvent ajuster l’XP.', 'Action refusée'));
    }
    const amount = ctx.integer('xp');
    const before = levelService.entry(ctx.guild.id, targetMember.id);
    const after = levelService.addXp(ctx.guild.id, targetMember.id, targetMember.user.tag, amount);

    return ctx.send(
      baseEmbed({
        title: '🧪 XP ajusté',
        description: [
          `${targetMember.user.tag} : **${humanizeNumber(before?.xp ?? 0)}** → **${humanizeNumber(after.xp)}** XP (${amount >= 0 ? '+' : ''}${humanizeNumber(amount)})`,
          `Niveau : ${humanizeNumber(before?.level ?? 0)} → **${humanizeNumber(after.level)}**`,
          '',
          truncate('Astuce : `/niveau voir membre:…` pour vérifier la progression.', 120),
        ].join('\n'),
        color: THEME.colors.info,
        footer: `Modifié par ${ctx.interaction.user.tag}`,
      }),
    );
  },
};

export default levelCommand;
