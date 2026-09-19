import {
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Guild,
} from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import type { PanelButtonConfig, RolePanel } from '../../core/types';
import { panelService } from '../../services/panelService';
import { baseEmbed, THEME, errorEmbed } from '../../ui/embeds';
import { buttonRows, confirmRow } from '../../ui/components';
import { registerConfirmation } from '../../modules/confirmationModule';
import { shortCode } from '../../utils/random';
import { PermissionError, UsageError } from '../../core/errors';
import { bulletList, humanizeNumber } from '../../utils/format';
import { isRoleAssignable } from '../../utils/permissions';

const STYLE_CHOICES = [
  { name: 'Violet (principal)', value: 'primary' },
  { name: 'Gris (secondaire)', value: 'secondary' },
  { name: 'Vert (succès)', value: 'success' },
  { name: 'Rouge (danger)', value: 'danger' },
] as const;

/** « 🎮 @Gamer | 🎨 @Artiste » → [{emoji, roleId, label}] */
export function parseRoleEntries(input: string, guild: Guild): PanelButtonConfig[] {
  return input
    .split(/[|\n;]+/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const parts = raw.split(/\s+/);
      let emoji: string | null = null;
      let roleToken = parts[0];

      if (parts.length > 1 && !/^\d+$/.test(parts[0]) && !/^<@&\d+>$/.test(parts[0])) {
        emoji = parts[0].slice(0, 8);
        roleToken = parts[1];
      }

      const roleId = roleToken.replace(/[<@&>]/g, '');
      const role = guild.roles.cache.get(roleId);

      return {
        roleId,
        label: role?.name ?? `Rôle ${roleId}`,
        emoji,
        style: 'secondary' as const,
        description: undefined,
      };
    })
    .filter((entry) => /^\d{17,20}$/.test(entry.roleId));
}

/** Explique pourquoi un panneau ne peut pas être créé puis lève une erreur claire. */
function assertRolesUsable(guild: Guild, roles: PanelButtonConfig[]): void {
  if (roles.length === 0) {
    throw new UsageError(
      'Aucun rôle valide détecté.\n➜ Exemple : `roles:🎮 @Gamer | 🎨 @Artiste | 🎵 @Musique` (séparez par `|`).',
    );
  }
  const problems: string[] = [];
  for (const entry of roles) {
    const role = guild.roles.cache.get(entry.roleId);
    if (!role) problems.push(`Le rôle \`${entry.roleId}\` est introuvable.`);
    else if (!isRoleAssignable(guild, role)) problems.push(`**${role.name}** est au-dessus de mon rôle : je ne peux pas l’attribuer.`);
  }
  if (problems.length > 0) {
    throw new PermissionError(
      `Impossible de créer ce panneau :\n${bulletList(problems)}\n\n➜ Paramètres du serveur → Rôles : déplacez le rôle du bot **au-dessus** des rôles concernés.`,
    );
  }
}

/**
 * Création et gestion des panneaux de rôles :
 * boutons ou menu déroulant, image d'illustration jointe, aperçu et republication.
 */
const rolePanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('Crée et gère les panneaux de rôles (boutons/menu + image d’illustration)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Crée et publie un panneau de rôles')
        .addChannelOption((option) =>
          option.setName('salon').setDescription('Salon où publier le panneau').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('titre').setDescription('Titre de l’embed').setRequired(true).setMaxLength(200))
        .addStringOption((option) =>
          option.setName('roles').setDescription('Rôles : « 🎮 @Gamer | 🎨 @Artiste | 🎵 @Musique »').setRequired(true).setMaxLength(900),
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('Description de l’embed').setRequired(false).setMaxLength(3800),
        )
        .addAttachmentOption((option) =>
          option.setName('image').setDescription('Image d’illustration à joindre (recommandé : bannière 1024×512)'),
        )
        .addStringOption((option) => option.setName('image_url').setDescription('Alternative : lien direct d’une image').setMaxLength(400))
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Boutons (défaut) ou menu déroulant')
            .addChoices({ name: 'Boutons', value: 'buttons' }, { name: 'Menu déroulant', value: 'select' }),
        )
        .addStringOption((option) =>
          option
            .setName('comportement')
            .setDescription('Multi-sélection libre ou choix unique (le nouveau rôle retire l’ancien)')
            .addChoices(
              { name: 'Multi-sélection (défaut)', value: 'toggle' },
              { name: 'Choix unique', value: 'exclusive' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('styles')
            .setDescription('Couleur des boutons : primary, secondary, success, danger (séparés par des virgules, dans l’ordre)')
            .setMaxLength(200),
        )
        .addStringOption((option) => option.setName('couleur').setDescription('Couleur de l’embed au format hexadécimal (ex. #8b5cf6)').setMaxLength(7))
        .addStringOption((option) => option.setName('pied').setDescription('Texte du pied de page').setMaxLength(200)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ajouter')
        .setDescription('Ajoute un rôle (bouton) à un panneau existant')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant du panneau').setRequired(true).setAutocomplete(true))
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à ajouter').setRequired(true))
        .addStringOption((option) => option.setName('libelle').setDescription('Texte du bouton (défaut : nom du rôle)').setMaxLength(80))
        .addStringOption((option) => option.setName('emoji').setDescription('Émoji du bouton (ex. 🎮)').setMaxLength(8))
        .addStringOption((option) => option.setName('style').setDescription('Couleur du bouton').addChoices(...STYLE_CHOICES))
        .addStringOption((option) => option.setName('description').setDescription('Description affichée dans le menu déroulant').setMaxLength(100)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retire un rôle d’un panneau')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant du panneau').setRequired(true).setAutocomplete(true))
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à retirer').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('modifier')
        .setDescription('Modifie le titre, la description, la couleur, l’image ou le comportement d’un panneau')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant du panneau').setRequired(true).setAutocomplete(true))
        .addStringOption((option) => option.setName('titre').setDescription('Nouveau titre').setMaxLength(200))
        .addStringOption((option) => option.setName('description').setDescription('Nouvelle description').setMaxLength(3800))
        .addStringOption((option) => option.setName('couleur').setDescription('Nouvelle couleur (ex. #ec4899)').setMaxLength(7))
        .addStringOption((option) => option.setName('pied').setDescription('Nouveau texte de pied de page').setMaxLength(200))
        .addStringOption((option) => option.setName('image_url').setDescription('Nouvelle image (URL ou « aucune »)').setMaxLength(400))
        .addAttachmentOption((option) => option.setName('image').setDescription('Nouvelle image à joindre'))
        .addStringOption((option) =>
          option
            .setName('comportement')
            .setDescription('Multi-sélection ou choix unique')
            .addChoices({ name: 'Multi-sélection', value: 'toggle' }, { name: 'Choix unique', value: 'exclusive' }),
        )
        .addStringOption((option) =>
          option.setName('mode').setDescription('Boutons ou menu déroulant').addChoices({ name: 'Boutons', value: 'buttons' }, { name: 'Menu déroulant', value: 'select' }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('publier')
        .setDescription('Republie (ou déplace) un panneau et répare ses boutons')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant du panneau').setRequired(true).setAutocomplete(true))
        .addChannelOption((option) => option.setName('salon').setDescription('Nouveau salon').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('apercu')
        .setDescription('Prévisualise un panneau en privé')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant du panneau').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Liste les panneaux du serveur avec leurs statistiques'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('supprimer')
        .setDescription('Supprime un panneau (et éventuellement son message)')
        .addStringOption((option) => option.setName('panneau').setDescription('Identifiant du panneau').setRequired(true).setAutocomplete(true))
        .addBooleanOption((option) => option.setName('message').setDescription('Supprimer aussi le message Discord')),
    ),
  category: 'roles',
  summary: 'Panneaux de rôles avec boutons, menus et images',
  usage: [
    '/rolepanel creer salon:#rôles titre:Choisis tes rôles roles:🎮 @Gamer | 🎨 @Artiste image:<bannière>',
    '/rolepanel ajouter panneau:gaming-1a2b role:@Musique emoji:🎵',
  ],
  permissions: { user: [PermissionFlagsBits.ManageRoles], bot: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
  cooldown: 5,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'panneau') {
      await interaction.respond([]);
      return;
    }
    const query = String(focused.value ?? '').toLowerCase();
    const panels = panelService
      .listGuild(interaction.guildId ?? '')
      .filter((panel) => panel.id.includes(query) || panel.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((panel) => ({ name: `${panel.name} (${panel.id}) — ${panel.roles.length} rôle(s)`.slice(0, 100), value: panel.id }));
    await interaction.respond(panels);
  },
  async run(ctx: CommandContext) {
    const sub = ctx.subcommand() ?? 'liste';

    const resolvePanel = (id: string): RolePanel => {
      const panel = panelService.get(id);
      if (!panel || panel.guildId !== ctx.guild.id) {
        throw new UsageError(`Aucun panneau \`${id}\` sur ce serveur. Utilisez \`/rolepanel liste\` pour voir les identifiants.`);
      }
      return panel;
    };

    const parseColor = (input: string | null): number | undefined => {
      if (!input) return undefined;
      const hex = input.replace('#', '').trim();
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new UsageError('Couleur invalide. Format attendu : `#8b5cf6`.');
      return Number.parseInt(hex, 16);
    };

    // ── Création ────────────────────────────────────────────────────────────
    if (sub === 'creer') {
      const channel = ctx.channel('salon', undefined, [ChannelType.GuildText]) as import('discord.js').TextChannel;
      const title = ctx.string('titre');
      const description = ctx.interaction.options.getString('description') ?? 'Cliquez sur un bouton ci-dessous pour recevoir le rôle correspondant.';
      const roleEntries = parseRoleEntries(ctx.string('roles'), ctx.guild);
      assertRolesUsable(ctx.guild, roleEntries);

      const styles = (ctx.interaction.options.getString('styles') ?? '')
        .split(/[\s,]+/)
        .map((token) => token.trim().toLowerCase())
        .filter((token): token is PanelButtonConfig['style'] => ['primary', 'secondary', 'success', 'danger'].includes(token));

      roleEntries.forEach((entry, index) => {
        if (styles[index]) entry.style = styles[index];
        if (styles.length === 1 && !styles[index]) entry.style = styles[0];
      });

      const attachment = ctx.attachment('image');
      const imageUrl = ctx.interaction.options.getString('image_url');
      const imageFile = attachment ? await panelService.saveImage(attachment, `${title}-${Date.now()}`) : null;

      const panel = panelService.create({
        guildId: ctx.guild.id,
        name: title,
        channelId: channel.id,
        title,
        description,
        roles: roleEntries,
        mode: (ctx.interaction.options.getString('mode') as 'buttons' | 'select' | null) ?? 'buttons',
        behaviour: (ctx.interaction.options.getString('comportement') as 'toggle' | 'exclusive' | null) ?? 'toggle',
        color: parseColor(ctx.interaction.options.getString('couleur')),
        imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
        footer: ctx.interaction.options.getString('pied'),
        imageFile,
        createdBy: ctx.interaction.user.id,
      });

      const published = await panelService.publish(ctx.guild, panel.id);

      const embed = baseEmbed({
        title: '🎭 Panneau de rôles publié !',
        description: [
          `**Panneau :** <#${channel.id}>`,
          `**Identifiant :** \`${published.id}\``,
          `**Rôles :** ${published.roles.length} (${published.mode === 'select' ? 'menu déroulant' : 'boutons'})`,
          `**Comportement :** ${published.behaviour === 'exclusive' ? 'choix unique' : 'multi-sélection'}`,
          `**Image :** ${published.imageFile ? `jointe (\`${published.imageFile}\`)` : published.imageUrl ? 'via URL' : 'aucune'}`,
          '',
          'Commandes utiles : `/rolepanel ajouter`, `/rolepanel modifier`, `/rolepanel publier`.',
        ].join('\n'),
        color: THEME.colors.success,
      });

      return ctx.send(embed);
    }

    // ── Ajout d'un rôle ─────────────────────────────────────────────────────
    if (sub === 'ajouter') {
      const panel = resolvePanel(ctx.string('panneau'));
      const role = ctx.role('role');
      const entry: PanelButtonConfig = {
        roleId: role.id,
        label: ctx.interaction.options.getString('libelle') ?? role.name,
        emoji: ctx.interaction.options.getString('emoji') ?? null,
        style: (ctx.interaction.options.getString('style') as PanelButtonConfig['style'] | null) ?? 'secondary',
        description: ctx.interaction.options.getString('description') ?? undefined,
      };

      if (panel.roles.length >= 25) throw new UsageError('Un panneau ne peut pas dépasser 25 rôles (limite Discord des menus déroulants).');
      assertRolesUsable(ctx.guild, [entry]);
      if (panel.roles.some((existing) => existing.roleId === role.id)) throw new UsageError(`Le rôle **${role.name}** est déjà présent dans ce panneau.`);

      const updated = panelService.update(panel.id, { roles: [...panel.roles, entry] });
      await panelService.publish(ctx.guild, updated.id);

      return ctx.send(
        baseEmbed({
          title: '➕ Rôle ajouté au panneau',
          description: `**${role.name}** est désormais disponible dans le panneau \`${updated.id}\` (${updated.roles.length} rôle(s)).`,
          color: THEME.colors.success,
        }),
      );
    }

    // ── Retrait d'un rôle ───────────────────────────────────────────────────
    if (sub === 'retirer') {
      const panel = resolvePanel(ctx.string('panneau'));
      const role = ctx.role('role');
      if (!panel.roles.some((entry) => entry.roleId === role.id)) {
        throw new UsageError(`Le rôle **${role.name}** n’est pas dans ce panneau.`);
      }
      const updated = panelService.update(panel.id, { roles: panel.roles.filter((entry) => entry.roleId !== role.id) });
      await panelService.publish(ctx.guild, updated.id);

      return ctx.send(
        baseEmbed({
          title: '➖ Rôle retiré',
          description: `**${role.name}** a été retiré du panneau \`${updated.id}\`.\n*Les membres qui possèdent déjà ce rôle le conservent.*`,
          color: THEME.colors.warning,
        }),
      );
    }

    // ── Modification ────────────────────────────────────────────────────────
    if (sub === 'modifier') {
      const panel = resolvePanel(ctx.string('panneau'));
      const patch: Partial<RolePanel> = {};
      const title = ctx.interaction.options.getString('titre');
      const description = ctx.interaction.options.getString('description');
      const footer = ctx.interaction.options.getString('pied');
      const color = parseColor(ctx.interaction.options.getString('couleur'));
      const imageUrl = ctx.interaction.options.getString('image_url');
      const attachment = ctx.attachment('image');
      const behaviour = ctx.interaction.options.getString('comportement');
      const mode = ctx.interaction.options.getString('mode');

      if (title) {
        patch.title = title;
        patch.name = title;
      }
      if (description) patch.description = description;
      if (footer) patch.footer = footer;
      if (color !== undefined) patch.color = color;
      if (behaviour) patch.behaviour = behaviour as 'toggle' | 'exclusive';
      if (mode) patch.mode = mode as 'buttons' | 'select';
      if (imageUrl) {
        patch.imageUrl = /^(aucune|none|supprimer)$/i.test(imageUrl) ? null : imageUrl;
        if (!patch.imageUrl) patch.imageFile = null;
      }
      if (attachment) {
        patch.imageFile = await panelService.saveImage(attachment, `${panel.name}-${Date.now()}`);
        patch.imageUrl = null;
      }

      if (Object.keys(patch).length === 0) throw new UsageError('Aucune modification fournie. Renseignez au moins une option à changer.');

      const updated = panelService.update(panel.id, patch);
      await panelService.publish(ctx.guild, updated.id);

      const warnings = panelService.diagnose(ctx.guild, updated);
      return ctx.send(
        baseEmbed({
          title: '✏️ Panneau mis à jour',
          description: [
            `Le panneau \`${updated.id}\` a été modifié et republié dans <#${updated.channelId}>.`,
            `**Champs modifiés :** ${Object.keys(patch).join(', ')}`,
            warnings.length ? `\n⚠️ ${warnings.join('\n⚠️ ')}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          color: THEME.colors.success,
        }),
      );
    }

    // ── Publication / réparation ────────────────────────────────────────────
    if (sub === 'publier') {
      const panel = resolvePanel(ctx.string('panneau'));
      const channel = ctx.interaction.options.getChannel('salon') as import('discord.js').TextChannel | null;
      if (channel) panelService.update(panel.id, { channelId: channel.id });
      const published = await panelService.publish(ctx.guild, panel.id);
      const warnings = panelService.diagnose(ctx.guild, published);

      return ctx.send(
        baseEmbed({
          title: '📢 Panneau publié',
          description: [
            `Message publié dans <#${published.channelId}> avec ${published.roles.length} bouton(s).`,
            warnings.length ? `⚠️ ${warnings.join('\n⚠️ ')}` : '✅ Aucun problème détecté.',
          ].join('\n'),
          color: warnings.length ? THEME.colors.warning : THEME.colors.success,
        }),
      );
    }

    // ── Aperçu ──────────────────────────────────────────────────────────────
    if (sub === 'apercu') {
      const panel = resolvePanel(ctx.string('panneau'));
      const files = panelService.buildFiles(panel);
      const embed = panelService.buildEmbed(panel);
      const warnings = panelService.diagnose(ctx.guild, panel);
      if (warnings.length > 0) embed.addFields({ name: '⚠️ Diagnostics', value: warnings.join('\n').slice(0, 1024) });

      return ctx.interaction.editReply({
        embeds: [embed],
        components: panelService.buildComponents(panel),
        files,
      });
    }

    // ── Liste ───────────────────────────────────────────────────────────────
    if (sub === 'liste') {
      const panels = panelService.listGuild(ctx.guild.id);
      if (panels.length === 0) {
        return ctx.send(
          errorEmbed(
            'Aucun panneau sur ce serveur.\n➜ Créez-en un avec `/rolepanel creer` ou `/embed creer`.',
            'Aucun panneau',
          ),
        );
      }

      const embed = baseEmbed({
        title: '🎭 Panneaux de rôles',
        description: bulletList(
          panels.map((panel) => {
            const merged = (panel.roles.length / 5).toFixed(0);
            return `\`${panel.id}\` — **${truncateTitle(panel.title)}** • ${panel.roles.length} rôle(s) • ${merged} ligne(s) de boutons • <#${panel.channelId}>`;
          }),
          { max: 20 },
        ),
        color: THEME.colors.panel,
        footer: `${panels.length} panneau(x) • /rolepanel apercu pour prévisualiser`,
      });

      const rows = buttonRows(
        panels.slice(0, 4).flatMap((panel) => [
          { id: `rr:stats:${panel.id}`, label: `Stats ${truncateTitle(panel.name)}`, emoji: '📊', style: 'primary' as const },
          { id: `rr:preview:${panel.id}`, label: `Aperçu ${truncateTitle(panel.name)}`, emoji: '👁️', style: 'secondary' as const },
        ]),
      );

      return ctx.send(embed, rows);
    }

    // ── Suppression ─────────────────────────────────────────────────────────
    if (sub === 'supprimer') {
      const panel = resolvePanel(ctx.string('panneau'));
      const deleteMessage = ctx.interaction.options.getBoolean('message') ?? true;
      const token = shortCode(10);

      registerConfirmation(token, {
        userId: ctx.interaction.user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        cancelMessage: 'Le panneau est conservé.',
        onConfirm: async (buttonInteraction) => {
          if (deleteMessage && panel.messageId) {
            const channel = ctx.guild.channels.cache.get(panel.channelId);
            if (channel?.isTextBased()) {
              const message = await channel.messages.fetch(panel.messageId).catch(() => null);
              await message?.delete().catch(() => undefined);
            }
          }
          panelService.delete(panel.id);
          await buttonInteraction.editReply({
            embeds: [
              baseEmbed({
                title: '🗑️ Panneau supprimé',
                description: `Le panneau \`${panel.id}\` a été retiré. Les rôles déjà attribués restent en place.`,
                color: THEME.colors.error,
              }),
            ],
            components: [],
          });
        },
      });

      return ctx.interaction.editReply({
        embeds: [
          baseEmbed({
            title: '⚠️ Confirmation',
            description: `Supprimer le panneau **${panel.title}** (\`${panel.id}\`) et ses ${panel.roles.length} bouton(s) ?`,
            color: THEME.colors.warning,
          }),
        ],
        components: [confirmRow(token, { yes: 'Supprimer', no: 'Annuler' })],
      });
    }

    return ctx.error(`Sous-commande inconnue : \`${sub}\` (${humanizeNumber(8)} disponibles).`);
  },
};

function truncateTitle(text: string): string {
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

export { AttachmentBuilder };
export default rolePanelCommand;
