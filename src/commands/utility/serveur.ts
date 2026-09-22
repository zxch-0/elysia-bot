import { ChannelType, SlashCommandBuilder, type Guild } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, THEME } from '../../ui/embeds';
import { buttonRows } from '../../ui/components';
import { progressBar, humanizeNumber, accountAge } from '../../utils/format';
import { timestampTag } from '../../utils/duration';

const VERIFICATION_LABELS: Record<number, string> = {
  0: 'Aucune',
  1: 'Faible (e-mail vérifié)',
  2: 'Moyenne (compte 5 min)',
  3: 'Élevée (membre 10 min)',
  4: 'Très élevée (téléphone vérifié)',
};

const EXPLICIT_CONTENT_LABELS: Record<number, string> = {
  0: 'Désactivé',
  1: 'Membres sans rôle',
  2: 'Tous les membres',
  3: 'Âge vérifié',
};

const FEATURE_LABELS: Record<string, string> = {
  COMMUNITY: 'Communauté',
  DISCOVERABLE: 'Serveur public',
  PARTNERED: 'Partenaire Discord',
  VERIFIED: 'Vérifié',
  ANIMATED_ICON: 'Icône animée',
  BANNER: 'Bannière',
  VANITY_URL: 'URL personnalisée',
  NEWS: 'Salons d’annonces',
  ROLE_SUBSCRIPTIONS_ENABLED: 'Abonnements de rôle',
  THREADS_ENABLED: 'Fils de discussion',
  WELCOME_SCREEN_ENABLED: 'Écran d’accueil',
  MEMBER_VERIFICATION_GATE_ENABLED: 'Passage d’entrée',
  MONETIZATION_ENABLED: 'Monétisation',
  SOUNDBOARD: 'Table sonore',
};

/** Compte les salons par type (textuels, vocaux, catégories, forums, fils). */
function channelStats(guild: Guild) {
  const channels = [...guild.channels.cache.values()];
  return {
    text: channels.filter((channel) => channel.type === ChannelType.GuildText).length,
    voice: channels.filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice).length,
    categories: channels.filter((channel) => channel.type === ChannelType.GuildCategory).length,
    forums: channels.filter((channel) => channel.type === ChannelType.GuildForum).length,
    announcements: channels.filter((channel) => channel.type === ChannelType.GuildAnnouncement).length,
    threads: guild.channels.cache.filter((channel) => channel.isThread()).size,
    total: channels.length,
  };
}

/**
 * Fiche technique complète du serveur : population, salons, rôles, émojis,
 * boosts et fonctionnalités activées.
 */
const serverCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('serveur')
    .setDescription('Fiche complète du serveur (population, salons, boosts, fonctionnalités)')
    .setDMPermission(false),
  category: 'utility',
  summary: 'Fiche technique du serveur',
  usage: ['/serveur'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const { guild } = ctx;
    const owner = await guild.fetchOwner().catch(() => null);
    const channels = channelStats(guild);
    const members = guild.members.cache;

    const humans = members.filter((member) => !member.user.bot).size;
    const bots = members.filter((member) => member.user.bot).size;
    const boosters = members.filter((member) => Boolean(member.premiumSinceTimestamp)).size;

    const boostTier = guild.premiumTier;
    const boostTarget = [0, 2, 7, 14][Math.min(boostTier + 1, 3)] ?? 14;

    const embed = baseEmbed({
      title: `🏰 ${guild.name}`,
      description: guild.description ?? '*Aucune description définie.*',
      color: THEME.colors.primary,
      thumbnail: guild.iconURL({ size: 256 }),
      image: guild.bannerURL({ size: 1024 }) ?? null,
      footer: `Identifiant : ${guild.id} • créé le ${new Date(guild.createdTimestamp).toLocaleDateString('fr-FR')}`,
    });

    embed.addFields(
      {
        name: '👑 Propriétaire',
        value: owner ? `${owner.user} (\`${owner.id}\`)` : '*inconnu*',
        inline: true,
      },
      {
        name: '📅 Création',
        value: `${timestampTag(guild.createdTimestamp, 'D')} — ${accountAge(guild.createdTimestamp)}`,
        inline: true,
      },
      {
        name: '👥 Population',
        value: [
          `Total : **${humanizeNumber(guild.memberCount)}**`,
          `Humains : ${humanizeNumber(humans)} • Bots : ${humanizeNumber(bots)}`,
          `Boosts : ${humanizeNumber(guild.premiumSubscriptionCount ?? 0)} (${boosters} booster(s))`,
        ].join('\n'),
        inline: true,
      },
      {
        name: `🚀 Boosts — niveau ${boostTier}`,
        value: `${progressBar(guild.premiumSubscriptionCount ?? 0, boostTarget, 10)} ${guild.premiumSubscriptionCount ?? 0}/${boostTarget}`,
        inline: true,
      },
      {
        name: `💬 Salons (${channels.total})`,
        value: [
          `Textuels : ${channels.text} • Vocaux : ${channels.voice}`,
          `Catégories : ${channels.categories} • Forums : ${channels.forums}`,
          `Annonces : ${channels.announcements} • Fils actifs : ${channels.threads}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🎭 Rôles & émojis',
        value: [
          `Rôles : **${guild.roles.cache.size}**`,
          `Émojis : ${guild.emojis.cache.size} • Stickers : ${guild.stickers.cache.size}`,
          `Salon système : ${guild.systemChannel ? guild.systemChannel.toString() : '*aucun*'}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🔒 Sécurité',
        value: [
          `Vérification : ${VERIFICATION_LABELS[guild.verificationLevel] ?? guild.verificationLevel}`,
          `Contenu explicite : ${EXPLICIT_CONTENT_LABELS[guild.explicitContentFilter] ?? guild.explicitContentFilter}`,
          `Notifications : ${guild.defaultMessageNotifications === 0 ? 'tous les messages' : 'mentions uniquement'}`,
        ].join('\n'),
      },
      {
        name: '✨ Fonctionnalités',
        value:
          guild.features.length > 0
            ? guild.features.map((feature) => FEATURE_LABELS[feature] ?? feature).join(' • ')
            : '*aucune fonctionnalité spéciale*',
      },
    );

    const iconUrl = guild.iconURL({ size: 1024 });
    const bannerUrl = guild.bannerURL({ size: 2048 });
    const links = [
      ...(iconUrl ? [{ id: 'server:icon', label: 'Icône', emoji: '🖼️', style: 'secondary' as const, url: iconUrl }] : []),
      ...(bannerUrl ? [{ id: 'server:banner', label: 'Bannière', emoji: '🎏', style: 'secondary' as const, url: bannerUrl }] : []),
      { id: 'server:roles', label: 'Rôles', emoji: '🎭', style: 'secondary' as const, url: `https://discord.com/channels/${guild.id}/${guild.channels.cache.first()?.id ?? guild.id}` },
    ];

    return ctx.send(embed, links.length > 0 ? buttonRows(links) : []);
  },
};

export default serverCommand;
