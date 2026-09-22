import { PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { countdownService } from '../../services/countdownService';
import { parseTargetDate, formatInZone } from '../../utils/time';
import { timestampTag, formatDuration } from '../../utils/duration';
import { humanizeNumber, truncate } from '../../utils/format';
import { UsageError } from '../../core/errors';
import { countdownButtons } from '../../modules/countdownModule';

/**
 * Comptes à rebours : la date est affichée en horodatage Discord (chaque
 * membre voit automatiquement l'heure dans son propre fuseau), et le bot
 * annonce l'échéance avec la mention du rôle prévenu.
 */
const countdownCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('compte-a-rebours')
    .setDescription('Programme un compte à rebours (sortie de jeu, événement, vacances…)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Crée un compte à rebours')
        .addStringOption((option) => option.setName('titre').setDescription('Événement attendu').setRequired(true).setMaxLength(200))
        .addStringOption((option) =>
          option
            .setName('echeance')
            .setDescription('Durée (3j, 12h) ou date (25/12/2026 20:00, 2026-12-25)')
            .setRequired(true)
            .setMaxLength(40),
        )
        .addStringOption((option) => option.setName('description').setDescription('Détails affichés dans l’embed').setMaxLength(700))
        .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication (salon courant par défaut)'))
        .addRoleOption((option) => option.setName('ping').setDescription('Rôle mentionné le jour J')),
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Comptes à rebours du serveur'))
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime un compte à rebours')
        .addStringOption((option) =>
          option.setName('identifiant').setDescription('Identifiant affiché (ex. 3)').setRequired(true).setMaxLength(30).setAutocomplete(true),
        ),
    ),
  category: 'community',
  summary: 'Compte à rebours d’événement',
  usage: ['/compte-a-rebours creer titre:Sortie de GTA 6 echeance:2026-12-31', '/compte-a-rebours creer titre:Tournoi echeance:3j ping:@Joueurs'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';

    // ── Création ────────────────────────────────────────────────────────────
    if (sub === 'creer') {
      const title = ctx.string('titre');
      const raw = ctx.string('echeance');
      const description = ctx.interaction.options.getString('description');
      const pingRole = ctx.interaction.options.getRole('ping');
      const channel = (ctx.interaction.options.getChannel('salon') ?? ctx.interaction.channel) as TextChannel | null;

      const targetAt = parseTargetDate(raw);
      if (!targetAt) {
        throw new UsageError('Échéance invalide. Formats acceptés : `3j`, `12h30`, `25/12/2026 20:00`, `2026-12-25`.');
      }

      const delta = targetAt - Date.now();
      if (delta < 60_000) throw new UsageError('L’échéance doit être au moins dans une minute.');
      if (delta > 10 * 365 * 86_400_000) throw new UsageError('Échéance trop lointaine (10 ans maximum).');
      if (!channel?.isTextBased() || channel.isDMBased()) throw new UsageError('Ce salon ne permet pas de publier un compte à rebours.');

      const entry = countdownService.create({
        guildId: ctx.guild.id,
        channelId: channel.id,
        title,
        description: description,
        targetAt,
        createdBy: ctx.interaction.user.id,
        createdByTag: ctx.interaction.user.tag,
        pingRoleId: pingRole?.id ?? null,
      });

      const embed = baseEmbed({
        title: `⏳ ${title}`,
        description: [
          description ?? '',
          '',
          `**Dans :** ${timestampTag(targetAt, 'R')} — ${timestampTag(targetAt, 'F')}`,
          `Soit **${formatDuration(delta, { compact: true })}** à partir de maintenant.`,
          pingRole ? `🔔 <@&${pingRole.id}> sera prévenu le jour J.` : '',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        color: THEME.colors.primary,
        footer: `Compte à rebours ${entry.id} • lancé par ${ctx.interaction.user.tag}`,
      });

      const message = await channel.send({ embeds: [embed], components: countdownButtons(entry.id) });
      countdownService.update(entry.id, { messageId: message.id });

      return ctx.send(
        successEmbed(
          'Compte à rebours lancé',
          [
            `**${title}** — échéance ${timestampTag(targetAt, 'R')}`,
            `Publié dans <#${channel.id}> : ${message.url}`,
            `Heure locale du salon : ${formatInZone(new Date(targetAt), 'Europe/Paris').time} (Paris)`,
            '',
            `Boutons sur le message : ⏱️ temps restant, 🔔 « Me prévenir » (mention privée le jour J).`,
            `Suppression : \`/compte-a-rebours supprimer identifiant:${entry.id}\``,
          ].join('\n'),
        ),
      );
    }

    // ── Liste ───────────────────────────────────────────────────────────────
    if (sub === 'liste') {
      const entries = countdownService.listGuild(ctx.guild.id);
      if (entries.length === 0) {
        return ctx.send(warningEmbed('Aucun compte à rebours', 'Créez-en un avec `/compte-a-rebours creer`.'));
      }

      const embed = baseEmbed({
        title: '⏳ Comptes à rebours',
        description: entries
          .slice(0, 15)
          .map(
            (entry) =>
              `${entry.ended ? '🔒' : '⏳'} **${truncate(entry.title, 60)}**\n┕ \`${entry.id}\` • ${entry.ended ? `terminé ${timestampTag(entry.endedAt ?? entry.targetAt, 'R')}` : `${timestampTag(entry.targetAt, 'R')} • dans ${formatDuration(entry.targetAt - Date.now(), { compact: true })}`} • <#${entry.channelId}>`,
          )
          .join('\n'),
        color: THEME.colors.primary,
        footer: `${humanizeNumber(countdownService.listActive(ctx.guild.id).length)} actif(s) sur ${humanizeNumber(entries.length)}`,
      });
      return ctx.send(embed);
    }

    // ── Suppression ─────────────────────────────────────────────────────────
    const identifier = ctx.string('identifiant').trim();
    const normalized = identifier.includes(':') ? identifier : `${ctx.guild.id}:${identifier.replace(/[^0-9]/g, '')}`;
    const entry = countdownService.get(normalized);
    if (!entry) return ctx.send(errorEmbed(`Compte à rebours \`${identifier}\` introuvable.`, 'Introuvable'));

    const isAuthor = entry.createdBy === ctx.interaction.user.id;
    if (!isAuthor && !ctx.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return ctx.send(errorEmbed('Seul l’auteur du compte à rebours (ou un modérateur) peut le supprimer.', 'Action refusée'));
    }

    if (entry.messageId) {
      const channel = ctx.guild.channels.cache.get(entry.channelId);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const message = await channel.messages.fetch(entry.messageId).catch(() => null);
        await message?.edit({ embeds: [baseEmbed({ title: `🗑️ ${entry.title}`, description: 'Compte à rebours supprimé.', color: THEME.colors.neutral })], components: [] }).catch(() => undefined);
      }
    }
    countdownService.delete(entry.id);

    return ctx.send(successEmbed('Compte à rebours supprimé', `**${truncate(entry.title, 100)}** (\`${entry.id}\`) a été retiré.`));
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'identifiant' || !interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const query = String(focused.value ?? '').toLowerCase();
    const entries = countdownService
      .listGuild(interaction.guildId)
      .filter((entry) => query.length === 0 || entry.id.includes(query) || entry.title.toLowerCase().includes(query))
      .slice(0, 25);

    await interaction.respond(entries.map((entry) => ({ name: `${entry.id} • ${truncate(entry.title, 70)}`, value: entry.id })));
  },
};

export default countdownCommand;
