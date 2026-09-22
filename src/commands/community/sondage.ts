import { SlashCommandBuilder, type ActionRowBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { UsageError } from '../../core/errors';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows, selectMenu } from '../../ui/components';
import { parseDuration, timestampTag } from '../../utils/duration';
import { humanizeNumber, progressBar, percent } from '../../utils/format';
import { MAX_POLL_OPTIONS, pollService, type Poll } from '../../services/pollService';

/** Séparateurs acceptés entre les propositions (« | », « ; », saut de ligne). */
const SEPARATORS = /\s*[|;\n]\s*/;

export function parsePollChoices(raw: string): string[] {
  return raw
    .split(SEPARATORS)
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0)
    .slice(0, MAX_POLL_OPTIONS);
}

/** Rendu public d'un sondage (résultats en direct, barres de progression). */
export function renderPoll(poll: Poll, options: { showVoters?: boolean } = {}) {
  const { lines, totalVoters, totalVotes } = pollService.results(poll);
  const showVoters = options.showVoters ?? !poll.anonymous;

  const description = lines
    .map((line, index) => {
      const letters = String.fromCharCode(0x1f1e6 + index);
      const voters = showVoters && line.voters.length > 0 ? ` — ${line.voters.slice(0, 12).map((id) => `<@${id}>`).join(' ')}${line.voters.length > 12 ? ` +${line.voters.length - 12}` : ''}` : '';
      return [
        `${letters} **${line.option.label}** — ${humanizeNumber(line.count)} vote(s) (${percent(line.count, Math.max(totalVotes, 1))})`,
        `${progressBar(line.count, Math.max(totalVotes, 1), 14)}${voters}`,
      ].join('\n');
    })
    .join('\n\n');

  const embed = baseEmbed({
    title: `📊 ${poll.question}`,
    description,
    color: THEME.colors.primary,
    footer: `${humanizeNumber(totalVoters)} votant(s) • ${humanizeNumber(totalVotes)} vote(s) • ${poll.multiple ? 'choix multiple' : 'choix unique'}${poll.anonymous ? ' • anonyme' : ''}`,
  });

  embed.addFields({
    name: poll.ended ? '🔒 Sondage terminé' : '⏳ Fin',
    value: poll.ended
      ? `Clôturé ${poll.endedAt ? timestampTag(poll.endedAt, 'R') : ''}`
      : poll.endsAt > 0
        ? `${timestampTag(poll.endsAt, 'R')} (${timestampTag(poll.endsAt, 'f')})`
        : 'sans limite de temps',
    inline: true,
  });

  const leaders = pollService.leaders(poll);
  if (poll.ended && leaders.length > 0) {
    embed.addFields({
      name: '🏆 Résultat',
      value: leaders.map((line) => `**${line.option.label}** (${humanizeNumber(line.count)} vote(s))`).join(' • '),
      inline: false,
    });
  }

  const rows: ActionRowBuilder<any>[] = poll.ended
    ? []
    : [
        selectMenu({
          id: `poll:vote:${poll.id}`,
          placeholder: poll.multiple ? 'Choisissez une ou plusieurs propositions…' : 'Votez pour une proposition…',
          minValues: 1,
          maxValues: poll.multiple ? Math.min(poll.options.length, MAX_POLL_OPTIONS) : 1,
          options: poll.options.map((option, index) => ({
            value: option.id,
            label: `${String.fromCharCode(0x1f1e6 + index)} ${option.label}`,
          })),
        }),
      ];

  const buttons = [];
  if (!poll.ended) {
    buttons.push(
      { id: `poll:results:${poll.id}`, label: 'Résultats détaillés', emoji: '🔎', style: 'secondary' as const },
      { id: `poll:clear:${poll.id}`, label: 'Retirer mon vote', emoji: '🚪', style: 'secondary' as const },
      { id: `poll:end:${poll.id}`, label: 'Clôturer', emoji: '🏁', style: 'danger' as const },
    );
  } else {
    buttons.push({ id: `poll:refresh:${poll.id}`, label: 'Actualiser', emoji: '🔄', style: 'secondary' as const });
  }
  rows.push(...buttonRows(buttons));

  return { embeds: [embed], components: rows };
}

/**
 * Sondages interactifs : jusqu'à 10 propositions, choix multiple, vote
 * anonyme, clôture automatique à l'échéance et résultats en direct.
 */
const pollCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('sondage')
    .setDescription('Crée un sondage interactif avec boutons de vote et résultats en direct')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('question').setDescription('Question posée').setRequired(true).setMaxLength(240))
    .addStringOption((option) =>
      option
        .setName('choix')
        .setDescription('Propositions séparées par « | » (2 à 10)')
        .setRequired(true)
        .setMaxLength(900),
    )
    .addStringOption((option) => option.setName('duree').setDescription('Durée du vote (ex. 1h, 2j) — vide = illimité').setMaxLength(20))
    .addBooleanOption((option) => option.setName('multiple').setDescription('Autoriser plusieurs choix par membre'))
    .addBooleanOption((option) => option.setName('anonyme').setDescription('Masquer qui a voté quoi'))
    .addRoleOption((option) => option.setName('ping').setDescription('Rôle à mentionner au lancement'))
    .addBooleanOption((option) => option.setName('epingler').setDescription('Épingler le message du sondage')),
  category: 'community',
  summary: 'Sondage interactif',
  usage: ['/sondage question:Pizza ou burger ? choix:Pizza | Burger | Sushi', '/sondage question:… choix:… multiple:true duree:2j'],
  cooldown: 10,
  async run(ctx: CommandContext) {
    const question = ctx.string('question');
    const choices = parsePollChoices(ctx.string('choix'));
    const durationRaw = ctx.interaction.options.getString('duree');
    const multiple = ctx.interaction.options.getBoolean('multiple') ?? false;
    const anonymous = ctx.interaction.options.getBoolean('anonyme') ?? false;
    const pingRole = ctx.interaction.options.getRole('ping');
    const pinned = ctx.interaction.options.getBoolean('epingler') ?? false;

    if (choices.length < 2) {
      throw new UsageError('Indiquez au moins **deux** propositions séparées par « | ». Exemple : `Pizza | Burger | Sushi`.');
    }
    if (new Set(choices).size !== choices.length) {
      throw new UsageError('Deux propositions identiques ont été détectées : rendez-les uniques.');
    }

    let durationMs = 0;
    if (durationRaw) {
      const parsed = parseDuration(durationRaw);
      if (parsed === null || parsed <= 0) throw new UsageError('Durée invalide (ex. `1h`, `2j`).');
      if (parsed > 30 * 86_400_000) throw new UsageError('Durée maximale : 30 jours.');
      durationMs = parsed;
    }

    const channel = ctx.interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new UsageError('Ce salon ne permet pas de publier un sondage.');
    }

    const poll = pollService.create({
      guildId: ctx.guild.id,
      channelId: channel.id,
      authorId: ctx.interaction.user.id,
      authorTag: ctx.interaction.user.tag,
      question,
      options: choices,
      multiple,
      anonymous,
      durationMs,
    });

    const payload = renderPoll(poll);
    // Publication dans le salon (le contexte répond de son côté en éphémère).
    const message = await channel.send({
      content: pingRole ? `${pingRole} — nouveau sondage !` : undefined,
      ...payload,
      allowedMentions: pingRole ? { roles: [pingRole.id] } : undefined,
    });
    pollService.update(poll.id, { messageId: message.id });
    if (pinned) await message.pin().catch(() => undefined);

    return ctx.send(
      baseEmbed({
        title: '✅ Sondage publié',
        description: [
          `Question : **${question}**`,
          `Propositions : ${choices.map((choice) => `\`${choice}\``).join(', ')}`,
          `Fin : ${poll.endsAt > 0 ? timestampTag(poll.endsAt, 'R') : '**sans limite**'}`,
          '',
          `➜ ${message.url}`,
        ].join('\n'),
        color: THEME.colors.success,
        footer: `Identifiant : ${poll.id}`,
      }),
    );
  },
};

export default pollCommand;
