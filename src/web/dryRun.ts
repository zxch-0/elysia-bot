import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { db } from '../core/database';
import { guildService } from '../services/guildService';
import { panelService } from '../services/panelService';
import { giveawayService } from '../services/giveawayService';
import { caseService } from '../services/caseService';
import { levelService, type LevelEntry } from '../services/levelService';
import { gameService } from '../services/gameService';
import { suggestionService } from '../services/suggestionService';
import { pollService } from '../services/pollService';
import { birthdayService } from '../services/birthdayService';
import { countdownService } from '../services/countdownService';
import { reminderService } from '../services/reminderService';
import { noteService } from '../services/noteService';

const log = logger.child('dry-run');

/** Serveur fictif du mode démonstration. */
const GUILD_ID = '000000000000000000';
const CHANNEL_ID = '000000000000000001';
const HOST = { id: '000000000000000000', tag: 'Demo#0000' };

const DEMO_MEMBERS = [
  { id: '100000000000000001', tag: 'Alice', xp: 48_600, messages: 1_248 },
  { id: '100000000000000002', tag: 'Bryan', xp: 31_200, messages: 902 },
  { id: '100000000000000003', tag: 'Chloé', xp: 22_500, messages: 640 },
  { id: '100000000000000004', tag: 'Dorian', xp: 12_100, messages: 418 },
];

/**
 * Mode démonstration : crée un jeu de données fictif (serveur, panneau de
 * rôles, giveaway, cases de modération, niveaux, suggestions, sondages,
 * anniversaires, rappels, notes et parties de mini-jeux) pour vérifier les
 * 5 pages du site et la persistance **sans se connecter à Discord**.
 *
 * Lancement : `DRY_RUN=1 npm run preview`
 */
export async function runDryRunDemo(client?: ElysiaClient): Promise<void> {
  const guildId = GUILD_ID;
  const now = Date.now();
  const settings = guildService.get(guildId);

  // ── Serveur fictif ────────────────────────────────────────────────────────
  // Sans lui, toutes les pages filtrées par serveur (classements, communauté,
  // données) seraient vides en mode démonstration.
  if (client && !client.guilds.cache.has(guildId)) {
    client.guilds.cache.set(guildId, {
      id: guildId,
      name: 'Serveur de démonstration',
      memberCount: 128,
      ownerId: HOST.id,
      joinedTimestamp: now - 86_400_000 * 42,
      iconURL: () => null,
    } as never);
  }

  // ── Panneau de rôles ─────────────────────────────────────────────────────
  if (panelService.listGuild(guildId).length === 0) {
    panelService.create({
      guildId,
      name: 'Choisis tes rôles',
      channelId: CHANNEL_ID,
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
      createdBy: HOST.id,
    });
    log.success('Panneau de démonstration créé');
  }

  // ── Giveaway ─────────────────────────────────────────────────────────────
  if (giveawayService.listActive(guildId).length === 0) {
    const giveaway = giveawayService.create({
      guildId,
      channelId: CHANNEL_ID,
      prize: 'Nitro 1 mois',
      description: 'Giveaway de démonstration — participez avec le bouton 🎉',
      winnerCount: 2,
      hostId: HOST.id,
      hostTag: HOST.tag,
      durationMs: 24 * 3_600_000,
      requireAccountAge: 0,
    });
    for (const member of DEMO_MEMBERS.slice(0, 3)) giveawayService.addEntry(giveaway.id, member.id);
    log.success('Giveaway de démonstration créé');
  }

  // ── Sanctions ────────────────────────────────────────────────────────────
  if (caseService.listGuild(guildId).length <= 1) {
    const cases = [
      { type: 'warn' as const, target: DEMO_MEMBERS[3], reason: 'Langage inapproprié dans #général', duration: 0 },
      { type: 'mute' as const, target: DEMO_MEMBERS[2], reason: 'Spam de mentions', duration: 3_600_000 },
      { type: 'kick' as const, target: '100000000000000009', reason: 'Publicité non autorisée', duration: 0 },
      { type: 'ban' as const, target: '100000000000000010', reason: 'Raid — compte compromis', duration: 0 },
    ];
    for (const entry of cases) {
      caseService.create({
        guildId,
        caseNumber: guildService.nextCaseId(guildId),
        type: entry.type,
        targetId: typeof entry.target === 'string' ? entry.target : entry.target.id,
        targetTag: typeof entry.target === 'string' ? 'Membre suspect' : `${entry.target.tag}#0000`,
        moderatorId: '666666666666666666',
        moderatorTag: 'Modérateur#0002',
        reason: entry.reason,
        duration: entry.duration,
        expiresAt: entry.duration > 0 ? now + entry.duration : 0,
        autoRevertAt: entry.duration > 0 ? now + entry.duration : null,
      });
    }
  }

  // ── Notes du staff ───────────────────────────────────────────────────────
  if (noteService.topGuild(guildId, 1).length === 0) {
    noteService.add({
      guildId,
      userId: DEMO_MEMBERS[3].id,
      targetTag: `${DEMO_MEMBERS[3].tag}#0000`,
      authorId: '666666666666666666',
      authorTag: 'Modérateur#0002',
      text: 'Prévenu oralement pour le spam — récidive possible.',
    });
    noteService.add({
      guildId,
      userId: DEMO_MEMBERS[3].id,
      targetTag: `${DEMO_MEMBERS[3].tag}#0000`,
      authorId: HOST.id,
      authorTag: HOST.tag,
      text: 'Membre très actif par ailleurs, à suivre sur une semaine.',
    });
    noteService.add({
      guildId,
      userId: DEMO_MEMBERS[1].id,
      targetTag: `${DEMO_MEMBERS[1].tag}#0000`,
      authorId: '666666666666666666',
      authorTag: 'Modérateur#0002',
      text: 'Demande de renseignements sur les salons de sondage.',
    });
  }

  // ── Niveaux ──────────────────────────────────────────────────────────────
  if (levelService.countActive(guildId) === 0) {
    const levels = db.collection<LevelEntry>('levels');
    for (const member of DEMO_MEMBERS) {
      const entry = levelService.addXp(guildId, member.id, `${member.tag}#0000`, member.xp);
      // `addXp` ne touche pas au compteur de messages : on le complète ici pour
      // que la page Communauté affiche des chiffres réalistes.
      entry.messages = member.messages;
      levels.set(entry);
    }
    log.success(`${DEMO_MEMBERS.length} profils de niveaux de démonstration créés`);
  }

  // ── Suggestions ──────────────────────────────────────────────────────────
  if (suggestionService.countGuild(guildId) === 0) {
    const ideas = [
      { text: 'Ajouter un salon #entraide pour les devoirs et questions techniques.', status: 'acceptee' as const },
      { text: 'Organiser une soirée jeux communautaire tous les vendredis.', status: 'ouverte' as const },
      { text: 'Créer un rôle @Annonces pour les événements du serveur.', status: 'refusee' as const },
    ];

    ideas.forEach((idea, index) => {
      const entry = suggestionService.create({
        guildId,
        channelId: CHANNEL_ID,
        authorId: DEMO_MEMBERS[index].id,
        authorTag: `${DEMO_MEMBERS[index].tag}#0000`,
        text: idea.text,
        anonymous: index === 2,
      });
      suggestionService.vote(entry.id, DEMO_MEMBERS[0].id, 'up');
      suggestionService.vote(entry.id, DEMO_MEMBERS[1].id, index === 0 ? 'up' : 'down');
      if (idea.status !== 'ouverte') suggestionService.setStatus(entry.id, idea.status, HOST.id);
    });
    log.success('Suggestions de démonstration créées');
  }

  // ── Sondages ─────────────────────────────────────────────────────────────
  if (pollService.listGuild(guildId).length === 0) {
    const active = pollService.create({
      guildId,
      channelId: CHANNEL_ID,
      authorId: HOST.id,
      authorTag: HOST.tag,
      question: 'Quel événement pour le prochain week-end ?',
      options: ['Tournoi de mini-jeux', 'Soirée film', 'Session dessin'],
      durationMs: 48 * 3_600_000,
    });
    pollService.castVote(active.id, DEMO_MEMBERS[0].id, ['0']);
    pollService.castVote(active.id, DEMO_MEMBERS[1].id, ['0']);
    pollService.castVote(active.id, DEMO_MEMBERS[2].id, ['2']);

    const closed = pollService.create({
      guildId,
      channelId: CHANNEL_ID,
      authorId: HOST.id,
      authorTag: HOST.tag,
      question: 'Faut-il ouvrir un salon vocal d’étude ?',
      options: ['Oui, tout de suite', 'Oui, mais plus tard', 'Non'],
      durationMs: 24 * 3_600_000,
    });
    pollService.castVote(closed.id, DEMO_MEMBERS[0].id, ['0']);
    pollService.castVote(closed.id, DEMO_MEMBERS[3].id, ['1']);
    pollService.end(closed.id);
    log.success('Sondages de démonstration créés');
  }

  // ── Anniversaires ────────────────────────────────────────────────────────
  if (birthdayService.listGuild(guildId).length === 0) {
    const today = new Date();
    const soon = new Date(today.getTime() + 5 * 86_400_000);
    birthdayService.set({ guildId, userId: DEMO_MEMBERS[0].id, userTag: `${DEMO_MEMBERS[0].tag}#0000`, day: today.getDate(), month: today.getMonth() + 1 });
    birthdayService.set({ guildId, userId: DEMO_MEMBERS[1].id, userTag: `${DEMO_MEMBERS[1].tag}#0000`, day: soon.getDate(), month: soon.getMonth() + 1 });
    birthdayService.set({ guildId, userId: DEMO_MEMBERS[2].id, userTag: `${DEMO_MEMBERS[2].tag}#0000`, day: 24, month: 12 });
  }

  // ── Comptes à rebours & rappels ──────────────────────────────────────────
  if (countdownService.listActive(guildId).length === 0) {
    countdownService.create({
      guildId,
      channelId: CHANNEL_ID,
      title: 'Anniversaire du serveur',
      description: 'Deux ans déjà ! 🎂',
      targetAt: now + 12 * 86_400_000,
      createdBy: HOST.id,
      createdByTag: HOST.tag,
    });
    countdownService.create({
      guildId,
      channelId: CHANNEL_ID,
      title: 'Tournoi de mini-jeux',
      targetAt: now + 3 * 86_400_000 + 7_200_000,
      createdBy: HOST.id,
      createdByTag: HOST.tag,
    });
  }

  if (reminderService.listGuild(guildId).length === 0) {
    reminderService.create({
      guildId,
      channelId: CHANNEL_ID,
      userId: DEMO_MEMBERS[0].id,
      userTag: `${DEMO_MEMBERS[0].tag}#0000`,
      text: 'Publier le récapitulatif de la semaine',
      dueAt: now + 3_600_000,
    });
    reminderService.create({
      guildId,
      channelId: CHANNEL_ID,
      userId: DEMO_MEMBERS[1].id,
      userTag: `${DEMO_MEMBERS[1].tag}#0000`,
      text: 'Relancer les participants du giveaway',
      dueAt: now + 10_800_000,
    });
  }

  // ── Mini-jeux (classements) ──────────────────────────────────────────────
  if (gameService.totalPlayers() === 0) {
    const results: Array<{ game: 'morpion' | 'quiz' | '2048' | 'pendu'; userId: string; tag: string; result: 'win' | 'loss' | 'draw'; points: number }> = [
      { game: 'morpion', userId: DEMO_MEMBERS[0].id, tag: `${DEMO_MEMBERS[0].tag}#0000`, result: 'win', points: 40 },
      { game: 'morpion', userId: DEMO_MEMBERS[1].id, tag: `${DEMO_MEMBERS[1].tag}#0000`, result: 'loss', points: 10 },
      { game: 'morpion', userId: DEMO_MEMBERS[0].id, tag: `${DEMO_MEMBERS[0].tag}#0000`, result: 'win', points: 40 },
      { game: 'quiz', userId: DEMO_MEMBERS[1].id, tag: `${DEMO_MEMBERS[1].tag}#0000`, result: 'win', points: 60 },
      { game: 'quiz', userId: DEMO_MEMBERS[2].id, tag: `${DEMO_MEMBERS[2].tag}#0000`, result: 'draw', points: 25 },
      { game: '2048', userId: DEMO_MEMBERS[2].id, tag: `${DEMO_MEMBERS[2].tag}#0000`, result: 'win', points: 55 },
      { game: '2048', userId: DEMO_MEMBERS[3].id, tag: `${DEMO_MEMBERS[3].tag}#0000`, result: 'loss', points: 5 },
      { game: 'pendu', userId: DEMO_MEMBERS[3].id, tag: `${DEMO_MEMBERS[3].tag}#0000`, result: 'win', points: 30 },
      { game: 'pendu', userId: DEMO_MEMBERS[0].id, tag: `${DEMO_MEMBERS[0].tag}#0000`, result: 'win', points: 30 },
    ];

    for (const entry of results) {
      gameService.record({
        guildId,
        userId: entry.userId,
        tag: entry.tag,
        game: entry.game,
        result: entry.result,
        points: entry.points,
        best: entry.points,
        betterIf: 'higher',
      });
    }
    log.success('Parties de démonstration enregistrées');
  }

  await db.flushAll();

  log.success('Données de démonstration prêtes : ouvrez les 5 pages du site pour vérifier.');
  log.info(`Modules : ${Object.entries(settings.modules).map(([key, enabled]) => `${key}=${enabled ? 'on' : 'off'}`).join(' ')}`);
}
