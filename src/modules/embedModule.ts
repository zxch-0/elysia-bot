import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';
import type { InteractionModule, PanelButtonConfig } from '../core/types';
import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { panelService } from '../services/panelService';
import { baseEmbed, THEME, errorEmbed } from '../ui/embeds';
import { buttonRows, selectMenu } from '../ui/components';
import { parseRoleEntries } from '../commands/roles/rolepanel';
import { shortCode } from '../utils/random';
import { truncate } from '../utils/format';

const log = logger.child('embed-builder');

interface Draft {
  id: string;
  guildId: string;
  userId: string;
  channelId: string;
  title: string;
  description: string;
  color?: number;
  imageUrl?: string | null;
  footer?: string | null;
  mode: 'buttons' | 'select';
  roles: PanelButtonConfig[];
  createdAt: number;
  expiresAt: number;
}

/** Brouillons d'embeds en cours de construction (privés, expirés au bout de 20 min). */
const drafts = new Map<string, Draft>();

function cleanup(): void {
  const now = Date.now();
  for (const [id, draft] of drafts) if (draft.expiresAt < now) drafts.delete(id);
}

function getDraft(id: string, userId: string): Draft | undefined {
  cleanup();
  const draft = drafts.get(id);
  if (!draft || draft.userId !== userId) return undefined;
  return draft;
}

/** Aperçu privé + guide d'utilisation affichés à chaque étape. */
function previewPayload(draft: Draft): InteractionReplyOptions {
  const preview = baseEmbed({
    title: draft.title,
    description: draft.description,
    color: draft.color ?? THEME.colors.panel,
    footer: draft.footer ?? 'Aperçu privé — rien n’est publié avant validation',
  });
  if (draft.imageUrl) preview.setImage(draft.imageUrl);
  if (draft.roles.length > 0) {
    preview.addFields({
      name: '🎭 Boutons de rôles',
      value: truncate(
        draft.roles.map((entry) => `${entry.emoji ? `${entry.emoji} ` : ''}<@&${entry.roleId}>`).join(' • ') || '—',
        1024,
      ),
    });
  }

  const guide = baseEmbed({
    title: '🧩 Aperçu de votre embed',
    description: [
      `**Titre :** ${truncate(draft.title, 80)}`,
      `**Salon cible :** <#${draft.channelId}>`,
      `**Rôles :** ${draft.roles.length} • **Type :** ${draft.mode === 'select' ? 'menu déroulant' : 'boutons'}`,
      '',
      '📢 **Publier** — envoie l’embed et active les boutons de rôles',
      '🎭 **Rôles** — sélectionne les rôles que les membres pourront obtenir',
      '🖼️ **Image** — ajoute une bannière (URL ou `/embed image` après publication)',
      '🔗 **Salon** — change la destination',
      '🔀 **Boutons / Menu** — bascule le type de composant',
      '🎨 **Couleurs** — fait tourner les styles des boutons',
      '',
      `*Brouillon \`${draft.id}\` • expire dans 20 minutes*`,
    ].join('\n'),
    color: THEME.colors.info,
    footer: 'Astuce : /embed creer accepte des options pour préremplir la modale',
  });

  const rows = [
    ...buttonRows([
      { id: `em:publish:${draft.id}`, label: 'Publier', emoji: '📢', style: 'success' },
      { id: `em:roles:${draft.id}`, label: `Rôles (${draft.roles.length})`, emoji: '🎭', style: 'primary' },
      { id: `em:image:${draft.id}`, label: 'Image', emoji: '🖼️', style: 'primary' },
      { id: `em:channel:${draft.id}`, label: 'Salon', emoji: '🔗', style: 'secondary' },
      { id: `em:mode:${draft.id}`, label: draft.mode === 'select' ? 'Menu déroulant' : 'Boutons', emoji: '🔀', style: 'secondary' },
    ]),
    ...buttonRows([
      { id: `em:style:${draft.id}`, label: 'Couleurs des boutons', emoji: '🎨', style: 'secondary' },
      { id: `em:cancel:${draft.id}`, label: 'Annuler', emoji: '✖️', style: 'danger' },
    ]),
  ];

  return { embeds: [preview, guide], components: rows, flags: MessageFlags.Ephemeral };
}

/** Retire `flags` (invalide pour update/editReply) d'un payload. */
function stripFlags(payload: InteractionReplyOptions): InteractionEditReplyOptions {
  const { flags: _flags, ...rest } = payload;
  return rest as InteractionEditReplyOptions;
}

async function refreshPreview(
  interaction: { editReply(options: InteractionEditReplyOptions): Promise<unknown>; deferred: boolean; replied: boolean },
  draft: Draft,
): Promise<void> {
  await interaction.editReply(stripFlags(previewPayload(draft)) as InteractionEditReplyOptions).catch(() => undefined);
}

/** Module du créateur d'embeds : modale initiale, aperçu, publication (`em:*`). */
export const embedBuilderModule: InteractionModule = {
  prefix: 'em',
  async handle(interaction, _client: ElysiaClient, args) {
    // ── Modales ────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const guild = interaction.guild;
      if (!guild) return;

      // Modale secondaire : URL d'image d'un brouillon existant.
      if (args[0] === 'image' && args[1]) {
        const draft = getDraft(args[1], interaction.user.id);
        if (!draft) {
          await interaction.reply({
            embeds: [errorEmbed('Brouillon expiré. Relancez `/embed creer`.', 'Brouillon introuvable')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const raw = interaction.fields.getTextInputValue('url').trim();
        draft.imageUrl = /^(aucune|none|retirer|vide)$/i.test(raw) ? null : /^https?:\/\//i.test(raw) ? raw : draft.imageUrl;
        draft.expiresAt = Date.now() + 20 * 60_000;
        await interaction.reply(previewPayload(draft) as InteractionReplyOptions);
        return;
      }

      // Modale principale de création.
      const title = interaction.fields.getTextInputValue('titre').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const colorRaw = interaction.fields.getTextInputValue('couleur').trim();
      const imageRaw = interaction.fields.getTextInputValue('image').trim();
      const rolesRaw = interaction.fields.getTextInputValue('roles').trim();

      let color: number | undefined;
      if (colorRaw) {
        const hex = colorRaw.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex)) color = Number.parseInt(hex, 16);
      }

      const draft: Draft = {
        id: shortCode(6).toLowerCase(),
        guildId: guild.id,
        userId: interaction.user.id,
        channelId: interaction.channelId ?? '',
        title: truncate(title, 256),
        description: truncate(description, 4_000),
        color,
        imageUrl: /^https?:\/\//i.test(imageRaw) ? imageRaw : null,
        footer: null,
        mode: 'buttons',
        roles: rolesRaw ? parseRoleEntries(rolesRaw, guild as Guild) : [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 20 * 60_000,
      };

      drafts.set(draft.id, draft);
      log.debug(`Brouillon d’embed ${draft.id} créé par ${interaction.user.tag}`);
      await interaction.reply(previewPayload(draft) as InteractionReplyOptions);
      return;
    }

    if (!interaction.isButton() && !interaction.isAnySelectMenu()) return;
    const [action, draftId] = args;

    // ── Annulation ─────────────────────────────────────────────────────────
    if (action === 'cancel') {
      drafts.delete(draftId);
      await interaction.update({
        embeds: [errorEmbed('Brouillon annulé : rien n’a été publié.', 'Création abandonnée')],
        components: [],
      });
      return;
    }

    const draft = getDraft(draftId, interaction.user.id);
    if (!draft) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Ce brouillon a expiré (20 minutes) ou appartient à un autre membre.\nRelancez `/embed creer` pour recommencer.',
            'Brouillon introuvable',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    draft.expiresAt = Date.now() + 20 * 60_000;
    const guild = interaction.guild!;

    // ── Publication ────────────────────────────────────────────────────────
    if (action === 'publish') {
      await interaction.deferUpdate();
      const channel = guild.channels.cache.get(draft.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply({
          embeds: [errorEmbed('Ce salon n’existe plus ou n’est pas un salon textuel. Choisissez-en un autre avec « Salon ».')],
          components: [],
        });
        return;
      }

      const panel = panelService.create({
        guildId: guild.id,
        name: draft.title,
        channelId: draft.channelId,
        title: draft.title,
        description: draft.description,
        roles: draft.roles,
        mode: draft.mode,
        behaviour: 'toggle',
        color: draft.color,
        imageUrl: draft.imageUrl,
        footer: draft.footer,
        createdBy: draft.userId,
      });
      const published = await panelService.publish(guild, panel.id);
      drafts.delete(draft.id);

      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: '📢 Embed publié !',
            description: [
              `**Salon :** <#${published.channelId}>`,
              `**Identifiant :** \`${published.id}\``,
              `**Boutons de rôles :** ${published.roles.length}`,
              '',
              published.roles.length > 0
                ? 'Les membres peuvent cliquer sur les boutons pour recevoir leurs rôles ✅'
                : 'Astuce : `/rolepanel ajouter panneau:' + published.id + ' role:@Exemple` pour ajouter des boutons.',
              '',
              `**Image jointe :** \`/embed image panneau:${published.id} fichier:<votre image>\``,
              `**Modification :** \`/embed modifier panneau:${published.id} titre:…\``,
            ].join('\n'),
            color: THEME.colors.success,
          }),
        ],
        components: [],
      });
      log.info(`Embed « ${published.title} » publié par ${interaction.user.tag} (${published.id})`);
      return;
    }

    // ── Sélection des rôles ────────────────────────────────────────────────
    if (action === 'roles') {
      if (interaction.isStringSelectMenu()) {
        draft.roles = interaction.values.slice(0, 25).map((roleId) => {
          const role = guild.roles.cache.get(roleId);
          return {
            roleId,
            label: role?.name ?? roleId,
            emoji: role?.unicodeEmoji ?? null,
            style: 'secondary' as const,
          };
        });
        await interaction.deferUpdate();
        await refreshPreview(interaction, draft);
        return;
      }

      const botHighest = guild.members.me?.roles.highest.position ?? 0;
      const assignable = [...guild.roles.cache.values()]
        .filter((role) => !role.managed && role.id !== guild.id && role.position < botHighest)
        .sort((a, b) => b.position - a.position)
        .slice(0, 25);

      if (assignable.length === 0) {
        await interaction.reply({
          embeds: [
            errorEmbed(
              'Aucun rôle attribuable : mon rôle est trop bas dans la hiérarchie.\n➜ *Paramètres du serveur → Rôles* : placez le rôle d’Elysia au-dessus des rôles à distribuer.',
              'Hiérarchie des rôles',
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.update({
        embeds: [
          baseEmbed({
            title: '🎭 Sélectionnez les rôles à distribuer',
            description: [
              'Choisissez jusqu’à **25 rôles** : chaque rôle devient un bouton (5 par ligne).',
              'Les membres pourront les obtenir et les retirer librement.',
            ].join('\n'),
            color: THEME.colors.panel,
            footer: `Brouillon ${draft.id} • ${assignable.length} rôle(s) attribuable(s)`,
          }),
        ],
        components: [
          selectMenu({
            id: `em:roles:${draft.id}`,
            placeholder: 'Rôles attribuables par les membres',
            minValues: 0,
            maxValues: Math.min(assignable.length, 25),
            options: assignable.map((role) => ({
              value: role.id,
              label: role.name.slice(0, 100),
              description: `${role.members.size} membre(s) • position ${role.position}`,
              default: draft.roles.some((entry) => entry.roleId === role.id),
            })),
          }),
          ...buttonRows([{ id: `em:back:${draft.id}`, label: 'Retour à l’aperçu', emoji: '↩️', style: 'secondary' }]),
        ],
      });
      return;
    }

    if (action === 'back') {
      await interaction.update(stripFlags(previewPayload(draft)) as never);
      return;
    }

    // ── Changement de salon ────────────────────────────────────────────────
    if (action === 'channel') {
      if (interaction.isStringSelectMenu()) {
        draft.channelId = interaction.values[0];
        await interaction.deferUpdate();
        await refreshPreview(interaction, draft);
        return;
      }
      const channels = [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildText).slice(0, 25);
      await interaction.update({
        embeds: [baseEmbed({ title: '🔗 Choisissez le salon de publication', color: THEME.colors.info })],
        components: [
          selectMenu({
            id: `em:channel:${draft.id}`,
            placeholder: 'Salon de destination',
            options: channels.map((channel) => ({ value: channel.id, label: `#${(channel as { name?: string }).name ?? channel.id}`.slice(0, 100) })),
          }),
          ...buttonRows([{ id: `em:back:${draft.id}`, label: 'Retour à l’aperçu', emoji: '↩️', style: 'secondary' }]),
        ],
      });
      return;
    }

    // ── Bascule boutons / menu déroulant ───────────────────────────────────
    if (action === 'mode') {
      draft.mode = draft.mode === 'buttons' ? 'select' : 'buttons';
      await interaction.deferUpdate();
      await refreshPreview(interaction, draft);
      return;
    }

    // ── Rotation des styles de boutons ─────────────────────────────────────
    if (action === 'style') {
      const order: PanelButtonConfig['style'][] = ['primary', 'secondary', 'success', 'danger'];
      draft.roles = draft.roles.map((entry, index) => ({ ...entry, style: order[index % order.length] }));
      await interaction.deferUpdate();
      await refreshPreview(interaction, draft);
      const hint = await interaction
        .followUp({
          content: '🎨 Styles répartis (violet → gris → vert → rouge). Recliquez pour décaler le cycle.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
      if (hint) setTimeout(() => void hint.delete().catch(() => undefined), 6_000).unref?.();
      return;
    }

    // ── Image par URL ──────────────────────────────────────────────────────
    if (action === 'image') {
      const modal = new ModalBuilder()
        .setCustomId(`em:image:${draft.id}`)
        .setTitle('Image d’illustration')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('url')
              .setLabel('URL de l’image (ou « aucune » pour retirer)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(400)
              .setPlaceholder('https://exemple.com/banniere.png'),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    log.debug(`Action d’embed inconnue : ${args.join(':')}`);
  },
};

export { drafts as embedDrafts };
