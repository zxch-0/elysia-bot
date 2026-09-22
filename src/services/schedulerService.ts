import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { caseService } from './caseService';
import { giveawayService } from './giveawayService';
import { guildService } from './guildService';
import { reminderService } from './reminderService';
import { birthdayService } from './birthdayService';
import { countdownService } from './countdownService';
import { pollService } from './pollService';
import { purgeExpired as purgeDuels } from '../fun/duel';
import { baseEmbed, THEME } from '../ui/embeds';
import { buttonRows } from '../ui/components';
import { timestampTag } from '../utils/duration';

const log = logger.child('scheduler');

interface ScheduledTask {
  name: string;
  intervalMs: number;
  timer?: NodeJS.Timeout;
  lastRun: number;
  runs: number;
  errors: number;
  run: () => Promise<unknown> | unknown;
}

/**
 * Planificateur interne léger (sans dépendance cron).
 * Chaque tâche tourne à intervalle régulier et absorbe ses propres erreurs.
 */
export class SchedulerService {
  private tasks: ScheduledTask[] = [];

  constructor(private readonly client: ElysiaClient) {}

  private register(name: string, intervalMs: number, run: () => Promise<unknown> | unknown): void {
    this.tasks.push({ name, intervalMs, lastRun: 0, runs: 0, errors: 0, run });
  }

  /** Programme les tâches récurrentes. */
  start(): void {
    this.register('giveaways', 15_000, () => this.endDueGiveaways());
    this.register('refresh-giveaways', 120_000, () => this.refreshGiveawayMessages());
    this.register('expire-cases', 60_000, () => this.expireTempCases());
    this.register('housekeeping', 30 * 60_000, () => this.housekeeping());
    this.register('reminders', 20_000, () => this.fireReminders());
    this.register('countdowns', 30_000, () => this.endDueCountdowns());
    this.register('polls', 20_000, () => this.closeDuePolls());
    this.register('birthdays', 5 * 60_000, () => this.announceBirthdays());

    for (const task of this.tasks) {
      task.timer = setInterval(() => void this.runTask(task), task.intervalMs);
      task.timer.unref?.();
    }
    log.success(`${this.tasks.length} tâches planifiées (giveaways, rappels, anniversaires, sondages, entretien)`);
    // Première exécution rapide après le démarrage.
    setTimeout(() => {
      void this.endDueGiveaways();
      void this.fireReminders();
      void this.endDueCountdowns();
      void this.announceBirthdays();
    }, 10_000).unref?.();
  }

  private async runTask(task: ScheduledTask): Promise<void> {
    try {
      await task.run();
      task.runs += 1;
      task.lastRun = Date.now();
    } catch (error) {
      task.errors += 1;
      log.error(`Tâche « ${task.name} » en échec`, error as Error);
    }
  }

  /** Termine les giveaways arrivés à échéance. */
  async endDueGiveaways(): Promise<number> {
    if (!this.client.isReady()) return 0;
    const due = giveawayService.listActive().filter((giveaway) => giveaway.endsAt <= Date.now());
    let ended = 0;

    for (const giveaway of due) {
      const guild = this.client.guilds.cache.get(giveaway.guildId);
      if (!guild) {
        giveawayService.update(giveaway.id, { ended: true, endedAt: Date.now(), winners: [] });
        continue;
      }
      try {
        const { winners } = await giveawayService.end(giveaway, guild);
        this.client.stats.giveawaysEnded += 1;
        ended += 1;

        // Annonce du ou des gagnants dans le salon.
        const channel = guild.channels.cache.get(giveaway.channelId);
        if (channel?.isTextBased()) {
          const mention = winners.length > 0 ? winners.map((id) => `<@${id}>`).join(', ') : null;
          await channel
            .send({
              content: mention
                ? `🎉 Félicitations ${mention} ! Vous remportez **${giveaway.prize}** !`
                : `😢 Aucune participation valide pour **${giveaway.prize}**…`,
              allowedMentions: { parse: ['users'] },
            })
            .catch(() => undefined);
        }
        log.info(`Giveaway #${giveaway.id} terminé automatiquement`);
      } catch (error) {
        log.error(`Fin automatique du giveaway ${giveaway.id} impossible`, error as Error);
      }
    }
    return ended;
  }

  /** Rafraîchit les embeds des giveaways actifs (progression, participants). */
  private async refreshGiveawayMessages(): Promise<void> {
    if (!this.client.isReady()) return;
    const active = giveawayService.listActive();
    for (const giveaway of active.slice(0, 25)) {
      const guild = this.client.guilds.cache.get(giveaway.guildId);
      if (!guild) continue;
      await giveawayService.updateMessage(guild, giveaway);
    }
    if (active.length > 0) log.debug(`${active.length} giveaway(s) rafraîchi(s)`);
  }

  /** Clôt les cases dont la sanction temporaire a expiré. */
  private async expireTempCases(): Promise<void> {
    const expired = caseService.listExpired();
    for (const entry of expired) {
      caseService.update(entry.guildId, entry.caseNumber, { active: false, autoRevertAt: null });

      const guild = this.client.guilds.cache.get(entry.guildId);
      const settings = guild ? guildService.get(guild.id) : undefined;
      const muteRoleId = settings?.roles.mute;

      // Bannissement temporaire arrivé à échéance → débannissement automatique.
      if (guild && entry.metadata?.temp === true && entry.type === 'ban') {
        await guild.bans
          .remove(entry.targetId, `Fin automatique du bannissement temporaire (case #${entry.caseNumber})`)
          .catch(() => undefined);
        log.info(`Débannissement automatique de ${entry.targetTag} (case #${entry.caseNumber})`);
      }

      if (guild && muteRoleId && entry.metadata?.mode === 'role') {
        const member = await guild.members.fetch(entry.targetId).catch(() => null);
        if (member?.roles.cache.has(muteRoleId)) {
          await member.roles.remove(muteRoleId, `Fin automatique de la sanction (case #${entry.caseNumber})`).catch(() => undefined);
        }
      }
    }
    if (expired.length > 0) log.info(`${expired.length} sanction(s) expirée(s) archivée(s)`);
  }

  /** Déclenche les rappels arrivés à échéance (`/rappel`). */
  async fireReminders(): Promise<number> {
    if (!this.client.isReady()) return 0;
    const due = reminderService.due();
    let fired = 0;

    for (const reminder of due) {
      reminderService.markFired(reminder.id);
      const guild = this.client.guilds.cache.get(reminder.guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(reminder.channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;

      const embed = baseEmbed({
        title: '⏰ Rappel !',
        description: [`**${reminder.text}**`, '', `Programmé ${timestampTag(reminder.createdAt, 'R')} par <@${reminder.userId}>.`].join('\n'),
        color: THEME.colors.info,
        footer: `Rappel ${reminder.id} • /rappel creer pour en ajouter un`,
      });

      try {
        await channel.send({
          content: reminder.mention ? `<@${reminder.userId}>` : undefined,
          embeds: [embed],
          components: buttonRows([
            { id: `rem:done:${reminder.id}`, label: 'C’est fait !', emoji: '✅', style: 'success' },
            { id: `rem:later:${reminder.id}`, label: '+10 minutes', emoji: '⏰', style: 'secondary' },
          ]),
        });
        fired += 1;
      } catch (error) {
        log.warn(`Rappel ${reminder.id} non délivré`, error);
      }
    }

    if (fired > 0) log.info(`${fired} rappel(s) déclenché(s)`);
    return fired;
  }

  /** Termine les comptes à rebours arrivés à échéance (`/compte-a-rebours`). */
  async endDueCountdowns(): Promise<number> {
    if (!this.client.isReady()) return 0;
    const due = countdownService.due();
    let ended = 0;

    for (const entry of due) {
      countdownService.markEnded(entry.id);
      ended += 1;

      const guild = this.client.guilds.cache.get(entry.guildId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(entry.channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;

      const finished = baseEmbed({
        title: '🎉 C’est l’heure !',
        description: [`**${entry.title}**`, entry.description ?? '', '', `Compte à rebours lancé par <@${entry.createdBy}> ${timestampTag(entry.createdAt, 'R')}.`]
          .filter((line) => line !== '')
          .join('\n'),
        color: THEME.colors.success,
      });

      const message = entry.messageId ? await channel.messages.fetch(entry.messageId).catch(() => null) : null;
      await message?.edit({ embeds: [finished], components: [] }).catch(() => undefined);
      await channel
        .send({ content: entry.pingRoleId ? `<@&${entry.pingRoleId}>` : `<@${entry.createdBy}>`, embeds: [finished] })
        .catch(() => undefined);
    }

    if (ended > 0) log.info(`${ended} compte(s) à rebours arrivé(s) à échéance`);
    return ended;
  }

  /** Clôture les sondages dont la durée est écoulée (`/sondage`). */
  async closeDuePolls(): Promise<number> {
    if (!this.client.isReady()) return 0;
    const due = pollService.due();
    let closed = 0;

    for (const poll of due) {
      const updated = pollService.end(poll.id);
      if (!updated) continue;
      closed += 1;

      const guild = this.client.guilds.cache.get(poll.guildId);
      const channel = guild?.channels.cache.get(poll.channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;

      const { renderPoll } = await import('../commands/community/sondage');
      const payload = renderPoll(updated);
      const message = poll.messageId ? await channel.messages.fetch(poll.messageId).catch(() => null) : null;
      await message?.edit({ embeds: payload.embeds, components: [] }).catch(() => undefined);

      const leaders = pollService.leaders(updated);
      await channel
        .send({
          content:
            leaders.length > 0
              ? `🔒 Sondage **${poll.question}** terminé — gagnant : **${leaders.map((line) => line.option.label).join(', ')}**.`
              : `🔒 Sondage **${poll.question}** terminé — aucun vote enregistré.`,
        })
        .catch(() => undefined);
    }

    if (closed > 0) log.info(`${closed} sondage(s) clôturé(s)`);
    return closed;
  }

  /** Félicite les membres dont c'est l'anniversaire (`/anniversaire`). */
  async announceBirthdays(): Promise<number> {
    if (!this.client.isReady()) return 0;
    let announced = 0;

    for (const guild of this.client.guilds.cache.values()) {
      const settings = guildService.get(guild.id);
      if (!settings.modules.birthdays || !settings.community.birthdays.announce || !settings.channels.birthday) continue;

      const pending = birthdayService.pendingAnnouncements(guild.id);
      if (pending.length === 0) continue;

      const channel = guild.channels.cache.get(settings.channels.birthday);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;

      for (const entry of pending) {
        const embed = baseEmbed({
          title: '🎂 Joyeux anniversaire !',
          description: [
            `Aujourd’hui, le serveur fête l’anniversaire de <@${entry.userId}> ! 🎉`,
            '',
            'Tout le monde lui souhaite une excellente journée 💜',
          ].join('\n'),
          color: THEME.colors.secondary,
          footer: `Anniversaire enregistré le ${entry.day}/${entry.month}${entry.year ? `/${entry.year}` : ''} • /anniversaire definir`,
        });

        try {
          await channel.send({
            content: `<@${entry.userId}>`,
            embeds: [embed],
            allowedMentions: { users: [entry.userId] },
          });
          birthdayService.markAnnounced(guild.id, entry.userId);
          announced += 1;
        } catch (error) {
          log.warn(`Annonce d’anniversaire impossible pour ${entry.userId}`, error);
        }
      }
    }

    if (announced > 0) log.info(`${announced} anniversaire(s) annoncé(s)`);
    return announced;
  }

  /** Entretien périodique : purge des cooldowns et des vieilles données. */
  private async housekeeping(): Promise<void> {
    for (const [key, timestamps] of this.client.cooldowns) {
      const fresh = timestamps.filter((timestamp) => Date.now() - timestamp < 10 * 60_000);
      if (fresh.length === 0) this.client.cooldowns.delete(key);
      else this.client.cooldowns.set(key, fresh);
    }

    // Supprime les panneaux orphelins (salon supprimé) pour éviter les erreurs.
    const { panelService } = await import('./panelService');
    for (const guild of this.client.guilds.cache.values()) {
      for (const panel of panelService.listGuild(guild.id)) {
        const issues = panelService.diagnose(guild, panel);
        if (issues.length > 0) log.debug(`Panneau « ${panel.name} » : ${issues.join(' | ')}`);
      }
    }

    // Purge des données communautaires arrivées à expiration.
    const purged = [
      reminderService.purgeOld(),
      countdownService.purgeOld(),
      pollService.purgeOld(),
      purgeDuels(),
    ].reduce((sum, count) => sum + count, 0);
    if (purged > 0) log.info(`${purged} entrée(s) expirée(s) purgée(s)`);

    log.debug(`Entretien terminé — ${Math.round(process.memoryUsage().heapUsed / 1048576)} Mo de tas utilisé`);
  }

  /** Arrête toutes les tâches (utilisé à l'arrêt propre). */
  stop(): void {
    for (const task of this.tasks) if (task.timer) clearInterval(task.timer);
    this.tasks = [];
  }

  status(): Array<{ name: string; intervalMs: number; runs: number; errors: number; lastRun: number | null }> {
    return this.tasks.map((task) => ({
      name: task.name,
      intervalMs: task.intervalMs,
      runs: task.runs,
      errors: task.errors,
      lastRun: task.lastRun || null,
    }));
  }
}
