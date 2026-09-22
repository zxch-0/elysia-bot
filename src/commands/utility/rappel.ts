import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { parseDuration, timestampTag } from '../../utils/duration';
import { bulletList, truncate } from '../../utils/format';
import { MAX_REMINDERS_PER_GUILD, MAX_REMINDERS_PER_USER, reminderService } from '../../services/reminderService';
import { UsageError } from '../../core/errors';

/**
 * Rappels persistants : le bot vous mentionne (ou non) dans le salon de votre
 * choix à l'heure prévue, même après un redémarrage.
 */
const reminderCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rappel')
    .setDescription('Programme un rappel, liste-les ou supprime-les')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Programme un rappel')
        .addStringOption((option) => option.setName('dans').setDescription('Délai (10m, 2h30, 3j) ou date (25/12/2026 20:00)').setRequired(true).setMaxLength(40))
        .addStringOption((option) => option.setName('quoi').setDescription('Ce dont il faut se souvenir').setRequired(true).setMaxLength(700))
        .addChannelOption((option) => option.setName('salon').setDescription('Salon où vous prévenir (salon courant par défaut)'))
        .addBooleanOption((option) => option.setName('mention').setDescription('Vous mentionner au moment du rappel (oui par défaut)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Vos rappels en attente')
        .addBooleanOption((option) => option.setName('tous').setDescription('Voir aussi les rappels des autres membres (staff)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime un rappel en attente')
        .addStringOption((option) =>
          option.setName('identifiant').setDescription('Ex. 3 ou 123456789:3').setRequired(true).setMaxLength(30).setAutocomplete(true),
        ),
    ),
  category: 'utility',
  summary: 'Rappels persistants',
  usage: ['/rappel creer dans:2h quoi:sortir le chien', '/rappel liste'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';

    // ── Création ────────────────────────────────────────────────────────────
    if (sub === 'creer') {
      const raw = ctx.string('dans');
      const text = ctx.string('quoi');
      const mention = ctx.interaction.options.getBoolean('mention') ?? true;
      const channel = (ctx.interaction.options.getChannel('salon') ?? ctx.interaction.channel) as { id: string } | null;

      const delay = parseDuration(raw);
      if (delay === null || delay <= 0) {
        throw new UsageError('Délai invalide : utilisez `10m`, `2h`, `3j`… (ou `/compte-a-rebours` pour une date précise).');
      }
      if (delay < 30_000) throw new UsageError('Le délai minimum est de 30 secondes.');
      if (delay > 365 * 86_400_000) throw new UsageError('Un rappel ne peut pas dépasser un an.');

      if (reminderService.countPending(ctx.guild.id, ctx.interaction.user.id) >= MAX_REMINDERS_PER_USER) {
        throw new UsageError(`Vous avez déjà ${MAX_REMINDERS_PER_USER} rappels en attente — supprimez-en un avec \`/rappel supprimer\`.`);
      }
      if (reminderService.listGuild(ctx.guild.id).length >= MAX_REMINDERS_PER_GUILD) {
        throw new UsageError('Le serveur a atteint la limite de rappels actifs. Réessayez plus tard.');
      }

      const reminder = reminderService.create({
        guildId: ctx.guild.id,
        channelId: channel?.id ?? ctx.interaction.channelId,
        userId: ctx.interaction.user.id,
        userTag: ctx.interaction.user.tag,
        text,
        dueAt: Date.now() + delay,
        mention: mention,
      });

      const embed = successEmbed(
        'Rappel programmé',
        [
          `**Quand :** ${timestampTag(reminder.dueAt, 'R')} (${timestampTag(reminder.dueAt, 'f')})`,
          `**Quoi :** ${truncate(reminder.text, 300)}`,
          `**Où :** <#${reminder.channelId}>${mention ? ' • je vous mentionnerai' : ''}`,
          '',
          `Identifiant : \`${reminder.id}\` — suppression avec \`/rappel supprimer identifiant:${reminder.id}\``,
        ].join('\n'),
      );
      return ctx.send(
        embed,
        buttonRows([
          { id: `rem:cancel:${reminder.id}`, label: 'Annuler ce rappel', emoji: '🗑️', style: 'danger' },
          { id: `rem:snooze:${reminder.id}:15`, label: '+15 min', emoji: '⏰', style: 'secondary' },
        ]),
      );
    }

    // ── Liste ───────────────────────────────────────────────────────────────
    if (sub === 'liste') {
      const everyone = ctx.interaction.options.getBoolean('tous') ?? false;
      const mine = reminderService.listUser(ctx.guild.id, ctx.interaction.user.id);
      const canSeeAll = everyone && ctx.member.permissions.has(PermissionFlagsBits.ManageGuild);
      const entries = canSeeAll ? reminderService.listGuild(ctx.guild.id) : mine;

      if (entries.length === 0) {
        return ctx.send(warningEmbed('Aucun rappel', 'Utilisez `/rappel creer dans:10m quoi:…` pour en programmer un.'));
      }

      const embed = baseEmbed({
        title: '⏰ Rappels en attente',
        description: bulletList(
          entries
            .slice(0, 20)
            .map(
              (entry) =>
                `\`${entry.id}\` — ${timestampTag(entry.dueAt, 'R')} • <#${entry.channelId}>\n┕ ${truncate(entry.text, 120)}${canSeeAll ? ` — <@${entry.userId}>` : ''}`,
            ),
          { max: 20 },
        ),
        color: THEME.colors.info,
        footer: `${entries.length} rappel(s) en attente`,
      });
      return ctx.send(embed);
    }

    // ── Suppression ─────────────────────────────────────────────────────────
    const identifier = ctx.string('identifiant');
    const normalized = identifier.includes(':') ? identifier : `${ctx.guild.id}:${identifier.replace(/[^0-9]/g, '')}`;
    const reminder = reminderService.get(normalized);

    if (!reminder) return ctx.send(errorEmbed(`Aucun rappel \`${identifier}\` n’existe (il a peut-être déjà été déclenché).`, 'Rappel introuvable'));
    if (reminder.userId !== ctx.interaction.user.id && !ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return ctx.send(errorEmbed('Ce rappel appartient à quelqu’un d’autre.', 'Action refusée'));
    }

    reminderService.delete(reminder.id);
    return ctx.send(successEmbed('Rappel supprimé', `Le rappel \`${reminder.id}\` (${truncate(reminder.text, 120)}) a été annulé.`));
  },

  /** Autocomplétion des rappels de l'auteur. */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'identifiant' || !interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const query = String(focused.value ?? '').toLowerCase();
    const entries = reminderService
      .listUser(interaction.guildId, interaction.user.id)
      .filter((entry) => query.length === 0 || entry.id.includes(query) || entry.text.toLowerCase().includes(query))
      .slice(0, 25);

    await interaction.respond(
      entries.map((entry) => ({ name: `${entry.id} • ${truncate(entry.text, 60)}`, value: entry.id })),
    );
  },
};

export default reminderCommand;
