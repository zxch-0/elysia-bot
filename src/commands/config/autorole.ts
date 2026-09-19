import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { guildService } from '../../services/guildService';
import { baseEmbed, successEmbed, warningEmbed, THEME } from '../../ui/embeds';
import { bulletList } from '../../utils/format';
import { isRoleAssignable } from '../../utils/permissions';
import { UsageError } from '../../core/errors';

/** Gestion des rôles attribués automatiquement à l'arrivée d'un membre. */
const autoroleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Gère les rôles donnés automatiquement aux nouveaux membres')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('ajouter')
        .setDescription('Ajoute un rôle automatique')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à attribuer à l’arrivée').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retire un rôle automatique')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à ne plus attribuer').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Affiche les rôles automatiques actuels'))
    .addSubcommand((sub) =>
      sub
        .setName('appliquer')
        .setDescription('Applique les rôles automatiques à tous les membres présents (rattrapage)'),
    ),
  category: 'config',
  summary: 'Rôles automatiques à l’arrivée',
  usage: ['/autorole ajouter role:@Membre', '/autorole appliquer'],
  permissions: { user: [PermissionFlagsBits.ManageRoles], bot: [PermissionFlagsBits.ManageRoles] },
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';
    const settings = guildService.get(ctx.guild.id);

    if (sub === 'liste') {
      const embed = baseEmbed({
        title: '⚙️ Rôles automatiques',
        color: THEME.colors.primary,
        description:
          settings.roles.autoRoles.length === 0
            ? 'Aucun rôle automatique configuré.\n➜ `/autorole ajouter role:@Membre`'
            : bulletList(
                settings.roles.autoRoles.map((roleId) => {
                  const role = ctx.guild.roles.cache.get(roleId);
                  if (!role) return `\`${roleId}\` — ⚠️ rôle supprimé`;
                  return `${role} — ${isRoleAssignable(ctx.guild, role) ? '✅ attribuable' : '❌ trop haut dans la hiérarchie'}`;
                }),
              ),
      });
      embed.addFields({
        name: 'Module',
        value: settings.modules.autoRole ? '🟢 actif' : '🔴 inactif — activez-le avec `/config modules module:Rôles automatiques actif:true`',
      });
      return ctx.send(embed);
    }

    if (sub === 'ajouter') {
      const role = ctx.role('role');
      if (!isRoleAssignable(ctx.guild, role)) {
        throw new UsageError(
          `Le rôle **${role.name}** est au-dessus du mien ou géré par une intégration : je ne pourrai pas l’attribuer.\n➜ Déplacez mon rôle plus haut dans *Paramètres du serveur → Rôles*.`,
        );
      }
      const next = [...new Set([...settings.roles.autoRoles, role.id])];
      guildService.update(ctx.guild.id, { roles: { autoRoles: next }, modules: { autoRole: true } } as never);
      return ctx.send(
        successEmbed('Rôle automatique ajouté', `${role} sera désormais attribué à chaque nouveau membre.\n\n**Liste :** ${next.map((id) => `<@&${id}>`).join(', ')}`),
      );
    }

    if (sub === 'retirer') {
      const role = ctx.role('role');
      const next = settings.roles.autoRoles.filter((id) => id !== role.id);
      guildService.update(ctx.guild.id, { roles: { autoRoles: next }, modules: { autoRole: next.length > 0 } } as never);
      return ctx.send(
        successEmbed(
          'Rôle automatique retiré',
          `${role} ne sera plus attribué automatiquement.\n**Liste :** ${next.length > 0 ? next.map((id) => `<@&${id}>`).join(', ') : 'vide'}`,
        ),
      );
    }

    if (sub === 'appliquer') {
      if (settings.roles.autoRoles.length === 0) throw new UsageError('Aucun rôle automatique configuré.');
      const members = await ctx.guild.members.fetch();
      const targets = members.filter(
        (member) => !member.user.bot && settings.roles.autoRoles.some((roleId) => !member.roles.cache.has(roleId)),
      );

      if (targets.size === 0) {
        return ctx.send(successEmbed('Rien à faire', 'Tous les membres éligibles possèdent déjà les rôles automatiques.'));
      }
      if (targets.size > 50) {
        return ctx.send(
          warningEmbed(
            'Opération trop volumineuse',
            `${targets.size} membres seraient modifiés : Discord limite les requêtes.\n➜ Filtrer avec un rôle existant ou procéder par lots (max 50 membres).`,
          ),
        );
      }

      await ctx.interaction.editReply({
        embeds: [baseEmbed({ title: '⏳ Application en cours…', description: `${targets.size} membre(s) à traiter.`, color: THEME.colors.info })],
      });

      let updated = 0;
      for (const member of targets.values()) {
        try {
          await member.roles.add(settings.roles.autoRoles, `Rattrapage des rôles automatiques (${ctx.interaction.user.tag})`);
          updated += 1;
        } catch {
          /* ignore membre par membre */
        }
      }

      return ctx.send(successEmbed('Rattrapage terminé', `${updated} / ${targets.size} membre(s) mis à jour avec les rôles automatiques.`));
    }

    return ctx.error('Sous-commande inconnue.');
  },
};

export default autoroleCommand;
