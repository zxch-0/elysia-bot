import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { noteService } from '../../services/noteService';
import { timestampTag } from '../../utils/duration';
import { bulletList, humanizeNumber, truncate } from '../../utils/format';
import { UsageError } from '../../core/errors';

/**
 * Notes internes du staff : observations utiles (contexte, comportement,
 * promesses tenues…) qui ne déclenchent **aucune** sanction automatique et
 * n'apparaissent jamais publiquement.
 */
const noteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Notes internes du staff sur un membre (aucune sanction, invisible du public)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('ajouter')
        .setDescription('Ajoute une note sur un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addStringOption((option) => option.setName('note').setDescription('Observation à retenir').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Consulte les notes d’un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime une note')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addIntegerOption((option) => option.setName('numero').setDescription('Numéro de la note (voir /note liste)').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) => sub.setName('resume').setDescription('Membres les plus commentés par le staff'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  category: 'moderation',
  summary: 'Notes internes du staff',
  usage: ['/note ajouter membre:@Léo note:Toujours en retard en vocal', '/note liste membre:@Léo', '/note resume'],
  permissions: { user: [PermissionFlagsBits.ModerateMembers] },
  cooldown: 4,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';

    if (sub === 'ajouter') {
      const target = ctx.memberOf('membre');
      const text = ctx.string('note');
      if (text.trim().length < 3) throw new UsageError('La note est trop courte (3 caractères minimum).');
      if (noteService.count(ctx.guild.id, target.id) >= 50) {
        throw new UsageError(`Ce membre a déjà 50 notes : supprimez-en avant d’en ajouter une nouvelle.`);
      }

      noteService.add({
        guildId: ctx.guild.id,
        userId: target.id,
        targetTag: target.user.tag,
        authorId: ctx.interaction.user.id,
        authorTag: ctx.interaction.user.tag,
        text,
      });

      const total = noteService.count(ctx.guild.id, target.id);
      return ctx.send(
        successEmbed(
          'Note enregistrée',
          [
            `**Membre :** ${target.user} (\`${target.id}\`)`,
            `**Note :** ${truncate(text, 300)}`,
            '',
            `Ce membre compte désormais **${humanizeNumber(total)}** note(s). Consultez-les avec \`/note liste membre:@${target.user.username}\`.`,
          ].join('\n'),
        ),
      );
    }

    if (sub === 'liste') {
      const target = ctx.memberOf('membre');
      const notes = noteService.list(ctx.guild.id, target.id);

      if (notes.length === 0) {
        return ctx.send(warningEmbed('Aucune note', `Le staff n’a laissé aucune note sur **${target.user.tag}**.`));
      }

      const embed = baseEmbed({
        title: `🗒️ Notes sur ${target.user.tag}`,
        description: notes
          .map((note, index) => {
            const number = notes.length - index;
            return `**#${number}** — ${timestampTag(note.createdAt, 'R')} par ${note.authorTag}\n┕ ${truncate(note.text, 200)}`;
          })
          .join('\n\n')
          .slice(0, 4_000),
        color: THEME.colors.warning,
        thumbnail: target.user.displayAvatarURL({ size: 128 }),
        footer: `${humanizeNumber(notes.length)} note(s) • suppression : /note supprimer membre:… numero:…`,
      });
      return ctx.send(embed);
    }

    if (sub === 'supprimer') {
      const target = ctx.memberOf('membre');
      const number = ctx.integer('numero');
      const removed = noteService.remove(ctx.guild.id, target.id, number);

      return ctx.send(
        removed
          ? successEmbed('Note supprimée', `La note **#${number}** de ${target.user.tag} a été retirée.`)
          : errorEmbed(`Aucune note **#${number}** pour ${target.user.tag}. Utilisez \`/note liste\` pour voir les numéros.`, 'Note introuvable'),
      );
    }

    // ── Résumé ──────────────────────────────────────────────────────────────
    const top = noteService.topGuild(ctx.guild.id, 15);
    if (top.length === 0) {
      return ctx.send(warningEmbed('Aucune note', 'Le staff n’a laissé aucune note sur ce serveur pour le moment.'));
    }

    return ctx.send(
      baseEmbed({
        title: '🗂️ Membres les plus commentés',
        description: bulletList(
          top.map((entry) => `<@${entry.userId}> — **${humanizeNumber(entry.count)}** note(s) *(${truncate(entry.targetTag, 28)})*`),
          { max: 15 },
        ),
        color: THEME.colors.warning,
        footer: `Total : ${humanizeNumber(noteService.total())} note(s) sur l’ensemble des serveurs`,
      }),
    );
  },
};

export default noteCommand;
