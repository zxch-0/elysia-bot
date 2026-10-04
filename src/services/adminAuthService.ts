import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../core/config';
import { logger } from '../core/logger';

const log = logger.child('admin-auth');

/**
 * Authentification de l'onglet admin caché (`/admin`).
 *
 * Modèle de sécurité :
 *   • le code n'est **jamais** envoyé au navigateur ni comparé naïvement :
 *     il est haché (SHA-256) puis comparé en temps constant ;
 *   • l'accès est matérialisé par un cookie de session `HttpOnly` +
 *     `SameSite=Strict` (inaccessible en JavaScript, donc inutilisable en cas
 *     d'injection de script dans une page publique) ;
 *   • brute-force impossible : verrouillage par IP **et** global après
 *     plusieurs échecs, avec un délai minimal croissant entre deux essais ;
 *   • liste blanche d'IP optionnelle (`ADMIN_ALLOWED_IPS`) ;
 *   • toutes les tentatives et actions sont journalisées (audit).
 */

export interface AdminSessionInfo {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
  /** Nombre d'actions effectuées pendant la session. */
  actions: number;
}

export interface AdminAuditEntry {
  id: string;
  at: number;
  /** ok | refus | action */
  kind: 'ok' | 'refus' | 'action';
  action: string;
  detail: string;
  ip: string;
}

export interface AdminMeta {
  ip: string;
  userAgent: string;
}

export type AdminLoginResult =
  | { ok: true; session: AdminSessionInfo; cookie: string }
  | { ok: false; reason: string; status: number; retryAfterSeconds?: number; attemptsLeft?: number };

/** Nom du cookie de session admin (aucune donnée sensible dedans : un jeton opaque). */
export const ADMIN_COOKIE = 'elysia_admin';

/** Fenêtre glissante servant à compter les échecs (et à les oublier). */
const FAILURE_WINDOW_MS = 10 * 60_000;
/** Échecs par IP avant verrouillage. */
const MAX_FAILURES_PER_IP = 5;
/** Échecs toutes IP confondues avant verrouillage global. */
const MAX_FAILURES_GLOBAL = 12;
/** Sessions simultanées maximum (une par navigateur en pratique). */
const MAX_SESSIONS = 8;
/** Nombre d'entrées d'audit conservées en mémoire. */
const MAX_AUDIT = 400;

/** Empreinte SHA-256 : évite toute comparaison caractère par caractère fuyante. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Comparaison en temps constant de deux chaînes. */
export function safeEqual(a: string, b: string): boolean {
  const left = digest(a);
  const right = digest(b);
  return timingSafeEqual(left, right);
}

/** Nettoie un en-tête de cookies et renvoie la valeur demandée. */
export function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(header) ? header.join('; ') : header;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/** Adresse IP du client (tient compte des proxys type Render/Cloudflare). */
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback: string): string {
  const forwarded = headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (value) {
    const first = value.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers['x-real-ip'];
  const realValue = Array.isArray(real) ? real[0] : real;
  return (realValue ?? fallback).trim() || 'inconnue';
}

export class AdminAuthService {
  private sessions = new Map<string, AdminSessionInfo>();
  private failuresByIp = new Map<string, number[]>();
  private failures: number[] = [];
  private lockedUntil = 0;
  private lockedIps = new Map<string, number>();
  /** Horodatage du dernier échec : sert au délai minimal entre deux essais. */
  private lastFailureAt = 0;
  private audit: AdminAuditEntry[] = [];
  private sequence = 0;

  /** Vrai si la liste blanche d'IP est active. */
  get allowedIps(): string[] {
    return loadConfig().adminAllowedIps;
  }

  /** Vrai si le code n'a jamais été changé (valeur par défaut documentée). */
  get codeIsDefault(): boolean {
    return loadConfig().adminCodeIsDefault;
  }

  /**
   * Tente une connexion. Renvoie un cookie de session en cas de succès.
   * Ne révèle jamais si le code est « presque » correct.
   */
  login(code: string, meta: AdminMeta): AdminLoginResult {
    const config = loadConfig();
    const now = Date.now();

    if (this.allowedIps.length > 0 && !this.allowedIps.includes(meta.ip)) {
      this.audit.push(this.entry('refus', 'connexion', `IP refusée (${meta.ip})`, meta));
      log.warn(`Tentative d'accès admin depuis une IP non autorisée : ${meta.ip}`);
      return { ok: false, reason: 'Adresse IP non autorisée.', status: 403 };
    }

    const globalLock = Math.max(this.lockedUntil, 0);
    if (globalLock > now) {
      const seconds = Math.ceil((globalLock - now) / 1_000);
      this.audit.push(this.entry('refus', 'connexion', `Verrouillage global actif (${seconds} s)`, meta));
      return { ok: false, reason: 'Trop d’échecs : accès temporairement verrouillé.', status: 429, retryAfterSeconds: seconds };
    }

    const ipLock = this.lockedIps.get(meta.ip) ?? 0;
    if (ipLock > now) {
      const seconds = Math.ceil((ipLock - now) / 1_000);
      this.audit.push(this.entry('refus', 'connexion', `Verrouillage IP actif (${seconds} s)`, meta));
      return { ok: false, reason: 'Trop d’échecs depuis votre adresse : réessayez plus tard.', status: 429, retryAfterSeconds: seconds };
    }

    // Délai minimal croissant entre deux essais (freine les attaques distribuées).
    const recentFailures = this.failures.filter((at) => now - at < FAILURE_WINDOW_MS).length;
    const minDelay = Math.min(2 ** Math.max(0, recentFailures - 1) * 1_000, 15_000);
    const sinceLast = now - this.lastFailureAt;
    if (this.lastFailureAt > 0 && sinceLast < minDelay) {
      const seconds = Math.ceil((minDelay - sinceLast) / 1_000);
      return { ok: false, reason: `Patientez ${seconds} s avant un nouvel essai.`, status: 429, retryAfterSeconds: seconds };
    }

    const provided = code.slice(0, 200);
    if (!safeEqual(provided, config.adminPanelCode)) {
      this.lastFailureAt = now;
      this.registerFailure(meta.ip, now);
      const attemptsLeft = Math.max(0, MAX_FAILURES_PER_IP - this.ipFailures(meta.ip, now));
      this.audit.push(this.entry('refus', 'connexion', `Code incorrect (IP ${meta.ip})`, meta));
      log.warn(`Échec de connexion admin (IP ${meta.ip}) — ${attemptsLeft} essai(s) restant(s) pour cette adresse.`);
      return { ok: false, reason: 'Code incorrect.', status: 401, attemptsLeft };
    }

    // Succès : on repart d'un état propre.
    this.failures = [];
    this.failuresByIp.delete(meta.ip);
    this.lockedIps.delete(meta.ip);

    const session = this.createSession(meta);
    this.audit.push(this.entry('ok', 'connexion', `Session ouverte (${meta.ip})`, meta));
    log.success(`Session admin ouverte (IP ${meta.ip}) — expire dans ${Math.round(config.adminSessionTtlMs / 60_000)} min.`);

    return { ok: true, session, cookie: this.serializeCookie(session.id) };
  }

  /** Vérifie et rafraîchit une session (renvoie `null` si absente/expirée). */
  verify(sessionId: string | undefined, meta?: AdminMeta): AdminSessionInfo | null {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const config = loadConfig();
    const now = Date.now();
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return null;
    }

    // L'IP ne peut pas changer en cours de session (vol de cookie inutile).
    if (meta && session.ip !== meta.ip) {
      this.sessions.delete(sessionId);
      this.audit.push(this.entry('refus', 'session', `Session fermée : IP différente (${meta.ip} ≠ ${session.ip})`, meta));
      log.warn(`Session admin invalidée : l'IP a changé (${session.ip} → ${meta.ip}).`);
      return null;
    }

    session.lastSeenAt = now;
    session.expiresAt = now + config.adminSessionTtlMs;
    return session;
  }

  /** Ferme une session (déconnexion). */
  logout(sessionId: string | undefined, meta?: AdminMeta): boolean {
    if (!sessionId) return false;
    const existed = this.sessions.delete(sessionId);
    if (existed) this.audit.push(this.entry('ok', 'deconnexion', 'Session fermée par l’utilisateur', meta ?? { ip: '—', userAgent: '—' }));
    return existed;
  }

  /** Ferme toutes les sessions (bouton « tout déconnecter »). */
  logoutAll(meta?: AdminMeta): number {
    const count = this.sessions.size;
    this.sessions.clear();
    if (count > 0) this.audit.push(this.entry('ok', 'deconnexion', `${count} session(s) fermée(s)`, meta ?? { ip: '—', userAgent: '—' }));
    return count;
  }

  /** Enregistre une action sensible dans le journal d'audit. */
  record(action: string, detail: string, meta: AdminMeta, session?: AdminSessionInfo): void {
    if (session) session.actions += 1;
    this.audit.push(this.entry('action', action, detail, meta));
    log.info(`[admin] ${action} — ${detail}`);
  }

  /** Dernières entrées d'audit (les plus récentes d'abord). */
  recentAudit(limit = 60): AdminAuditEntry[] {
    return this.audit.slice(-Math.max(1, limit)).reverse();
  }

  /** État de sécurité affiché dans le panneau. */
  status(): {
    codeIsDefault: boolean;
    allowedIps: string[];
    sessionTtlMinutes: number;
    lockoutMinutes: number;
    activeSessions: number;
    globalLockSeconds: number;
    recentFailures: number;
    blockedIps: number;
    attemptsLeft: number;
  } {
    const config = loadConfig();
    const now = Date.now();
    return {
      codeIsDefault: this.codeIsDefault,
      allowedIps: this.allowedIps,
      sessionTtlMinutes: Math.round(config.adminSessionTtlMs / 60_000),
      lockoutMinutes: Math.round(config.adminLockoutMs / 60_000),
      activeSessions: [...this.sessions.values()].filter((session) => session.expiresAt > now).length,
      globalLockSeconds: this.lockedUntil > now ? Math.ceil((this.lockedUntil - now) / 1_000) : 0,
      recentFailures: this.failures.filter((at) => now - at < FAILURE_WINDOW_MS).length,
      blockedIps: [...this.lockedIps.values()].filter((until) => until > now).length,
      attemptsLeft: MAX_FAILURES_PER_IP,
    };
  }

  /** Cookie `Set-Cookie` prêt à envoyer (HttpOnly, SameSite=Strict). */
  serializeCookie(sessionId: string, secure = false): string {
    const config = loadConfig();
    const maxAge = Math.floor(config.adminSessionTtlMs / 1_000);
    return [
      `${ADMIN_COOKIE}=${sessionId}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAge}`,
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');
  }

  /** Cookie de suppression (déconnexion). */
  clearCookie(secure = false): string {
    return [`${ADMIN_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0', secure ? 'Secure' : '']
      .filter(Boolean)
      .join('; ');
  }

  /** Purge périodique (sessions expirées, compteurs anciens). */
  sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
    for (const [ip, until] of this.lockedIps) {
      if (until <= now && this.ipFailures(ip, now) === 0) this.lockedIps.delete(ip);
    }
    this.failures = this.failures.filter((at) => now - at < FAILURE_WINDOW_MS);
    for (const [ip, list] of this.failuresByIp) {
      const kept = list.filter((at) => now - at < FAILURE_WINDOW_MS);
      if (kept.length === 0) this.failuresByIp.delete(ip);
      else this.failuresByIp.set(ip, kept);
    }
  }

  private ipFailures(ip: string, now: number): number {
    return (this.failuresByIp.get(ip) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS).length;
  }

  private registerFailure(ip: string, now: number): void {
    const list = (this.failuresByIp.get(ip) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS);
    list.push(now);
    this.failuresByIp.set(ip, list);
    this.failures.push(now);
    this.failures = this.failures.filter((at) => now - at < FAILURE_WINDOW_MS);

    const config = loadConfig();
    if (list.length >= MAX_FAILURES_PER_IP) {
      this.lockedIps.set(ip, now + config.adminLockoutMs);
      log.warn(`IP verrouillée ${Math.round(config.adminLockoutMs / 60_000)} min après ${list.length} échecs : ${ip}`);
    }
    if (this.failures.length >= MAX_FAILURES_GLOBAL) {
      this.lockedUntil = now + config.adminLockoutMs;
      this.failures = [];
      log.warn(`Verrouillage GLOBAL du panneau admin (${MAX_FAILURES_GLOBAL} échecs) pendant ${Math.round(config.adminLockoutMs / 60_000)} min.`);
    }
  }

  private createSession(meta: AdminMeta): AdminSessionInfo {
    const config = loadConfig();
    const now = Date.now();

    // On ne garde que les sessions les plus récentes : un redémarrage sauvage
    // ou un onglet oublié ne doit pas laisser traîner des accès ouverts.
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt)[0];
      if (oldest) this.sessions.delete(oldest.id);
    }

    const session: AdminSessionInfo = {
      id: randomBytes(32).toString('hex'),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + config.adminSessionTtlMs,
      ip: meta.ip,
      userAgent: meta.userAgent.slice(0, 180),
      actions: 0,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  private entry(kind: AdminAuditEntry['kind'], action: string, detail: string, meta: AdminMeta): AdminAuditEntry {
    const entry: AdminAuditEntry = {
      id: `${Date.now().toString(36)}-${(this.sequence += 1).toString(36)}`,
      at: Date.now(),
      kind,
      action,
      detail,
      ip: meta.ip,
    };
    if (this.audit.length > MAX_AUDIT) this.audit = this.audit.slice(-MAX_AUDIT);
    return entry;
  }
}

export const adminAuth = new AdminAuthService();
