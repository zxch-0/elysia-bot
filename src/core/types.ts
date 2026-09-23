import type {
  ActionRowBuilder,
  AnySelectMenuInteraction,
  Attachment,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  Guild,
  GuildBasedChannel,
  GuildMember,
  ModalSubmitInteraction,
  PermissionsString,
  Role,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  User,
} from 'discord.js';

export type Locale = 'fr' | 'en';

export type CommandCategory =
  | 'moderation'
  | 'giveaways'
  | 'roles'
  | 'community'
  | 'economy'
  | 'config'
  | 'utility'
  | 'games'
  | 'fun'
  | 'owner';

export interface CategoryMeta {
  id: CommandCategory;
  label: string;
  emoji: string;
  description: string;
}

export type AnySlashCommandBuilder = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

/** Contraintes de permissions déclaratives appliquées avant l'exécution. */
export interface CommandPermissions {
  /** Permissions Discord requises pour l'auteur de la commande. */
  user?: bigint[];
  /** Permissions Discord requises pour le bot (vérification anticipée). */
  bot?: bigint[];
  /** Réservé aux propriétaires listés dans OWNER_IDS. */
  ownerOnly?: boolean;
  /** Réservé aux administrateurs du serveur ou aux rôles « staff » configurés. */
  adminOnly?: boolean;
  /** Disponible même en message privé (par défaut : non). */
  allowDm?: boolean;
}

/** Module d'interaction (boutons, menus, modales) enregistré dynamiquement. */
export interface InteractionModule {
  /** Préfixe du customId, ex. « rr » pour « rr:t:panel:role ». */
  prefix: string;
  handle(interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction, client: any, args: string[]): Promise<void>;
}

export interface Command {
  data: AnySlashCommandBuilder;
  category: CommandCategory;
  /** Description courte affichée dans /help (sinon celle du builder). */
  summary?: string;
  /** Exemples d'utilisation affichés dans /help. */
  usage?: string[];
  /** Cooldown en secondes, par utilisateur et par commande. */
  cooldown?: number;
  permissions?: CommandPermissions;
  /** Répond publiquement au lieu du message éphémère par défaut. */
  publicReply?: boolean;
  /** Désactive le defer automatique (nécessaire pour ouvrir une modale). */
  noDefer?: boolean;
  run: (ctx: CommandContext) => Promise<any>;
  autocomplete?: (interaction: AutocompleteInteraction, client: any) => Promise<any>;
}

/**
 * Enveloppe confortable autour de `ChatInputCommandInteraction`.
 * Toutes les réponses sont déjà « deferred » → `ctx.success()` / `ctx.error()`
 * fonctionnent partout, même après 3 secondes de traitement.
 */
export interface CommandContext {
  client: any;
  interaction: ChatInputCommandInteraction;
  guild: Guild;
  member: GuildMember;
  settings: import('../services/guildService').GuildSettings;

  user(key: string, path?: string): User;
  memberOf(key: string, path?: string): GuildMember;
  string(key: string, path?: string): string;
  integer(key: string, path?: string): number;
  number(key: string, path?: string): number;
  boolean(key: string, path?: string): boolean;
  channel(key: string, path?: string, types?: ChannelType[]): GuildBasedChannel;
  role(key: string, path?: string): Role;
  attachment(key: string, path?: string): Attachment | null;
  subcommand(): string | null;
  subcommandGroup(): string | null;

  /** Réponse succès (✅) — éphémère par défaut. */
  success(title: string, description?: string, extra?: Partial<import('discord.js').EmbedBuilder>): Promise<any>;
  /** Réponse erreur (❌). */
  error(description: string, title?: string): Promise<any>;
  /** Réponse informative neutre (ℹ️). */
  info(title: string, description?: string): Promise<any>;
  /** Réponse d'avertissement (⚠️). */
  warn(title: string, description?: string): Promise<any>;
  /** Envoie un embed brut. */
  send(embed: import('discord.js').EmbedBuilder, components?: any[]): Promise<any>;
}

export interface PanelButtonConfig {
  roleId: string;
  label: string;
  emoji?: string | null;
  style: 'primary' | 'secondary' | 'success' | 'danger';
  description?: string;
}

export type PanelMode = 'toggle' | 'exclusive';

/** Panneau de rôles votés par les membres (boutons ou menu déroulant). */
export interface RolePanel {
  id: string;
  guildId: string;
  name: string;
  channelId: string;
  messageId?: string;
  title: string;
  description: string;
  color: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  footer?: string | null;
  /** Image stockée dans assets/panels et renvoyée en pièce jointe. */
  imageFile?: string | null;
  mode: 'buttons' | 'select';
  behaviour: PanelMode;
  roles: PanelButtonConfig[];
  placeholder?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Rôles uniques : le premier sélectionné retire les autres. */
  maxSelections?: number;
}

export type ButtonStyleName = 'primary' | 'secondary' | 'success' | 'danger';

export interface ActionRowLike extends ActionRowBuilder<ButtonBuilder> {}

export interface ComponentMessage {
  content?: string;
  embeds?: any[];
  components?: any[];
  files?: any[];
}

export type SelectableChannel = Extract<GuildBasedChannel, { type: ChannelType.GuildText }>;
export type { PermissionsString };
