import { logger } from '../core/logger';
import { db } from '../core/database';
import { guildService } from '../services/guildService';
import { panelService } from '../services/panelService';
import { giveawayService } from '../services/giveawayService';
import { caseService } from '../services/caseService';

const log = logger.child('dry-run');

/**
 * Mode démonstration : crée un jeu de données fictif (panneau de rôles,
 * giveaway, cases de modération) pour vérifier le tableau de bord et la
 * persistance sans se connecter à Discord.
 *
 * Lancement : `DRY_RUN=1 npm run preview`
 */
export async function runDryRunDemo(): Promise<void> {
  const guildId = '000000000000000000';
  const settings = guildService.get(guildId);

  const existing = panelService.listGuild(guildId);
  if (existing.length === 0) {
    panelService.create({
      guildId,
      name: 'Choisis tes rôles',
      channelId: '000000000000000001',
      title: '🎭 Choisis tes rôles',
      description:
        'Cliquez sur les boutons ci-dessous pour recevoir ou retirer un rôle.\n\n> *Exemple généré en mode démonstration.*',
      roles: [
        { roleId: '111111111111111111', label: 'Gamer', emoji: '🎮', style: 'primary' },
        { roleId: '222222222222222222', label: 'Artiste', emoji: '🎨', style: 'secondary' },
        { roleId: '333333333333333333', label: 'Musique', emoji: '🎵', style: 'success' },
        { roleId: '444444444444444444', label: 'Notifications', emoji: '🔔', style: 'danger' },
      ],
      mode: 'buttons',
      behaviour: 'toggle',
      footer: 'Démonstration Elysia',
      createdBy: '000000000000000000',
    });
    log.success('Panneau de démonstration créé');
  }

  if (giveawayService.listActive(guildId).length === 0) {
    giveawayService.create({
      guildId,
      channelId: '000000000000000001',
      prize: 'Nitro 1 mois',
      description: 'Giveaway de démonstration — participez avec le bouton 🎉',
      winnerCount: 2,
      hostId: '000000000000000000',
      hostTag: 'Demo#0000',
      durationMs: 24 * 3_600_000,
      requireAccountAge: 0,
    });
    log.success('Giveaway de démonstration créé');
  }

  if (caseService.listGuild(guildId).length === 0) {
    caseService.create({
      guildId,
      caseNumber: guildService.nextCaseId(guildId),
      type: 'warn',
      targetId: '555555555555555555',
      targetTag: 'Membre#0001',
      moderatorId: '666666666666666666',
      moderatorTag: 'Modérateur#0002',
      reason: 'Exemple de case générée en mode démonstration',
      duration: 0,
      expiresAt: 0,
      autoRevertAt: null,
    });
  }

  await db.flushAll();

  log.success('Données de démonstration prêtes : ouvrez le tableau de bord web pour vérifier.');
  log.info(`Modules : ${Object.entries(settings.modules).map(([key, enabled]) => `${key}=${enabled ? 'on' : 'off'}`).join(' ')}`);
}
