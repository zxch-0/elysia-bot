import { Events } from 'discord.js';
import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { executeAutocomplete, executeCommand } from '../core/handlers/commandHandler';
import { handleComponentInteraction } from '../core/handlers/interactionHandler';
import { guildService } from '../services/guildService';
import { moderationService } from '../services/moderationService';
import { logMemberEvent, logMessageEvent, renderWelcomeTemplate, sendToLog } from '../services/logService';
import { baseEmbed, THEME } from '../ui/embeds';

const log = logger.child('events');

/**
 * Branche tous les événements Discord du bot.
 * Chaque écouteur est isolé : une erreur n'interrompt jamais les autres.
 */
export function registerEvents(client: ElysiaClient, onReady?: () => void): void {
  const guard = (name: string, handler: (...args: any[]) => Promise<void> | void) => {
    return (...args: any[]) => {
      void (async () => {
        try {
          await handler(...args);
        } catch (error) {
          client.stats.errors += 1;
          log.error(`Écouteur « ${name} » en échec`, error as Error);
        }
      })();
    };
  };

  // ── Démarrage ────────────────────────────────────────────────────────────
  client.once(Events.ClientReady, guard('ready', async (readyClient: ElysiaClient) => {
    log.success(`Connectée en tant que ${readyClient.user?.tag} — ${readyClient.guilds.cache.size} serveur(s)`);
    readyClient.user?.setPresence({
      status: 'online',
      activities: [{ name: '/help • modération & giveaways', type: 3 }],
    });
    onReady?.();
  }));

  // ── Commandes & interactions ─────────────────────────────────────────────
  client.on(
    Events.InteractionCreate,
    guard('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          log.warn(`Commande inconnue reçue : /${interaction.commandName}`);
          await interaction.reply({ content: '❌ Cette commande n’est pas disponible.', ephemeral: true }).catch(() => undefined);
          return;
        }
        await executeCommand(interaction, client, command);
        return;
      }

      if (interaction.isAutocomplete()) {
        await executeAutocomplete(interaction, client);
        return;
      }

      if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
        await handleComponentInteraction(interaction, client);
      }
    }),
  );

  // ── Arrivées / départs ───────────────────────────────────────────────────
  client.on(
    Events.GuildMemberAdd,
    guard('guildMemberAdd', async (member) => {
      const settings = guildService.get(member.guild.id);

      if (settings.modules.logs) await logMemberEvent({ guild: member.guild, type: 'join', member });

      await moderationService.applyAutoRoles(member.guild, member).catch((error) => log.warn('Auto-rôles', error));

      if (settings.modules.welcome && settings.channels.welcome) {
        const template = renderWelcomeTemplate(settings.welcome.message, member);
        const embed = baseEmbed({
          title: `Bienvenue sur ${member.guild.name} !`,
          description: template,
          color: settings.welcome.color,
          thumbnail: member.user.displayAvatarURL({ size: 256 }),
          footer: `Membre n°${member.guild.memberCount}`,
        });
        await sendToLog(member.guild, settings.channels.welcome, settings.welcome.embed ? embed : baseEmbed({ description: template }));
      }
    }),
  );

  client.on(
    Events.GuildMemberRemove,
    guard('guildMemberRemove', async (member) => {
      const settings = guildService.get(member.guild.id);
      if (settings.modules.logs) await logMemberEvent({ guild: member.guild, type: 'leave', member });

      if (settings.goodbye.enabled && settings.channels.goodbye) {
        const text = (settings.goodbye.message ?? '')
          .replaceAll('{user}', member.user?.tag ?? 'Un membre')
          .replaceAll('{mention}', member.user ? `<@${member.user.id}>` : '')
          .replaceAll('{server}', member.guild.name)
          .replaceAll('{membercount}', String(member.guild.memberCount));
        await sendToLog(member.guild, settings.channels.goodbye, baseEmbed({ description: text, color: THEME.colors.warning }));
      }
    }),
  );

  // ── Logs de messages ─────────────────────────────────────────────────────
  client.on(
    Events.MessageDelete,
    guard('messageDelete', async (message) => {
      if (!message.guild || message.author?.bot || !message.content) return;
      await logMessageEvent({
        guild: message.guild,
        type: 'delete',
        channelId: message.channelId,
        author: message.author,
        content: message.content,
      });
    }),
  );

  client.on(
    Events.MessageUpdate,
    guard('messageUpdate', async (before, after) => {
      if (!after.guild || after.author?.bot) return;
      if (before.content === after.content) return;
      if (!before.content && !after.content) return;
      await logMessageEvent({
        guild: after.guild,
        type: 'update',
        channelId: after.channelId,
        author: after.author ?? before.author!,
        content: after.content ?? '',
        before: before.content ?? '',
      });
    }),
  );

  // ── Modération : bans manuels via l'interface Discord ────────────────────
  client.on(
    Events.GuildBanAdd,
    guard('guildBanAdd', async (ban) => {
      const settings = guildService.get(ban.guild.id);
      if (!settings.modules.logs) return;
      await sendToLog(
        ban.guild,
        settings.channels.memberLog,
        baseEmbed({
          title: '🔨 Membre banni',
          description: [
            `**Membre :** ${ban.user.tag} (\`${ban.user.id}\`)`,
            `**Raison :** ${ban.reason ?? 'Non précisée (action manuelle ou via l’interface Discord)'}`,
          ].join('\n'),
          color: THEME.colors.error,
        }),
      );
    }),
  );

  // ── Nouveau serveur : message d'accueil à l'administrateur ───────────────
  client.on(
    Events.GuildCreate,
    guard('guildCreate', async (guild) => {
      guildService.get(guild.id);
      log.success(`Nouveau serveur : ${guild.name} (${guild.id})`);
      const embed = baseEmbed({
        title: '💜 Merci de m’avoir invitée !',
        description: [
          `Bonjour **${guild.name}** ! Voici comment démarrer en 3 minutes :`,
          '',
          '**1.** `/config convivialite` — configure les salons de logs, bienvenue et les rôles staff.',
          '**2.** `/config salut` — vérifie que toutes les permissions sont bonnes.',
          '**3.** `/rolepanel creer` — crée un panneau de rôles avec boutons, image et menu déroulant.',
          '**4.** `/giveaway creer` — lance ton premier giveaway (réservé aux admins).',
          '',
          'Tape `/help` pour la liste complète des commandes.',
        ].join('\n'),
        color: THEME.colors.primary,
        thumbnail: client.user?.displayAvatarURL({ size: 256 }),
        footer: 'Elysia • /help pour tout savoir',
      });

      const owner = await guild.fetchOwner().catch(() => null);
      await owner?.send({ embeds: [embed] }).catch(() => undefined);
      const systemChannel = guild.systemChannel;
      if (systemChannel) await systemChannel.send({ embeds: [embed] }).catch(() => undefined);
    }),
  );

  // ── Erreurs du client ────────────────────────────────────────────────────
  client.on(Events.Error, (error) => log.error('Erreur du client Discord', error));
  client.on(Events.Warn, (message) => log.warn(`Avertissement Discord : ${message}`));
  client.rest.on('rateLimited', (info) =>
    log.debug(`Rate limit : ${info.route} (${info.timeToReset} ms) — ${info.method} ${info.url}`),
  );

  log.success('Événements Discord enregistrés (ready, interactions, membres, messages, bans)');
}

export { Events };
