import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber } from '../../utils/format';
import { isRoleAssignable } from '../../utils/permissions';
import { PermissionError } from '../../core/errors';
import { timestampTag } from '../../utils/duration';

/** Attribution / retrait manuel de rôles, avec vérification de hiérarchie. */
const roleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Attribue, retire ou inspecte un rôle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('donner')
        .setDescription('Attribue un rôle à un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre ciblé').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à attribuer').setRequired(true))
        .addStringOption((option) => option.setName('raison').setDescription('Motif').setMaxLength(300)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retire un rôle à un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre ciblé').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à retirer').setRequired(true))
        .addStringOption((option) => option.setName('raison').setDescription('Motif').setMaxLength(300)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Affiche les informations d’un rôle')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à inspecter').setRequired(true)),
    ),
  category: 'roles',
  summary: 'Donner / retirer / inspecter un rôle',
  usage: ['/role donner membre:@Léo role:@Vérifié raison:règlement lu'],
  permissions: { user: [PermissionFlagsBits.ManageRoles], bot: [PermissionFlagsBits.ManageRoles] },
  cooldown: 3,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'info';

    if (sub === 'info') {
      const role = ctx.role('role');
      const embed = baseEmbed({
        title: `🎭 Rôle — ${role.name}`,
        color: role.color || THEME.colors.neutral,
        footer: `Identifiant : ${role.id}`,
      });
      embed.addFields(
        { name: 'Couleur', value: role.hexColor, inline: true },
        { name: 'Membres', value: humanizeNumber(role.members.size), inline: true },
        { name: 'Position', value: `${role.position}`, inline: true },
        { name: 'Mentionnable', value: role.mentionable ? 'oui' : 'non', inline: true },
        { name: 'Affiché séparément', value: role.hoist ? 'oui' : 'non', inline: true },
        { name: 'Géré par une intégration', value: role.managed ? 'oui' : 'non', inline: true },
        { name: 'Créé', value: timestampTag(role.createdTimestamp, 'f'), inline: true },
        {
          name: 'Attribuable par le bot',
          value: isRoleAssignable(ctx.guild, role) ? '✅ oui' : '❌ non — rôle trop haut dans la hiérarchie',
          inline: true,
        },
      );
      return ctx.send(embed);
    }

    const target = ctx.memberOf('membre');
    const role = ctx.role('role');
    const reason = ctx.interaction.options.getString('raison') ?? 'Aucune raison fournie';

    if (!isRoleAssignable(ctx.guild, role)) {
      throw new PermissionError(
        `Je ne peux pas gérer **${role.name}** : ce rôle est au-dessus du mien (ou géré par une intégration).\n➜ Déplacez mon rôle plus haut dans *Paramètres du serveur → Rôles*.`,
      );
    }
    if (target.roles.highest.position >= ctx.member.roles.highest.position && ctx.guild.ownerId !== ctx.member.id) {
      throw new PermissionError(`**${target.user.tag}** a un rôle supérieur ou égal au vôtre : action refusée.`);
    }

    if (sub === 'donner') {
      await target.roles.add(role, `${ctx.interaction.user.tag} : ${reason}`);
      return ctx.success(
        'Rôle attribué',
        [`**${role.name}** a été donné à ${target}.`, `**Par :** ${ctx.interaction.user} • **Raison :** ${reason}`].join('\n'),
      );
    }

    await target.roles.remove(role, `${ctx.interaction.user.tag} : ${reason}`);
    return ctx.success(
      'Rôle retiré',
      [`**${role.name}** a été retiré à ${target}.`, `**Par :** ${ctx.interaction.user} • **Raison :** ${reason}`].join('\n'),
    );
  },
};

export default roleCommand;
