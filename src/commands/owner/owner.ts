import { ActivityType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import type { ElysiaClient } from '../../core/client';
import { baseEmbed, THEME, warningEmbed } from '../../ui/embeds';
import { bulletList, humanizeNumber } from '../../utils/format';
import { db } from '../../core/database';
import { formatDuration } from '../../utils/duration';
import { confirmRow } from '../../ui/components';
import { registerConfirmation } from '../../modules/confirmationModule';
import { shortCode } from '../../utils/random';
import { loadCommands } from '../../core/handlers/commandLoader';
import { publishCommands } from '../../core/handlers/commandPublisher';
import { giveawayService } from '../../services/giveawayService';
import { caseService } from '../../services/caseService';
import { guildService } from '../../services/guildService';

/** Commandes de maintenance réservées aux propriétaires du bot (OWNER_IDS). */
const ownerCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Outils de maintenance réservés aux propriétaires du bot')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('statut').setDescription('État détaillé du bot (mémoire, base de données, tâches)'))
    .addSubcommand((sub) => sub.setName('serveurs').setDescription('Liste tous les serveurs où se trouve le bot'))
    .addSubcommand((sub) =>
      sub
        .setName('quitter')
        .setDescription('Fait quitter le bot d’un serveur')
        .addStringOption((option) => option.setName('identifiant').setDescription('Identifiant du serveur').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('diffuser')
        .setDescription('Envoie un message aux propriétaires de tous les serveurs')
        .addStringOption((option) => option.setName('message').setDescription('Message à diffuser').setRequired(true).setMaxLength(1500)),
    )
    .addSubcommand((sub) => sub.setName('recharger').setDescription('Recharge les commandes et les republie sur Discord'))
    .addSubcommand((sub) =>
      sub
        .setName('activite')
        .setDescription('Change le statut affiché du bot')
        .addStringOption((option) => option.setName('texte').setDescription('Texte affiché').setRequired(true).setMaxLength(128)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('nettoyer')
        .setDescription('Nettoie les données obsolètes (giveaways terminés sans salon, cases orphelines…)'),
    ),
  category: 'owner',
  summary: 'Maintenance du bot (propriétaires)',
  usage: ['/owner statut', '/owner recharger'],
  permissions: { ownerOnly: true },
  cooldown: 2,
  async run(ctx: CommandContext) {
    const client = ctx.client as ElysiaClient;
    const sub = ctx.subcommand() ?? 'statut';

    if (sub === 'statut') {
      const memory = process.memoryUsage();
      const snapshot = client.snapshot();
      const scheduler = (client as unknown as { scheduler?: { status(): Array<{ name: string; runs: number; errors: number }> } }).scheduler;

      const embed = baseEmbed({
        title: '👑 Statut interne',
        color: THEME.colors.secondary,
        thumbnail: client.user?.displayAvatarURL({ size: 128 }),
      });
      embed.addFields(
        { name: 'Processus', value: `PID ${process.pid}\nNode ${process.version}\n${process.platform}/${process.arch}`, inline: true },
        {
          name: 'Mémoire',
          value: `Tas : ${Math.round(memory.heapUsed / 1048576)} Mo\nRSS : ${Math.round(memory.rss / 1048576)} Mo\nUptime : ${formatDuration(snapshot.uptimeMs, { compact: true })}`,
          inline: true,
        },
        { name: 'Discord', value: `Latence : ${snapshot.latencyMs} ms\nServeurs : ${snapshot.guildCount}\nMembres : ${humanizeNumber(snapshot.userCount)}`, inline: true },
        {
          name: 'Base de données',
          value: bulletList(db.stats().map((entry) => `\`${entry.name}\` : ${humanizeNumber(entry.size)}`), { emptyText: 'vide' }),
        },
        {
          name: 'Compteurs',
          value: [
            `Commandes : ${humanizeNumber(client.stats.commandsRun)}`,
            `Interactions : ${humanizeNumber(client.stats.interactionsHandled)}`,
            `Giveaways terminés : ${humanizeNumber(client.stats.giveawaysEnded)}`,
            `Erreurs : ${humanizeNumber(client.stats.errors)}`,
          ].join('\n'),
        },
      );
      if (scheduler) {
        embed.addFields({
          name: 'Tâches planifiées',
          value: bulletList(scheduler.status().map((task) => `\`${task.name}\` — ${task.runs} exécution(s), ${task.errors} erreur(s)`)),
        });
      }
      return ctx.send(embed);
    }

    if (sub === 'serveurs') {
      const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
      return ctx.send(
        baseEmbed({
          title: '🌍 Serveurs du bot',
          description: bulletList(
            guilds.map((guild) => `**${guild.name}** — ${humanizeNumber(guild.memberCount)} membres • \`${guild.id}\``),
            { max: 20 },
          ),
          color: THEME.colors.info,
          footer: `${guilds.length} serveur(s)`,
        }),
      );
    }

    if (sub === 'quitter') {
      const id = ctx.string('identifiant');
      const guild = client.guilds.cache.get(id);
      if (!guild) return ctx.error(`Le bot n’est pas sur le serveur \`${id}\`.`);

      const token = shortCode(10);
      registerConfirmation(token, {
        userId: ctx.interaction.user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        onConfirm: async (buttonInteraction) => {
          const name = guild.name;
          await guild.leave();
          await buttonInteraction.editReply({
            embeds: [baseEmbed({ title: '👋 Serveur quitté', description: `Le bot a quitté **${name}**.`, color: THEME.colors.warning })],
            components: [],
          });
        },
      });

      return ctx.interaction.editReply({
        embeds: [warningEmbed('Confirmation', `Faire quitter **${guild.name}** (${humanizeNumber(guild.memberCount)} membres) ?`)],
        components: [confirmRow(token, { yes: 'Quitter le serveur', no: 'Annuler' })],
      });
    }

    if (sub === 'diffuser') {
      const message = ctx.string('message');
      const owners = await Promise.all(
        [...client.guilds.cache.values()].map(async (guild) => ({
          guild,
          owner: await guild.fetchOwner().catch(() => null),
        })),
      );

      let sent = 0;
      for (const entry of owners) {
        if (!entry.owner) continue;
        try {
          await entry.owner.send({
            embeds: [
              baseEmbed({
                title: '📣 Annonce d’Elysia',
                description: message,
                color: THEME.colors.primary,
                footer: `Serveur : ${entry.guild.name}`,
              }),
            ],
          });
          sent += 1;
        } catch {
          /* MP fermés */
        }
      }

      return ctx.success('Diffusion terminée', `${sent} propriétaire(s) sur ${owners.length} ont pu être prévenus par MP.`);
    }

    if (sub === 'recharger') {
      await ctx.interaction.editReply({
        embeds: [baseEmbed({ title: '⏳ Rechargement…', description: 'Suppression du cache puis republication des commandes.', color: THEME.colors.info })],
      });

      for (const key of [...client.commands.keys()]) client.commands.delete(key);
      await loadCommands(client);
      const count = await publishCommands(client, { clear: true });

      return ctx.send(
        baseEmbed({
          title: '♻️ Commandes rechargées',
          description: [
            `**${client.commands.size}** commande(s) chargée(s) en mémoire.`,
            `**${count}** commande(s) publiée(s) sur Discord.`,
            '',
            'Les modifications de code nécessitent un redéploiement (Render → Manual Deploy).',
          ].join('\n'),
          color: THEME.colors.success,
        }),
      );
    }

    if (sub === 'activite') {
      const text = ctx.string('texte');
      client.user?.setPresence({ activities: [{ name: text, type: ActivityType.Watching }], status: 'online' });
      return ctx.success('Statut mis à jour', `Le bot affiche désormais : **${text}**`);
    }

    if (sub === 'nettoyer') {
      let removedGiveaways = 0;
      for (const giveaway of [...giveawayService.listActive(), ...giveawayService.listEnded('', 200)]) {
        const guild = client.guilds.cache.get(giveaway.guildId);
        if (!guild) {
          giveawayService.delete(giveaway.id);
          removedGiveaways += 1;
        }
      }

      let removedCases = 0;
      for (const guild of client.guilds.cache.values()) {
        const stale = caseService.listGuild(guild.id).filter((entry) => !entry.active && Date.now() - entry.createdAt > 180 * 86_400_000);
        for (const entry of stale.slice(0, 100)) {
          caseService.delete(guild.id, entry.caseNumber);
          removedCases += 1;
        }
        guildService.get(guild.id);
      }

      await db.flushAll();

      return ctx.success(
        'Nettoyage terminé',
        [`Giveaways orphelins supprimés : **${removedGiveaways}**`, `Cases archivées de plus de 6 mois supprimées : **${removedCases}**`].join('\n'),
      );
    }

    return ctx.error('Sous-commande inconnue.');
  },
};

export { PermissionFlagsBits };
export default ownerCommand;
