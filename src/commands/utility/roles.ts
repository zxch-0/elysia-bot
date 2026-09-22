import { PermissionFlagsBits, SlashCommandBuilder, type Role } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { bulletList, humanizeNumber, chunk, truncate } from '../../utils/format';
import { isRoleAssignable } from '../../utils/permissions';

type SortMode = 'membres' | 'position' | 'nom';

function sortRoles(roles: Role[], mode: SortMode): Role[] {
  if (mode === 'position') return [...roles].sort((a, b) => b.position - a.position);
  if (mode === 'nom') return [...roles].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return [...roles].sort((a, b) => b.members.size - a.members.size);
}

function describeRole(role: Role, guildId: string): string {
  const flags: string[] = [];
  if (role.managed) flags.push('intégration');
  if (role.hoist) flags.push('affiché séparément');
  if (role.mentionable) flags.push('mentionnable');
  if (role.id === guildId) flags.push('@everyone');
  if (role.permissions.has(PermissionFlagsBits.Administrator)) flags.push('⚠️ admin');
  return `${role.toString()} — ${humanizeNumber(role.members.size)} membre(s)${flags.length > 0 ? ` • *${flags.join(', ')}*` : ''}`;
}

/**
 * Inventaire des rôles du serveur avec tri, recherche et diagnostics
 * (rôles inutilisés, rôles trop hauts pour le bot, rôles d'intégration…).
 */
const rolesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Liste les rôles du serveur avec leurs membres et signale les problèmes')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('tri')
        .setDescription('Ordre d’affichage')
        .addChoices(
          { name: '👥 Nombre de membres', value: 'membres' },
          { name: '📊 Position (hiérarchie)', value: 'position' },
          { name: '🔤 Nom', value: 'nom' },
        ),
    )
    .addStringOption((option) => option.setName('recherche').setDescription('Filtrer sur une partie du nom').setMaxLength(40))
    .addIntegerOption((option) => option.setName('page').setDescription('Page à afficher').setMinValue(1))
    .addBooleanOption((option) => option.setName('diagnostic').setDescription('Afficher les problèmes détectés (par défaut : oui')),
  category: 'utility',
  summary: 'Inventaire et diagnostic des rôles',
  usage: ['/roles tri:membres', '/roles recherche:staff diagnostic:true'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sortMode = (ctx.interaction.options.getString('tri') ?? 'position') as SortMode;
    const search = ctx.interaction.options.getString('recherche')?.toLowerCase() ?? null;
    const page = Math.max((ctx.interaction.options.getInteger('page') ?? 1) - 1, 0);
    const showDiagnostic = ctx.interaction.options.getBoolean('diagnostic') ?? true;

    const all = [...ctx.guild.roles.cache.values()];
    const filtered = search ? all.filter((role) => role.name.toLowerCase().includes(search)) : all;
    const sorted = sortRoles(filtered, sortMode);
    const groups = chunk(sorted, 10);
    const current = groups[Math.min(page, Math.max(groups.length - 1, 0))] ?? [];

    const embed = baseEmbed({
      title: `🎭 Rôles de ${ctx.guild.name}`,
      description: [
        `**${humanizeNumber(all.length)}** rôle(s) au total${search ? ` • ${humanizeNumber(filtered.length)} correspondance(s) pour « ${truncate(search, 30)} »` : ''}`,
        '',
        bulletList(current.map((role) => describeRole(role, ctx.guild.id)), { max: 10 }),
      ].join('\n'),
      color: THEME.colors.primary,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: `Page ${page + 1}/${Math.max(groups.length, 1)} • tri : ${sortMode}`,
    });

    if (showDiagnostic) {
      const botMember = ctx.guild.members.me;
      const tooHigh = all.filter((role) => role.id !== ctx.guild.id && botMember && role.position >= botMember.roles.highest.position && !role.managed);
      const empty = all.filter((role) => role.id !== ctx.guild.id && role.members.size === 0 && !role.managed);
      const managed = all.filter((role) => role.managed);
      const notAssignable = all.filter((role) => role.id !== ctx.guild.id && !role.managed && !isRoleAssignable(ctx.guild, role));

      embed.addFields({
        name: '🩺 Diagnostic',
        value: bulletList(
          [
            tooHigh.length > 0 ? `⚠️ ${tooHigh.length} rôle(s) **au-dessus du rôle du bot** : je ne peux pas les attribuer (${truncate(tooHigh.slice(0, 3).map((role) => role.name).join(', '), 80)})` : null,
            notAssignable.length > 0 ? `⚠️ ${notAssignable.length} rôle(s) non attribuables par le bot.` : null,
            managed.length > 0 ? `ℹ️ ${managed.length} rôle(s) géré(s) par une intégration (bot, abonnement) — impossible à modifier à la main.` : null,
            empty.length > 0 ? `📁 ${empty.length} rôle(s) sans aucun membre.` : null,
          ].filter((line): line is string => line !== null),
          { emptyText: '✅ Aucun problème détecté : tous les rôles sont attribuables.' },
        ),
      });
    }

    return ctx.send(embed);
  },
};

export default rolesCommand;
