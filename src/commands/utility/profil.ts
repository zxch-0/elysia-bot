import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME, AUTHOR_FOOTER } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { timestampTag } from '../../utils/duration';
import { accountAge, humanizeNumber, truncate } from '../../utils/format';
import { caseService } from '../../services/caseService';
import { noteService } from '../../services/noteService';
import { gameService } from '../../services/gameService';
import { levelService, levelProgress } from '../../services/levelService';
import { GAME_DEFINITIONS } from '../../games/registry';

/**
 * Fiche complète d'un membre : identité, ancienneté, rôles, niveau, jeu et
 * historique de modération — tout ce que le staff doit savoir en un coup d'œil.
 */
const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Fiche complète d’un membre (ancienneté, rôles, niveau, statistiques, sanctions)')
    .setDMPermission(false)
    .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter (vous par défaut)'))
    .addBooleanOption((option) => option.setName('public').setDescription('Afficher la fiche à tout le monde')),
  category: 'utility',
  summary: 'Fiche complète d’un membre',
  usage: ['/profil', '/profil membre:@Léo public:true'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const target = ctx.interaction.options.getMember('membre') ?? ctx.member;
    const member = (Array.isArray(target) ? target[0] : target) as GuildMember;
    const isPublic = ctx.interaction.options.getBoolean('public') ?? false;
    const user = member.user;

    const levelEntry = levelService.entry(ctx.guild.id, user.id);
    const progress = levelProgress(levelEntry?.xp ?? 0);
    const rank = levelService.rank(ctx.guild.id, user.id);
    const cases = caseService.listUser(ctx.guild.id, user.id);
    const warnings = caseService.countActiveWarnings(ctx.guild.id, user.id);
    const notes = noteService.count(ctx.guild.id, user.id);
    const stats = gameService.stats(ctx.guild.id, user.id);
    const gameRank = gameService.rank(ctx.guild.id, user.id);

    const roles = member.roles.cache
      .filter((role) => role.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position);
    const topRoles = [...roles.values()].slice(0, 6);

    const embed = baseEmbed({
      title: `${member.displayName}`,
      description: `${user} • \`${user.id}\``,
      color: member.displayColor || THEME.colors.primary,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      footer: `${AUTHOR_FOOTER} • ${isPublic ? 'fiche publique' : 'visible uniquement par vous'}`,
    });

    embed.addFields(
      {
        name: '📅 Identité',
        value: [
          `**Pseudo :** ${member.nickname ? truncate(member.nickname, 32) : '*aucun*'}`,
          `**Compte créé :** ${timestampTag(user.createdTimestamp, 'R')} (${accountAge(user.createdTimestamp)})`,
          `**Arrivée :** ${member.joinedTimestamp ? `${timestampTag(member.joinedTimestamp, 'R')} (${accountAge(member.joinedTimestamp)})` : '*inconnue*'}`,
          `**Booster :** ${member.premiumSinceTimestamp ? `depuis ${timestampTag(member.premiumSinceTimestamp, 'R')}` : 'non'}`,
        ].join('\n'),
      },
      {
        name: `🎖️ Rôles (${roles.size})`,
        value:
          topRoles.length > 0
            ? `${topRoles.map((role) => role.toString()).join(' ')}${roles.size > topRoles.length ? `\n*… et ${roles.size - topRoles.length} autre(s)*` : ''}`
            : '*aucun rôle*',
      },
    );

    embed.addFields({
      name: '📈 Niveau',
      value: [
        `**Niveau ${progress.level}** — ${humanizeNumber(progress.into)}/${humanizeNumber(progress.needed)} XP`,
        `Total : ${humanizeNumber(progress.xp)} XP • Rang : ${rank ? `#${rank}` : 'non classé'}`,
        `Messages récompensés : ${humanizeNumber(levelEntry?.messages ?? 0)}`,
      ].join('\n'),
      inline: true,
    });

    embed.addFields({
      name: '🎮 Mini-jeux',
      value: stats
        ? [
            `**${humanizeNumber(stats.points)} points** • ${gameRank ? `#${gameRank}` : 'non classé'}`,
            `Jeux joués : ${humanizeNumber(
              Object.values(stats.games).reduce((sum, record) => sum + (record?.played ?? 0), 0),
            )}`,
          ].join('\n')
        : 'Aucune partie jouée — `/jeu liste`',
      inline: true,
    });

    embed.addFields({
      name: '🛡️ Modération',
      value: [
        `Sanctions : **${cases.length}** • Avertissements actifs : **${warnings}**`,
        `Notes du staff : **${notes}**`,
        cases.length > 0
          ? `Dernière : ${cases[0].type} ${timestampTag(cases[0].createdAt, 'R')} — ${truncate(cases[0].reason, 60)}`
          : '✨ Casier vierge',
      ].join('\n'),
    });

    const permissions = member.permissions.toArray().length;
    embed.addFields({
      name: '🔑 Permissions',
      value: `${permissions} permission(s)${member.permissions.has(PermissionFlagsBits.Administrator) ? ' • **Administrateur**' : ''}${
        member.permissions.has(PermissionFlagsBits.ManageGuild) ? ' • Gérer le serveur' : ''
      }`,
      inline: true,
    });

    const games = GAME_DEFINITIONS.length;
    embed.addFields({ name: 'ℹ️ Divers', value: `${games} jeux disponibles • \`/sanctions\` pour l’historique détaillé`, inline: true });

    const rows = buttonRows([
      { id: 'avatar:noop', label: 'Photo de profil', emoji: '🖼️', style: 'secondary', url: user.displayAvatarURL({ size: 1024 }) },
    ]);

    return ctx.send(embed, isPublic ? rows : []);
  },
};

export default profileCommand;
