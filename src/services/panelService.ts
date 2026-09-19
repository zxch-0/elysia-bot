import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ChannelType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { db, type Collection } from '../core/database';
import { loadConfig } from '../core/config';
import { logger } from '../core/logger';
import { BotError, NotFoundError } from '../core/errors';
import type { PanelButtonConfig, RolePanel } from '../core/types';
import { baseEmbed, THEME, withImage } from '../ui/embeds';
import { buildButton } from '../ui/components';
import { isRoleAssignable } from '../utils/permissions';
import { slugify } from '../utils/random';

const log = logger.child('panels');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/** Panneaux de rôles : création, publication, attribution réactive. */
export class PanelService {
  private collection: Collection<RolePanel> = db.collection<RolePanel>('panels');

  get panelsDir(): string {
    return path.join(loadConfig().assetsDir, 'panels');
  }

  create(input: {
    guildId: string;
    name: string;
    channelId: string;
    title: string;
    description: string;
    roles: PanelButtonConfig[];
    mode: 'buttons' | 'select';
    behaviour: 'toggle' | 'exclusive';
    color?: number;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
    footer?: string | null;
    imageFile?: string | null;
    placeholder?: string;
    createdBy: string;
  }): RolePanel {
    const id = `${slugify(input.name)}-${Date.now().toString(36).slice(-4)}`;
    const panel: RolePanel = {
      id,
      guildId: input.guildId,
      name: input.name,
      channelId: input.channelId,
      title: input.title,
      description: input.description,
      color: input.color ?? THEME.colors.panel,
      imageUrl: input.imageUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      footer: input.footer ?? null,
      imageFile: input.imageFile ?? null,
      mode: input.mode,
      behaviour: input.behaviour,
      roles: input.roles,
      placeholder: input.placeholder ?? 'Choisissez vos rôles…',
      createdBy: input.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.collection.set(panel);
    return panel;
  }

  get(id: string): RolePanel | undefined {
    return this.collection.get(id);
  }

  listGuild(guildId: string): RolePanel[] {
    return this.collection.find((panel) => panel.guildId === guildId).sort((a, b) => b.createdAt - a.createdAt);
  }

  update(id: string, patch: Partial<RolePanel>): RolePanel {
    const panel = this.get(id);
    if (!panel) throw new NotFoundError(`Aucun panneau trouvé avec l'identifiant \`${id}\`.`);
    const merged = { ...panel, ...patch, updatedAt: Date.now() };
    this.collection.set(merged);
    return merged;
  }

  delete(id: string): boolean {
    return this.collection.delete(id);
  }

  /** Nombre total de panneaux tous serveurs confondus (statistiques). */
  total(): number {
    return this.collection.size;
  }

  /** Nombre de rôles distribuables gérés par l'ensemble des panneaux. */
  totalRoles(): number {
    return this.collection.all().reduce((sum, panel) => sum + panel.roles.length, 0);
  }

  /** Enregistre une image locale fournie en pièce jointe. */
  async saveImage(attachment: { name?: string | null; url: string }, baseName: string): Promise<string | null> {
    const extension = path.extname(attachment.name ?? '').toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) return null;

    const fileName = `${slugify(baseName)}${extension}`;
    const target = path.join(this.panelsDir, fileName);
    await fs.mkdir(this.panelsDir, { recursive: true });
    const response = await fetch(attachment.url);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 8 * 1024 * 1024) throw new BotError('Image trop lourde (maximum 8 Mo).');
    await fs.writeFile(target, buffer);
    log.debug(`Image de panneau enregistrée : ${fileName}`);
    return fileName;
  }

  /** Chemin absolu d'une image locale de panneau. */
  imagePath(fileName: string): string {
    return path.join(this.panelsDir, fileName);
  }

  hasImage(fileName: string | null | undefined): boolean {
    if (!fileName) return false;
    return existsSync(this.imagePath(fileName));
  }

  /** Construit l'embed d'un panneau (avec gestion image locale / distante). */
  buildEmbed(panel: RolePanel): EmbedBuilder {
    const embed = baseEmbed({
      color: panel.color,
      footer: panel.footer ?? `Elysia • Choisissez vos rôles`,
    });
    embed.setTitle(panel.title.slice(0, 256));
    embed.setDescription(panel.description.slice(0, 4000));
    if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);

    const imageSource = this.hasImage(panel.imageFile) ? panel.imageFile : panel.imageUrl;
    withImage(embed, imageSource ?? undefined);

    if (panel.roles.length > 0) {
      const list = panel.roles
        .slice(0, 20)
        .map((role) => `${role.emoji ? `${role.emoji} ` : '• '}<@&${role.roleId}>${role.description ? ` — ${role.description}` : ''}`)
        .join('\n');
      embed.addFields({ name: '🎭 Rôles disponibles', value: list.slice(0, 1024) });
    }
    return embed;
  }

  /** Construit les composants (boutons ou menu) du panneau. */
  buildComponents(panel: RolePanel): ActionRowBuilder<any>[] {
    // Panneau sans rôles : aucun composant (un menu vide serait refusé par Discord).
    if (panel.roles.length === 0) return [];

    if (panel.mode === 'select') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`rr:select:${panel.id}`)
        .setPlaceholder((panel.placeholder ?? 'Choisissez vos rôles…').slice(0, 150))
        .setMinValues(0)
        .setMaxValues(Math.min(panel.behaviour === 'exclusive' ? 1 : panel.roles.length, 25));

      for (const role of panel.roles.slice(0, 25)) {
        const option = new StringSelectMenuOptionBuilder()
          .setValue(role.roleId)
          .setLabel(role.label.slice(0, 100));
        if (role.description) option.setDescription(role.description.slice(0, 100));
        if (role.emoji) {
          try {
            option.setEmoji(role.emoji);
          } catch {
            /* ignore */
          }
        }
        menu.addOptions(option);
      }
      return [new ActionRowBuilder<any>().addComponents(menu)];
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const chunks: PanelButtonConfig[][] = [];
    for (let index = 0; index < panel.roles.length; index += 5) chunks.push(panel.roles.slice(index, index + 5));
    for (const chunk of chunks) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...chunk.map((role) =>
            buildButton({
              id: `rr:toggle:${panel.id}:${role.roleId}`,
              label: role.label,
              emoji: role.emoji ?? null,
              style: role.style,
            }),
          ),
        ),
      );
    }
    return rows;
  }

  /** Prépare les fichiers à joindre lors de l'envoi du panneau. */
  buildFiles(panel: RolePanel): AttachmentBuilder[] {
    if (!this.hasImage(panel.imageFile)) return [];
    return [new AttachmentBuilder(this.imagePath(panel.imageFile!), { name: panel.imageFile! })];
  }

  /** Publie (ou republie) le panneau dans son salon. */
  async publish(guild: Guild, panelId: string): Promise<RolePanel> {
    const panel = this.get(panelId);
    if (!panel) throw new NotFoundError(`Aucun panneau trouvé avec l'identifiant \`${panelId}\`.`);

    const channel = guild.channels.cache.get(panel.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new NotFoundError('Le salon cible du panneau est introuvable ou n’est pas un salon textuel.');
    }

    const payload = {
      embeds: [this.buildEmbed(panel)],
      components: this.buildComponents(panel),
      files: this.buildFiles(panel),
    };

    // Suppression de l'ancien message si possible
    if (panel.messageId) {
      const previous = await (channel as TextChannel).messages.fetch(panel.messageId).catch(() => null);
      await previous?.delete().catch(() => undefined);
    }

    const message = await (channel as TextChannel).send({
      content: '',
      embeds: payload.embeds,
      components: payload.components,
      files: payload.files,
    });

    return this.update(panel.id, { messageId: message.id });
  }

  /** Ajoute ou retire un rôle suite à un clic. */
  async toggleRole(params: {
    guild: Guild;
    member: GuildMember;
    panel: RolePanel;
    roleId: string;
  }): Promise<{ added: boolean; roleName: string; replaced?: string[] }> {
    const { guild, member, panel, roleId } = params;
    const role = guild.roles.cache.get(roleId);
    if (!role) throw new NotFoundError('Ce rôle n’existe plus sur le serveur. Signalez-le à un administrateur.');

    const botMember = guild.members.me;
    if (!botMember) throw new BotError('Impossible de vérifier mes permissions (cache du serveur incomplet).');
    if (!isRoleAssignable(guild, role)) {
      throw new BotError(
        `Je ne peux pas attribuer **${role.name}** : placez mon rôle au-dessus de celui-ci dans les paramètres du serveur.`,
      );
    }

    const hasRole = member.roles.cache.has(roleId);
    const replaced: string[] = [];

    if (hasRole) {
      await member.roles.remove(role, `Panneau ${panel.id} : retrait`);
      return { added: false, roleName: role.name };
    }

    if (panel.behaviour === 'exclusive') {
      const others = panel.roles.map((entry) => entry.roleId).filter((id) => id !== roleId && member.roles.cache.has(id));
      for (const otherId of others) {
        const other = guild.roles.cache.get(otherId);
        if (!other) continue;
        await member.roles.remove(other, `Panneau ${panel.id} : sélection unique`).catch(() => undefined);
        replaced.push(other.name);
      }
    }

    await member.roles.add(role, `Panneau ${panel.id} : attribution`);
    return { added: true, roleName: role.name, replaced };
  }

  /** Diagnostic : liste les problèmes empêchant un panneau de fonctionner. */
  diagnose(guild: Guild, panel: RolePanel): string[] {
    const warnings: string[] = [];
    const channel = guild.channels.cache.get(panel.channelId);
    if (!channel) warnings.push('Le salon du panneau n’existe plus.');
    const botMember = guild.members.me;
    if (!botMember) return [...warnings, 'Le bot n’est pas dans le cache du serveur.'];

    for (const entry of panel.roles) {
      const role = guild.roles.cache.get(entry.roleId);
      if (!role) {
        warnings.push(`Le rôle **${entry.label}** (\`${entry.roleId}\`) n’existe plus.`);
        continue;
      }
      if (!isRoleAssignable(guild, role)) {
        warnings.push(`Le rôle **${role.name}** est au-dessus du rôle du bot : il ne peut pas être attribué.`);
      }
    }
    if (panel.imageFile && !this.hasImage(panel.imageFile)) {
      warnings.push(`L’image locale \`${panel.imageFile}\` est introuvable dans assets/panels.`);
    }
    return warnings;
  }
}

export const panelService = new PanelService();
export type { RolePanel, PanelButtonConfig };
