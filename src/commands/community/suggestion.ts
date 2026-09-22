import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { UsageError } from '../../core/errors';
import { baseEmbed, errorEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { guildService } from '../../services/guildService';
import { SUGGESTION_STATUS, suggestionService, type Suggestion } from '../../services/suggestionService';
import { humanizeNumber, truncate } from '../../utils/format';
import { timestampTag } from '../../utils/duration';

/** Rendu public d'une suggestion (votable). */
export function renderSuggestion(entry: Suggestion, options: { threadMention?: string | null } = {}) {
  const status = SUGGESTION_STATUS[entry.status];
  const score = suggestionService.score(entry);
  const embed = baseEmbed({
    title: `💡 Suggestion #${entry.id.split(':')[1]}`,
    description: entry.text,
    color: status.color,
    footer: `${entry.anonymous ? 'Auteur anonyme' : `Proposé par ${entry.authorTag}`} • ${timestampTag(entry.createdAt, 'R')}`,
    thumbnail: null,
  });

  embed.addFields(
    { name: `${status.emoji} Statut`, value: `**${status.label}**`, inline: true },
    { name: '📈 Score', value: `${score >= 0 ? '+' : ''}${humanizeNumber(score)}`, inline: true },
    {
      name: '🗳️ Votes',
      value: `👍 ${humanizeNumber(entry.upVotes.length)} • 👎 ${humanizeNumber(entry.downVotes.length)}`,
      inline: true,
    },
  );

  if (entry.decidedAt && entry.decidedBy) {
    embed.addFields({
      name: '⚖️ Décision du staff',
      value: `<@${entry.decidedBy}> • ${timestampTag(entry.decidedAt, 'R')}`,
    });
  }

  if (options.threadMention) {
    embed.addFields({ name: '💬 Discussion', value: options.threadMention });
  }

  const rows = buttonRows([
    { id: `sug:up:${entry.id}`, label: `Pour (${entry.upVotes.length})`, emoji: '👍', style: 'success' },
    { id: `sug:down:${entry.id}`, label: `Contre (${entry.downVotes.length})`, emoji: '👎', style: 'danger' },
    { id: `sug:stats:${entry.id}`, label: 'Qui a voté ?', emoji: '🔎', style: 'secondary' },
    { id: `sug:accepted:${entry.id}`, label: 'Accepter', emoji: '✅', style: 'primary' },
    { id: `sug:rejected:${entry.id}`, label: 'Refuser', emoji: '🚫', style: 'primary' },
  ]);

  return { embeds: [embed], components: rows };
}

/**
 * Boîte à suggestions : les membres proposent, tout le monde vote, le staff
 * statue avec des boutons. Un fil de discussion peut être ouvert
 * automatiquement sous chaque suggestion.
 */
const suggestionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Propose une idée au serveur, vote pour celles des autres ou consulte la liste')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('envoyer')
        .setDescription('Publier une suggestion dans le salon dédié')
        .addStringOption((option) => option.setName('idee').setDescription('Votre idée, la plus précise possible').setRequired(true).setMaxLength(1_400))
        .addBooleanOption((option) => option.setName('anonyme').setDescription('Publier sans votre nom')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Dernières suggestions du serveur')
        .addStringOption((option) =>
          option
            .setName('statut')
            .setDescription('Filtrer par statut')
            .addChoices(
              { name: '🟡 Ouvertes', value: 'ouverte' },
              { name: '✅ Acceptées', value: 'acceptee' },
              { name: '❌ Refusées', value: 'refusee' },
              { name: '🗄️ Archivées', value: 'archivee' },
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('top').setDescription('Suggestions les mieux notées du serveur'))
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Salon des suggestions et options (administrateurs)')
        .addChannelOption((option) => option.setName('salon').setDescription('Salon où publier les suggestions'))
        .addBooleanOption((option) => option.setName('anonyme_par_defaut').setDescription('Masquer l’auteur par défaut'))
        .addBooleanOption((option) => option.setName('fils').setDescription('Ouvrir un fil de discussion sous chaque suggestion')),
    ),
  category: 'community',
  summary: 'Boîte à suggestions votables',
  usage: ['/suggestion envoyer idee:Ajouter un salon vocal cinéma', '/suggestion liste statut:ouverte', '/suggestion config salon:#suggestions'],
  cooldown: 10,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'envoyer';
    const settings = guildService.get(ctx.guild.id);

    // ── Configuration ───────────────────────────────────────────────────────
    if (sub === 'config') {
      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return ctx.send(errorEmbed('La configuration des suggestions est réservée aux administrateurs.', 'Action refusée'));
      }

      const channel = ctx.interaction.options.getChannel('salon');
      const anonymous = ctx.interaction.options.getBoolean('anonyme_par_defaut');
      const threads = ctx.interaction.options.getBoolean('fils');
      const patch: Record<string, unknown> = {};

      if (channel) {
        patch.channels = { suggestions: channel.id };
        patch.modules = { suggestions: true };
      }
      const community: Record<string, unknown> = {};
      if (anonymous !== null) community.anonymousByDefault = anonymous;
      if (threads !== null) community.createThreads = threads;
      if (Object.keys(community).length > 0) patch.community = { suggestions: community };

      if (Object.keys(patch).length === 0) {
        throw new UsageError('Renseignez au moins une option (`salon`, `anonyme_par_defaut` ou `fils`).');
      }

      const updated = guildService.update(ctx.guild.id, patch as never);
      return ctx.send(
        baseEmbed({
          title: '💡 Boîte à suggestions configurée',
          description: [
            `**Salon :** ${updated.channels.suggestions ? `<#${updated.channels.suggestions}>` : '❌ non défini'}`,
            `**Anonyme par défaut :** ${updated.community.suggestions.anonymousByDefault ? 'oui' : 'non'}`,
            `**Fils de discussion :** ${updated.community.suggestions.createThreads ? 'oui' : 'non'}`,
            `**Module :** ${updated.modules.suggestions ? '🟢 actif' : '🔴 inactif'}`,
          ].join('\n'),
          color: THEME.colors.success,
          footer: 'Les membres peuvent proposer via /suggestion envoyer',
        }),
      );
    }

    // ── Liste & top ─────────────────────────────────────────────────────────
    if (sub === 'liste' || sub === 'top') {
      const status = ctx.interaction.options.getString('statut') as Suggestion['status'] | null;
      const entries = sub === 'top' ? suggestionService.top(ctx.guild.id, 10) : suggestionService.listGuild(ctx.guild.id, status ?? undefined, 10);

      if (entries.length === 0) {
        return ctx.send(
          warningEmbed(
            'Aucune suggestion',
            settings.channels.suggestions
              ? 'Utilisez `/suggestion envoyer idee:…` pour lancer la première !'
              : 'Configurez d’abord un salon : `/suggestion config salon:#suggestions`.',
          ),
        );
      }

      const embed = baseEmbed({
        title: sub === 'top' ? '🏆 Suggestions les mieux notées' : '💡 Suggestions récentes',
        description: entries
          .map(
            (entry) =>
              `${SUGGESTION_STATUS[entry.status].emoji} **#${entry.id.split(':')[1]}** ${truncate(entry.text.replace(/\n/g, ' '), 110)}\n┕ 👍 ${entry.upVotes.length} • 👎 ${entry.downVotes.length} • score ${suggestionService.score(entry)} • ${timestampTag(entry.createdAt, 'R')}`,
          )
          .join('\n'),
        color: THEME.colors.primary,
        footer: `${humanizeNumber(suggestionService.countGuild(ctx.guild.id))} suggestion(s) enregistrée(s) sur ce serveur`,
      });
      return ctx.send(embed);
    }

    // ── Envoi ───────────────────────────────────────────────────────────────
    if (!settings.modules.suggestions) {
      return ctx.send(errorEmbed('Le module « suggestions » est désactivé (`/config modules`).', 'Module inactif'));
    }
    const channelId = settings.channels.suggestions;
    if (!channelId) {
      return ctx.send(errorEmbed('Aucun salon de suggestions n’est configuré. Un administrateur doit lancer `/suggestion config salon:#salon`.', 'Configuration requise'));
    }

    const channel = ctx.guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      return ctx.send(errorEmbed('Le salon de suggestions configuré n’existe plus ou n’est pas textuel.', 'Salon introuvable'));
    }

    const idea = ctx.string('idee');
    const anonymous = ctx.interaction.options.getBoolean('anonyme') ?? settings.community.suggestions.anonymousByDefault;

    const entry = suggestionService.create({
      guildId: ctx.guild.id,
      channelId: channel.id,
      authorId: ctx.interaction.user.id,
      authorTag: ctx.interaction.user.tag,
      text: idea,
      anonymous,
    });

    const message = await channel.send(renderSuggestion(entry));
    suggestionService.update(entry.id, { messageId: message.id });

    let threadMention: string | null = null;
    if (settings.community.suggestions.createThreads && 'threads' in channel) {
      const thread = await (channel as import('discord.js').TextChannel)
        .threads.create({
          name: `Suggestion #${entry.id.split(':')[1]} — discussion`,
          autoArchiveDuration: 1_440,
          reason: 'Discussion de la suggestion',
        })
        .catch(() => null);
      if (thread) {
        threadMention = thread.toString();
        suggestionService.update(entry.id, { threadId: thread.id });
        await message.edit(renderSuggestion(suggestionService.get(entry.id)!, { threadMention }));
      }
    }

    return ctx.send(
      baseEmbed({
        title: '💡 Suggestion publiée',
        description: [`Votre idée est en ligne : ${message.url}`, '', 'Les membres votent avec 👍 / 👎 — le staff statuera ensuite.'].join('\n'),
        color: THEME.colors.success,
        footer: `Identifiant : ${entry.id}${anonymous ? ' • publication anonyme' : ''}`,
      }),
    );
  },
};

export default suggestionCommand;
