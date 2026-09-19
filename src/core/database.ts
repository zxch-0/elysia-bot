import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger';

const log = createLogger('database');

export type Document = { id: string } & Record<string, any>;

/**
 * Petite base de données JSON persistante (zéro dépendance native → compile
 * sans problème sur Render, Replit, VPS, Docker…).
 *
 * • Tout est gardé en mémoire pour des lectures instantanées.
 * • Les écritures sont groupées (debounce 400 ms) puis écrites de façon
 *   atomique (fichier temporaire + rename) pour éviter la corruption.
 * • Compatible avec les redémarrages : `load()` au démarrage, `flush()` à
 *   l'arrêt.
 */
export class Collection<T extends Document> {
  private cache = new Map<string, T>();
  private dirty = false;
  private flushTimer: NodeJS.Timeout | undefined;
  private ready = false;

  constructor(
    private readonly db: Database,
    public readonly name: string,
  ) {}

  get filePath(): string {
    return path.join(this.db.dir, `${this.name}.json`);
  }

  get size(): number {
    return this.cache.size;
  }

  /** Charge le fichier depuis le disque (créé s'il n'existe pas). */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, T> | T[];
      const entries = Array.isArray(parsed) ? parsed.map((doc) => [doc.id, doc] as const) : Object.entries(parsed);
      this.cache = new Map(entries.filter(([id]) => typeof id === 'string'));
      log.debug(`Collection « ${this.name} » chargée (${this.cache.size} document(s))`);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        log.warn(`Collection « ${this.name} » illisible, réinitialisation : ${error?.message ?? error}`);
      }
      this.cache = new Map();
    }
    this.ready = true;
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  get(id: string): T | undefined {
    return this.cache.get(id);
  }

  all(): T[] {
    return [...this.cache.values()];
  }

  find(predicate: (doc: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  first(predicate: (doc: T) => boolean): T | undefined {
    for (const doc of this.cache.values()) if (predicate(doc)) return doc;
    return undefined;
  }

  count(predicate?: (doc: T) => boolean): number {
    return predicate ? this.find(predicate).length : this.cache.size;
  }

  /** Insère ou remplace un document. */
  set(doc: T): T {
    this.cache.set(doc.id, doc);
    this.markDirty();
    return doc;
  }

  /** Met à jour un document (patch partiel ou fonction). */
  update(id: string, patch: Partial<T> | ((doc: T) => T)): T | undefined {
    const current = this.cache.get(id);
    const next = typeof patch === 'function' ? patch(current as T) : { ...(current as T), ...patch };
    if (!next) return undefined;
    this.cache.set(id, next as T);
    this.markDirty();
    return next as T;
  }

  delete(id: string): boolean {
    const deleted = this.cache.delete(id);
    if (deleted) this.markDirty();
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    if (!this.ready) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, 400);
    this.flushTimer.unref?.();
  }

  /** Écrit la collection sur le disque de manière atomique. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const payload = Object.fromEntries(this.cache) as Record<string, T>;
    const tmp = `${this.filePath}.tmp`;
    try {
      mkdirSync(this.db.dir, { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await fs.rename(tmp, this.filePath);
    } catch (error) {
      this.dirty = true;
      log.error(`Échec d'écriture de la collection « ${this.name} »`, error);
    }
  }
}

export class Database {
  private collections = new Map<string, Collection<any>>();
  private loaded = false;

  constructor(public readonly dir: string) {}

  /** Récupère (ou crée) une collection typée. */
  collection<T extends Document>(name: string): Collection<T> {
    const existing = this.collections.get(name);
    if (existing) return existing as Collection<T>;
    const created = new Collection<T>(this, name);
    this.collections.set(name, created);
    return created;
  }

  get isReady(): boolean {
    return this.loaded;
  }

  async init(): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    await Promise.all([...this.collections.values()].map((collection) => collection.load()));
    this.loaded = true;
    log.success(`Base de données prête (${this.collections.size} collection(s)) → ${path.resolve(this.dir)}`);
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.collections.values()].map((collection) => collection.flush()));
  }

  stats(): Array<{ name: string; size: number }> {
    return [...this.collections.values()]
      .map((collection) => ({ name: collection.name, size: collection.size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const db = new Database(process.env.DATA_DIR || 'data');
