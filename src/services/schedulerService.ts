import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { caseService } from './caseService';
import { giveawayService } from './giveawayService';
import { guildService } from './guildService';

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

    for (const task of this.tasks) {
      task.timer = setInterval(() => void this.runTask(task), task.intervalMs);
      task.timer.unref?.();
    }
    log.success(`${this.tasks.length} tâches planifiées (giveaways, expirations, entretien)`);
    // Première exécution rapide après le démarrage.
    setTimeout(() => void this.endDueGiveaways(), 5_000).unref?.();
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
