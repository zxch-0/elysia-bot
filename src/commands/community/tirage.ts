import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { pickOne, shuffle } from '../../utils/random';
import { humanizeNumber } from '../../utils/format';
import { UsageError } from '../../core/errors';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Tirage au sort de membres, avec filtres (rôle requis, ancienneté minimale)
 * et exclusion automatique des bots. Tirage **sans remise** et
 * cryptographiquement sûr.
 */
const drawCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('tirage')
    .setDescription('Tire au sort un ou plusieurs membres du serveur (filtres par rôle et ancienneté)')
    .setDMPermission(false)
    .addIntegerOption((option) => option.setName('gagnants').setDescription('Nombre de gagnants (1-50)').setMinValue(1).setMaxValue(50))
    .addRoleOption((option) => option.setName('role').setDescription('Ne tirer que les membres ayant ce rôle'))
    .addIntegerOption((option) => option.setName('anciennete').setDescription('Ancienneté minimale sur le serveur, en jours').setMinValue(0).setMaxValue(3_650))
    .addBooleanOption((option) => option.setName('avec_bots').setDescription('Inclure les bots dans le tirage'))
    .addStringOption((option) => option.setName('recompense').setDescription('Ce qui est gagné (affiché dans le message)').setMaxLength(200))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  category: 'community',
  summary: 'Tirage au sort de membres',
  usage: ['/tirage gagnants:3 role:@Participant', '/tirage gagnants:1 recompense:Une place de cinéma'],
  permissions: { user: [PermissionFlagsBits.ManageGuild] },
  cooldown: 10,
  async run(ctx: CommandContext) {
    const winnersCount = ctx.interaction.options.getInteger('gagnants') ?? 1;
    const role = ctx.interaction.options.getRole('role');
    const minSeniority = ctx.interaction.options.getInteger('anciennete') ?? 0;
    const includeBots = ctx.interaction.options.getBoolean('avec_bots') ?? false;
    const prize = ctx.interaction.options.getString('recompense');

    const members = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
    const eligible = [...members.values()].filter((member: GuildMember) => {
      if (member.user.bot && !includeBots) return false;
      if (role && !member.roles.cache.has(role.id)) return false;
      if (minSeniority > 0) {
        const days = (Date.now() - (member.joinedTimestamp ?? 0)) / 86_400_000;
        if (days < minSeniority) return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      throw new UsageError(
        `Aucun membre ne correspond à ces critères${role ? ` (rôle ${role.name})` : ''}. Assouplissez les filtres et réessayez.`,
      );
    }

    const pool = shuffle(eligible.map((member) => member.id));
    const winners = pool.slice(0, Math.min(winnersCount, pool.length));
    const lucky = pickOne(pool) ?? null;

    const embed = baseEmbed({
      title: '🎲 Tirage au sort',
      description: [
        prize ? `**Récompense :** ${prize}` : '',
        `**Participants éligibles :** ${humanizeNumber(eligible.length)}${role ? ` (rôle ${role.name})` : ''}${minSeniority > 0 ? ` • ancienneté ≥ ${minSeniority} j` : ''}`,
        '',
        winners.length > 0
          ? winners.map((id, index) => `${MEDALS[index] ?? `**${index + 1}.**`} <@${id}>`).join('\n')
          : '*aucun gagnant*',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      color: THEME.colors.giveaway,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: `Tirage sans remise effectué par ${ctx.interaction.user.tag} • ${new Date().toLocaleString('fr-FR')}`,
    });

    embed.addFields({
      name: '🔄 Tirage de secours',
      value: lucky ? `Si un gagnant est indisponible : <@${lucky}>` : '*aucun remplaçant*',
    });

    if (minSeniority === 0 && !role) {
      embed.addFields({
        name: '💡 Astuce',
        value: 'Combinez `role:` et `anciennete:` pour un tirage équitable entre membres actifs.',
      });
    }

    return ctx.send(embed);
  },
};

export default drawCommand;
