import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { birthdayService } from '../../services/birthdayService';
import { DEFAULT_ANNOUNCE_ZONE, birthdayLabel, daysUntilBirthday, isValidDayMonth, zonedDate } from '../../utils/time';
import { humanizeNumber } from '../../utils/format';
import { UsageError } from '../../core/errors';

const MONTH_CHOICES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
].map((label, index) => ({ name: label, value: index + 1 }));

/**
 * Anniversaires : chaque membre enregistre sa date, le bot félicite les
 * personnes concernées dans le salon dédié et affiche les dates à venir.
 */
const birthdayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('anniversaire')
    .setDescription('Enregistre ton anniversaire, consulte la liste ou les dates à venir')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('definir')
        .setDescription('Enregistre ta date d’anniversaire')
        .addIntegerOption((option) => option.setName('jour').setDescription('Jour (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((option) => option.setName('mois').setDescription('Mois').setRequired(true).addChoices(...MONTH_CHOICES))
        .addIntegerOption((option) => option.setName('annee').setDescription('Année de naissance (facultative, pour l’âge)').setMinValue(1900).setMaxValue(2030)),
    )
    .addSubcommand((sub) => sub.setName('retirer').setDescription('Supprime ton anniversaire de la base'))
    .addSubcommand((sub) =>
      sub
        .setName('prochain')
        .setDescription('Prochains anniversaires du serveur')
        .addIntegerOption((option) => option.setName('nombre').setDescription('Nombre d’anniversaires à afficher').setMinValue(1).setMaxValue(25)),
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Tous les anniversaires connus du serveur'))
    .addSubcommand((sub) => sub.setName('moi').setDescription('Vérifie ce que le bot a enregistré pour toi')),
  category: 'community',
  summary: 'Anniversaires des membres',
  usage: ['/anniversaire definir jour:14 mois:7', '/anniversaire prochain nombre:10'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'moi';

    if (sub === 'definir') {
      const day = ctx.integer('jour');
      const month = ctx.integer('mois');
      const year = ctx.interaction.options.getInteger('annee');

      if (!isValidDayMonth(day, month)) {
        throw new UsageError(`La date **${day}/${month}** n’existe pas dans le calendrier.`);
      }
      if (year && year > new Date().getFullYear()) throw new UsageError('L’année de naissance ne peut pas être dans le futur.');

      const entry = birthdayService.set({
        guildId: ctx.guild.id,
        userId: ctx.interaction.user.id,
        userTag: ctx.interaction.user.tag,
        day,
        month,
        year: year ?? null,
      });

      const settings = ctx.settings;
      const embed = successEmbed(
        'Anniversaire enregistré',
        [
          `**Date :** ${birthdayLabel(entry.day, entry.month)}${entry.year ? ` ${entry.year}` : ''}`,
          `**Dans :** ${daysUntilBirthday(entry.day, entry.month) === 0 ? 'aujourd’hui 🎉' : `${daysUntilBirthday(entry.day, entry.month)} jour(s)`}`,
          '',
          settings.channels.birthday && settings.community.birthdays.announce
            ? `Vous serez félicité dans <#${settings.channels.birthday}>. 🎁`
            : '⚠️ Aucun salon d’annonce n’est configuré : un administrateur peut lancer `/config salon type:Anniversaires salon:#général`.',
        ].join('\n'),
      );
      return ctx.send(embed);
    }

    if (sub === 'retirer') {
      const removed = birthdayService.remove(ctx.guild.id, ctx.interaction.user.id);
      return ctx.send(
        removed
          ? successEmbed('Anniversaire supprimé', 'Votre date a été retirée de la base du serveur.')
          : warningEmbed('Rien à supprimer', 'Aucun anniversaire n’était enregistré pour vous sur ce serveur.'),
      );
    }

    if (sub === 'moi') {
      const entry = birthdayService.get(ctx.guild.id, ctx.interaction.user.id);
      if (!entry) {
        return ctx.send(warningEmbed('Aucune date enregistrée', 'Utilisez `/anniversaire definir jour:14 mois:7` pour en ajouter une.'));
      }
      const days = daysUntilBirthday(entry.day, entry.month);
      const age = entry.year ? new Date().getFullYear() - entry.year : null;
      return ctx.send(
        baseEmbed({
          title: `🎂 ${birthdayLabel(entry.day, entry.month)}${entry.year ? ` ${entry.year}` : ''}`,
          description: [
            days === 0 ? '🎉 C’est aujourd’hui ! Joyeux anniversaire !' : `Prochain anniversaire dans **${days} jour(s)**.`,
            age ? `Âge actuel : ${age} ans (${age + 1} à la prochaine date).` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          color: THEME.colors.secondary,
          footer: `Fuseau des annonces : ${DEFAULT_ANNOUNCE_ZONE}`,
        }),
      );
    }

    if (sub === 'liste') {
      const entries = birthdayService.listGuild(ctx.guild.id);
      if (entries.length === 0) {
        return ctx.send(warningEmbed('Aucun anniversaire', 'Personne n’a encore enregistré sa date sur ce serveur.'));
      }
      const today = zonedDate(new Date(), DEFAULT_ANNOUNCE_ZONE);
      const embed = baseEmbed({
        title: `🎂 Anniversaires de ${ctx.guild.name}`,
        description: entries
          .map(
            (entry) =>
              `**${String(entry.day).padStart(2, '0')}/${String(entry.month).padStart(2, '0')}** — <@${entry.userId}>${entry.day === today.day && entry.month === today.month ? ' 🎉 **aujourd’hui**' : ''}`,
          )
          .join('\n')
          .slice(0, 4_000),
        color: THEME.colors.secondary,
        footer: `${humanizeNumber(entries.length)} anniversaire(s) enregistré(s)`,
      });
      return ctx.send(embed);
    }

    // ── Prochains ───────────────────────────────────────────────────────────
    const limit = ctx.interaction.options.getInteger('nombre') ?? 10;
    const upcoming = birthdayService.upcoming(ctx.guild.id, limit);

    if (upcoming.length === 0) {
      return ctx.send(
        errorEmbed('Aucun anniversaire enregistré sur ce serveur. Soyez le premier : `/anniversaire definir`.', 'Liste vide'),
      );
    }

    const embed = baseEmbed({
      title: '🎉 Prochains anniversaires',
      description: upcoming
        .map((entry) => {
          const badge = entry.daysLeft === 0 ? '🎂 **aujourd’hui**' : entry.daysLeft === 1 ? '⏰ **demain**' : `dans **${entry.daysLeft} j**`;
          return `• ${birthdayLabel(entry.day, entry.month)} — <@${entry.userId}> (${badge})`;
        })
        .join('\n'),
      color: THEME.colors.secondary,
      thumbnail: ctx.guild.iconURL({ size: 128 }),
      footer: `Fuseau des annonces : ${DEFAULT_ANNOUNCE_ZONE} • /anniversaire definir pour s’inscrire`,
    });

    return ctx.send(embed);
  },
};

export default birthdayCommand;
