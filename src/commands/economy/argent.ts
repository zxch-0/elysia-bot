import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, successEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { economyService, CURRENCY_EMOJI } from '../../services/economyService';
import { guildService } from '../../services/guildService';
import { humanizeNumber } from '../../utils/format';
import { UsageError } from '../../core/errors';
import { isGuildAdmin } from '../../utils/permissions';

const MENTION = (id: string) => `<@${id}>`;
const money = (amount: number) => `**${humanizeNumber(amount)}** ${CURRENCY_EMOJI}`;

const MAX_TRANSFER = 1_000_000;
const MAX_ADMIN_GRANT = 10_000_000;

/**
 * Économie du serveur : argent gagné en discutant, portefeuille par membre,
 * transferts, classement des fortunes et commandes d'administration.
 * L'argent se dépense aussi au blackjack (`/blackjack`).
 */
const moneyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('argent')
    .setDescription('Économie : solde, classement des fortunes, transferts et administration')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Affiche le solde et les statistiques d’un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre concerné (vous par défaut)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('classement')
        .setDescription('Classement des membres les plus riches')
        .addIntegerOption((option) => option.setName('taille').setDescription('Nombre de membres affichés (5 à 25)').setMinValue(5).setMaxValue(25)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('donner')
        .setDescription('Donne de l’argent à un autre membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre bénéficiaire').setRequired(true))
        .addIntegerOption((option) => option.setName('montant').setDescription('Montant à donner').setRequired(true).setMinValue(1).setMaxValue(MAX_TRANSFER)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ajouter')
        .setDescription('Crédite de l’argent à un membre (administrateurs)')
        .addUserOption((option) => option.setName('membre').setDescription('Membre à créditer').setRequired(true))
        .addIntegerOption((option) => option.setName('montant').setDescription('Montant à ajouter').setRequired(true).setMinValue(1).setMaxValue(MAX_ADMIN_GRANT)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retire de l’argent à un membre (administrateurs)')
        .addUserOption((option) => option.setName('membre').setDescription('Membre à débiter').setRequired(true))
        .addIntegerOption((option) => option.setName('montant').setDescription('Montant à retirer').setRequired(true).setMinValue(1).setMaxValue(MAX_ADMIN_GRANT)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reinitialiser')
        .setDescription('Remet le solde d’un membre à zéro (administrateurs)')
        .addUserOption((option) => option.setName('membre').setDescription('Membre à remettre à zéro').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Réglages du système d’argent (administrateurs)')
        .addBooleanOption((option) => option.setName('actif').setDescription('Activer ou désactiver le gain d’argent'))
        .addIntegerOption((option) => option.setName('argent_min').setDescription('Argent minimum par message').setMinValue(1).setMaxValue(1_000))
        .addIntegerOption((option) => option.setName('argent_max').setDescription('Argent maximum par message').setMinValue(1).setMaxValue(5_000))
        .addIntegerOption((option) => option.setName('delai').setDescription('Délai anti-flood entre deux gains, en secondes').setMinValue(0).setMaxValue(3_600))
        .addIntegerOption((option) => option.setName('capital').setDescription('Capital de départ des nouveaux portefeuilles').setMinValue(0).setMaxValue(100_000)),
    ),
  category: 'economy',
  summary: 'Argent gagné en discutant, fortunes et blackjack',
  usage: ['/argent voir', '/argent classement', '/argent donner membre:@Léo montant:100', '/argent ajouter membre:@Léo montant:500'],
  cooldown: 3,
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'voir';
    const settings = guildService.get(ctx.guild.id);
    const moduleOff = !settings.modules.economy || !settings.economy.enabled;

    // ── Solde d'un membre ───────────────────────────────────────────────────
    if (sub === 'voir') {
      const target = ctx.interaction.options.getUser('membre') ?? ctx.interaction.user;
      const entry = economyService.entry(ctx.guild.id, target.id);
      const wallet = entry?.wallet ?? 0;
      const rank = economyService.rank(ctx.guild.id, target.id);
      const casino = entry?.casinoNet ?? 0;

      const embed = baseEmbed({
        title: `💰 Portefeuille de ${target.username}`,
        description: [
          `Solde : ${money(wallet)}`,
          `Rang : ${rank ? `**#${rank}**` : 'non classé'} sur ${humanizeNumber(economyService.countActive(ctx.guild.id))} membre(s)`,
          moduleOff
            ? '⚠️ *Le gain d’argent par message est désactivé sur ce serveur.*'
            : `*Gagnez de l’argent en discutant (${humanizeNumber(settings.economy.moneyMin)}–${humanizeNumber(settings.economy.moneyMax)} ${CURRENCY_EMOJI} par message).*`,
        ].join('\n'),
        color: memberColor(ctx, target.id),
        thumbnail: target.displayAvatarURL({ size: 256 }),
        footer: `Misez votre argent au blackjack : /blackjack • Transfert : /argent donner`,
      });

      embed.addFields(
        { name: '💬 Gagné en discutant', value: money(entry?.earned ?? 0), inline: true },
        { name: '🃏 Bilan casino', value: `${casino > 0 ? '+' : ''}${humanizeNumber(casino)} ${CURRENCY_EMOJI}`, inline: true },
        { name: '🎲 Total misé', value: money(entry?.wagered ?? 0), inline: true },
        { name: '📨 Reçu par transfert', value: money(entry?.transfersIn ?? 0), inline: true },
        { name: '📤 Envoyé par transfert', value: money(entry?.transfersOut ?? 0), inline: true },
        { name: '🗨️ Messages récompensés', value: humanizeNumber(entry?.messages ?? 0), inline: true },
      );

      return ctx.send(embed);
    }

    // ── Classement des fortunes ─────────────────────────────────────────────
    if (sub === 'classement') {
      const size = ctx.interaction.options.getInteger('taille') ?? 10;
      const board = economyService.leaderboard(ctx.guild.id, size);
      if (board.length === 0) {
        return ctx.send(
          warningEmbed('Classement vide', 'Personne n’a encore d’argent. Il suffit de discuter pour en gagner !'),
        );
      }

      const medals = ['🥇', '🥈', '🥉'];
      const embed = baseEmbed({
        title: `💎 Classement des fortunes — ${ctx.guild.name}`,
        description: board
          .map((entry, index) => {
            const medal = medals[index] ?? `**${index + 1}.**`;
            const casino = entry.casinoNet;
            const detail = casino !== 0 ? ` • casino : ${casino > 0 ? '+' : ''}${humanizeNumber(casino)}` : '';
            return `${medal} ${MENTION(entry.userId)} — ${money(entry.wallet)}${detail}`;
          })
          .join('\n'),
        color: THEME.colors.primary,
        thumbnail: ctx.guild.iconURL({ size: 128 }),
        footer: `${humanizeNumber(economyService.countActive(ctx.guild.id))} membre(s) classé(s) • ${humanizeNumber(economyService.totalMoney(ctx.guild.id))} ${CURRENCY_EMOJI} en circulation • aussi visible sur le site (onglet Économie)`,
      });

      const myRank = economyService.rank(ctx.guild.id, ctx.interaction.user.id);
      if (myRank) embed.addFields({ name: 'Votre position', value: `**#${myRank}**`, inline: true });
      return ctx.send(embed);
    }

    // ── Transfert entre membres ─────────────────────────────────────────────
    if (sub === 'donner') {
      const target = ctx.user('membre');
      const amount = ctx.integer('montant');

      if (target.bot) throw new UsageError('Les bots n’ont pas de portefeuille.');
      if (target.id === ctx.interaction.user.id) throw new UsageError('Vous ne pouvez pas vous donner de l’argent à vous-même !');
      if (!settings.modules.economy || !settings.economy.enabled) {
        return ctx.send(errorEmbed('Le système d’argent est désactivé sur ce serveur.', 'Action refusée'));
      }

      const result = economyService.transfer(
        ctx.guild.id,
        ctx.interaction.user.id,
        ctx.interaction.user.tag,
        target.id,
        target.tag,
        amount,
      );
      if (!result) {
        const wallet = economyService.balance(ctx.guild.id, ctx.interaction.user.id);
        return ctx.send(
          errorEmbed(
            `Solde insuffisant : vous avez ${money(wallet)} et vous essayez d’envoyer ${money(amount)}.`,
            'Transfert impossible',
          ),
        );
      }

      return ctx.send(
        successEmbed(
          'Transfert effectué',
          [
            `${ctx.interaction.user} a envoyé ${money(result.amount)} à ${target}.`,
            `Nouveaux soldes : ${ctx.interaction.user.username} ${money(result.from.wallet)} • ${target.username} ${money(result.to.wallet)}`,
          ].join('\n'),
        ),
      );
    }

    // ── Commandes administrateur ────────────────────────────────────────────
    if (sub === 'ajouter' || sub === 'retirer' || sub === 'reinitialiser' || sub === 'config') {
      if (!isGuildAdmin(ctx.member, settings)) {
        return ctx.send(errorEmbed('Ces commandes sont réservées aux administrateurs du serveur.', 'Action refusée'));
      }
    }

    if (sub === 'ajouter') {
      const target = ctx.user('membre');
      const amount = ctx.integer('montant');
      if (target.bot) throw new UsageError('Les bots n’ont pas de portefeuille.');
      const entry = economyService.credit(ctx.guild.id, target.id, target.tag, amount);
      return ctx.send(
        successEmbed(
          'Argent ajouté',
          [
            `${money(amount)} crédité(s) sur le compte de ${target}.`,
            `Nouveau solde : ${money(entry.wallet)}`,
          ].join('\n'),
        ),
      );
    }

    if (sub === 'retirer') {
      const target = ctx.user('membre');
      const amount = ctx.integer('montant');
      if (target.bot) throw new UsageError('Les bots n’ont pas de portefeuille.');
      const before = economyService.balance(ctx.guild.id, target.id);
      if (before <= 0) {
        return ctx.send(errorEmbed(`${target} a déjà un solde de ${money(0)}.`, 'Rien à retirer'));
      }
      const removed = economyService.debit(ctx.guild.id, target.id, target.tag, amount);
      const entry = economyService.entry(ctx.guild.id, target.id);
      return ctx.send(
        successEmbed(
          'Argent retiré',
          [
            removed < amount
              ? `Seulement ${money(removed)} ont pu être retirés (solde borné à zéro).`
              : `${money(removed)} retiré(s) du compte de ${target}.`,
            `Nouveau solde : ${money(entry?.wallet ?? 0)}`,
          ].join('\n'),
        ),
      );
    }

    if (sub === 'reinitialiser') {
      const target = ctx.user('membre');
      if (target.bot) throw new UsageError('Les bots n’ont pas de portefeuille.');
      economyService.setWallet(ctx.guild.id, target.id, target.tag, 0);
      return ctx.send(
        successEmbed('Portefeuille remis à zéro', `Le solde de ${target} est maintenant de ${money(0)}.`),
      );
    }

    // ── Configuration ───────────────────────────────────────────────────────
    const active = ctx.interaction.options.getBoolean('actif');
    const moneyMin = ctx.interaction.options.getInteger('argent_min');
    const moneyMax = ctx.interaction.options.getInteger('argent_max');
    const delay = ctx.interaction.options.getInteger('delai');
    const capital = ctx.interaction.options.getInteger('capital');

    const patch: Record<string, unknown> = {};
    if (active !== null) patch.enabled = active;
    if (moneyMin !== null) patch.moneyMin = moneyMin;
    if (moneyMax !== null) patch.moneyMax = moneyMax;
    if (delay !== null) patch.cooldownMs = delay * 1_000;
    if (capital !== null) patch.startingBalance = capital;

    if (Object.keys(patch).length === 0) {
      throw new UsageError('Renseignez au moins une option à modifier.');
    }

    const merged = { ...settings.economy, ...patch } as typeof settings.economy;
    if (merged.moneyMax < merged.moneyMin) {
      throw new UsageError('`argent_max` doit être supérieur ou égal à `argent_min`.');
    }

    const updated = guildService.update(ctx.guild.id, { economy: patch } as never);

    return ctx.send(
      successEmbed(
        'Système d’argent mis à jour',
        [
          `**Actif :** ${updated.modules.economy && updated.economy.enabled ? 'oui' : 'non'}`,
          `**Argent par message :** ${updated.economy.moneyMin} → ${updated.economy.moneyMax} ${CURRENCY_EMOJI}`,
          `**Délai anti-flood :** ${Math.round(updated.economy.cooldownMs / 1_000)} s`,
          `**Capital de départ :** ${humanizeNumber(updated.economy.startingBalance)} ${CURRENCY_EMOJI}`,
        ].join('\n'),
      ),
    );
  },
};

/** Couleur du membre (ou couleur du thème par défaut). */
function memberColor(ctx: CommandContext, userId: string): number {
  const member = ctx.guild.members.cache.get(userId);
  return member?.displayColor || THEME.colors.primary;
}

export default moneyCommand;
