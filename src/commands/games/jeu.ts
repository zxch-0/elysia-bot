import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { BotError } from '../../core/errors';
import type { Command, CommandContext } from '../../core/types';
import { GAME_DEFINITIONS, registerGames } from '../../games/registry';
import { HANGMAN_THEMES } from '../../games/content/words';
import { QUIZ_THEMES } from '../../games/content/questions';
import type { GameId, GamePlayer, GameSession } from '../../games/types';
import { MEDALS, toPlayer } from '../../games/ui/common';
import { createBlackjackSession } from '../../games/ui/blackjack';
import { createConnectFour } from '../../games/ui/connectFour';
import { create2048Session } from '../../games/ui/game2048';
import { createHangmanSession } from '../../games/ui/hangman';
import { createMemorySession } from '../../games/ui/memory';
import { createMinesweeperSession } from '../../games/ui/minesweeper';
import { createMotusSession } from '../../games/ui/motus';
import { createQuizSession } from '../../games/ui/quiz';
import { createRpsSession } from '../../games/ui/rps';
import { createTicTacToe } from '../../games/ui/tictactoe';
import type { ConnectFourLevel } from '../../games/engine/connectFour';
import type { TicTacToeLevel } from '../../games/engine/tictactoe';
import type { HangmanTheme } from '../../games/engine/hangman';
import type { QuizDifficulty, QuizTheme } from '../../games/engine/quiz';
import type { RpsVariant } from '../../games/engine/rps';
import { gameService } from '../../services/gameService';
import { baseEmbed, THEME } from '../../ui/embeds';
import { humanizeNumber } from '../../utils/format';
import { CURRENCY_EMOJI } from '../../services/economyService';

registerGames();

const GAME_CHOICES = GAME_DEFINITIONS.map((definition) => ({ name: `${definition.emoji} ${definition.label}`, value: definition.id }));
const HANGMAN_THEME_CHOICES = [
  { name: '🎲 Aléatoire', value: 'aleatoire' },
  ...Object.entries(HANGMAN_THEMES).map(([value, meta]) => ({ name: `${meta.emoji} ${meta.label}`, value })),
];
const QUIZ_THEME_CHOICES = [
  { name: '🎲 Thèmes mélangés', value: 'mix' },
  ...Object.entries(QUIZ_THEMES).map(([value, meta]) => ({ name: `${meta.emoji} ${meta.label}`, value })),
];

/** Mise en forme du record personnel selon le jeu. */
const BEST_FORMAT: Partial<Record<GameId, (value: number) => string>> = {
  pendu: (value) => `record : ${value} erreur(s)`,
  motus: (value) => `record : ${value} essai(s)`,
  quiz: (value) => `record : ${value} pts en un quiz`,
  demineur: (value) => `record : ${value} s`,
  '2048': (value) => `record : ${humanizeNumber(value)} pts`,
  blackjack: (value) => `meilleur bilan : ${value > 0 ? '+' : ''}${humanizeNumber(value)} ${CURRENCY_EMOJI}`,
  memory: (value) => `record : ${value} coup(s)`,
};

function definitionOf(game: GameId) {
  return GAME_DEFINITIONS.find((definition) => definition.id === game);
}

/** Adversaire humain (défi direct), partie ouverte ou IA/solo. */
function resolveOpponent(interaction: ChatInputCommandInteraction): { opponent: GamePlayer | null; open: boolean } {
  const target = interaction.options.getUser('adversaire');
  const open = interaction.options.getBoolean('ouvert') ?? false;
  if (target) {
    if (target.bot) throw new BotError('Les bots ne peuvent pas être défiés — laissez le champ vide pour affronter l’IA.');
    if (target.id === interaction.user.id) throw new BotError('Vous ne pouvez pas vous défier vous-même !');
    if (!interaction.options.getMember('adversaire')) throw new BotError('Ce membre ne fait pas partie du serveur : il ne pourrait pas répondre au défi.');
    return { opponent: toPlayer(target), open: false };
  }
  return { opponent: null, open };
}

function buildSession(ctx: CommandContext, subcommand: string): GameSession<any> {
  const { interaction, guild } = ctx;
  const base = { guildId: guild.id, channelId: interaction.channelId, host: toPlayer(interaction.user) };

  switch (subcommand) {
    case 'morpion': {
      const { opponent, open } = resolveOpponent(interaction);
      const level = (interaction.options.getString('niveau') ?? 'normal') as TicTacToeLevel;
      return createTicTacToe({ ...base, opponent, open, level });
    }
    case 'puissance4': {
      const { opponent, open } = resolveOpponent(interaction);
      const level = (interaction.options.getString('niveau') ?? 'normal') as ConnectFourLevel;
      return createConnectFour({ ...base, opponent, open, level });
    }
    case 'pfc': {
      const { opponent, open } = resolveOpponent(interaction);
      const variant = (interaction.options.getString('variante') ?? 'classique') as RpsVariant;
      const bestOf = interaction.options.getInteger('manches') ?? 3;
      return createRpsSession({ ...base, opponent, open, variant, bestOf });
    }
    case 'memory': {
      const { opponent, open } = resolveOpponent(interaction);
      const pairs = interaction.options.getInteger('paires') ?? 8;
      return createMemorySession({ ...base, opponent, open, pairs });
    }
    case 'pendu': {
      const theme = (interaction.options.getString('theme') ?? 'aleatoire') as HangmanTheme | 'aleatoire';
      const mode = (interaction.options.getString('mode') ?? 'solo') as 'solo' | 'tous';
      return createHangmanSession({ ...base, theme, mode });
    }
    case 'motus':
      return createMotusSession(base);
    case 'quiz': {
      const theme = (interaction.options.getString('theme') ?? 'mix') as QuizTheme | 'mix';
      const difficulty = (interaction.options.getString('difficulte') ?? 'mix') as QuizDifficulty;
      const count = interaction.options.getInteger('questions') ?? 5;
      const secondsPerQuestion = interaction.options.getInteger('secondes') ?? 20;
      return createQuizSession({ ...base, theme, difficulty, count, secondsPerQuestion });
    }
    case 'demineur':
      return createMinesweeperSession({ ...base, mines: interaction.options.getInteger('mines') ?? 4 });
    case '2048':
      return create2048Session(base);
    case 'blackjack':
      return createBlackjackSession(base);
    default:
      throw new BotError('Jeu inconnu.');
  }
}

async function showList(ctx: CommandContext): Promise<void> {
  const embed = baseEmbed({
    title: '🎮 Mini-jeux Elysia',
    description: [
      'Toutes les parties se jouent directement dans Discord avec des boutons.',
      'Défiez un membre (`adversaire`), ouvrez la partie à tous (`ouvert`) ou affrontez l’IA.',
      '',
      ...GAME_DEFINITIONS.map((definition) => `${definition.emoji} **${definition.label}** — ${definition.description}\n   ↳ \`/jeu ${definition.id}\``),
      '',
      `🏆 \`/jeu classement\` • 📊 \`/jeu stats\` • ${gameService.activeCount()} partie(s) en cours sur le bot.`,
    ].join('\n'),
    color: THEME.colors.primary,
    footer: 'Elysia • mini-jeux • les points alimentent le classement du serveur',
  });
  await ctx.interaction.reply({ embeds: [embed] });
}

async function showStats(ctx: CommandContext): Promise<void> {
  const target = ctx.interaction.options.getUser('membre') ?? ctx.interaction.user;
  const stats = gameService.stats(ctx.guild.id, target.id);
  if (!stats || Object.keys(stats.games).length === 0) {
    await ctx.info('Aucune statistique', `${target.id === ctx.interaction.user.id ? 'Vous n’avez' : `<@${target.id}> n’a`} encore joué à aucun mini-jeu sur ce serveur. Lancez \`/jeu liste\` !`);
    return;
  }

  const rank = gameService.rank(ctx.guild.id, target.id);
  const totals = Object.values(stats.games).reduce(
    (accumulator, record) => ({
      played: accumulator.played + record.played,
      wins: accumulator.wins + record.wins,
      losses: accumulator.losses + record.losses,
      draws: accumulator.draws + record.draws,
    }),
    { played: 0, wins: 0, losses: 0, draws: 0 },
  );

  const lines = (Object.entries(stats.games) as Array<[GameId, NonNullable<(typeof stats.games)[GameId]>]>)
    .sort((a, b) => b[1].points - a[1].points)
    .map(([game, record]) => {
      const definition = definitionOf(game);
      const rate = record.played > 0 ? Math.round((record.wins / record.played) * 100) : 0;
      const best = record.best !== null && BEST_FORMAT[game] ? ` • ${BEST_FORMAT[game]!(record.best)}` : '';
      const streak = record.bestStreak > 1 ? ` • série max ${record.bestStreak}` : '';
      return `${definition?.emoji ?? '🎮'} **${definition?.label ?? game}** — ${record.played} partie(s), ${record.wins} V / ${record.losses} D / ${record.draws} N (${rate} %) • **${record.points}** pts${best}${streak}`;
    });

  const embed = baseEmbed({
    title: `📊 Statistiques de ${target.username}`,
    description: [
      `🏆 **${humanizeNumber(stats.points)}** points • classement : ${rank ? `**#${rank}**` : '—'} sur ${gameService.leaderboard(ctx.guild.id, Number.MAX_SAFE_INTEGER).length} joueur(s)`,
      `🎮 ${totals.played} partie(s) • ${totals.wins} victoire(s) • ${totals.losses} défaite(s) • ${totals.draws} nul(s)`,
      '',
      ...lines,
    ].join('\n'),
    color: THEME.colors.info,
    thumbnail: target.displayAvatarURL({ size: 128 }),
    footer: 'Elysia • mini-jeux',
  });
  await ctx.interaction.reply({ embeds: [embed] });
}

async function showLeaderboard(ctx: CommandContext): Promise<void> {
  const game = (ctx.interaction.options.getString('jeu') ?? null) as GameId | null;
  const definition = game ? definitionOf(game) : undefined;
  const entries = gameService.leaderboard(ctx.guild.id, 10, game ?? undefined);
  const myRank = gameService.rank(ctx.guild.id, ctx.interaction.user.id);

  const lines = entries.map((entry, index) => {
    const record = game ? entry.stats.games[game] : undefined;
    const detail = record ? ` (${record.wins} V / ${record.played} parties)` : '';
    return `${MEDALS[index] ?? `**${index + 1}.**`} <@${entry.stats.userId}> — **${humanizeNumber(entry.points)}** pts${detail}`;
  });

  const embed = baseEmbed({
    title: `🏆 Classement ${definition ? `${definition.emoji} ${definition.label}` : 'général'} — ${ctx.guild.name}`,
    description: [
      lines.length ? lines.join('\n') : '*Aucun point marqué pour le moment. Soyez le premier avec `/jeu liste` !*',
      '',
      myRank && !game ? `Votre position : **#${myRank}**` : '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
    color: THEME.colors.primary,
    thumbnail: ctx.guild.iconURL({ size: 128 }) ?? undefined,
    footer: 'Elysia • mini-jeux • points cumulés sur ce serveur',
  });
  await ctx.interaction.reply({ embeds: [embed] });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('jeu')
    .setDescription('Mini-jeux : morpion, Puissance 4, quiz, pendu, Motus, démineur, 2048, blackjack, memory…')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('morpion')
        .setDescription('Morpion 3×3 contre l’IA ou un membre')
        .addUserOption((option) => option.setName('adversaire').setDescription('Membre à défier (vide = IA)'))
        .addStringOption((option) =>
          option
            .setName('niveau')
            .setDescription('Niveau de l’IA (défaut : normal)')
            .addChoices({ name: '🟢 Facile', value: 'facile' }, { name: '🟡 Normal', value: 'normal' }, { name: '🟣 Imbattable', value: 'imbattable' }),
        )
        .addBooleanOption((option) => option.setName('ouvert').setDescription('Partie ouverte : le premier membre qui rejoint joue')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('puissance4')
        .setDescription('Puissance 4 contre l’IA (4 niveaux) ou un membre')
        .addUserOption((option) => option.setName('adversaire').setDescription('Membre à défier (vide = IA)'))
        .addStringOption((option) =>
          option
            .setName('niveau')
            .setDescription('Niveau de l’IA (défaut : normal)')
            .addChoices(
              { name: '🟢 Facile', value: 'facile' },
              { name: '🟡 Normal', value: 'normal' },
              { name: '🟠 Difficile', value: 'difficile' },
              { name: '🔴 Expert', value: 'expert' },
            ),
        )
        .addBooleanOption((option) => option.setName('ouvert').setDescription('Partie ouverte : le premier membre qui rejoint joue')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pfc')
        .setDescription('Pierre-Feuille-Ciseaux en plusieurs manches (variante Lézard-Spock)')
        .addUserOption((option) => option.setName('adversaire').setDescription('Membre à défier (vide = IA)'))
        .addStringOption((option) =>
          option
            .setName('variante')
            .setDescription('Règles (défaut : classique)')
            .addChoices({ name: '✂️ Classique', value: 'classique' }, { name: '🖖 Lézard-Spock', value: 'lezard-spock' }),
        )
        .addIntegerOption((option) =>
          option
            .setName('manches')
            .setDescription('Au meilleur des… (défaut : 3)')
            .addChoices({ name: '1 manche', value: 1 }, { name: '3 manches', value: 3 }, { name: '5 manches', value: 5 }, { name: '7 manches', value: 7 }),
        )
        .addBooleanOption((option) => option.setName('ouvert').setDescription('Partie ouverte : le premier membre qui rejoint joue')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('memory')
        .setDescription('Memory : retrouvez les paires, en solo ou en duel')
        .addUserOption((option) => option.setName('adversaire').setDescription('Membre à défier (vide = solo)'))
        .addIntegerOption((option) =>
          option
            .setName('paires')
            .setDescription('Nombre de paires (défaut : 8)')
            .addChoices({ name: '6 paires (facile)', value: 6 }, { name: '8 paires (normal)', value: 8 }, { name: '10 paires (difficile)', value: 10 }),
        )
        .addBooleanOption((option) => option.setName('ouvert').setDescription('Duel ouvert : le premier membre qui rejoint joue')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pendu')
        .setDescription('Pendu : devinez un mot français par thème')
        .addStringOption((option) => option.setName('theme').setDescription('Thème du mot (défaut : aléatoire)').addChoices(...HANGMAN_THEME_CHOICES))
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Qui peut jouer ? (défaut : solo)')
            .addChoices({ name: '🎯 Solo — moi uniquement', value: 'solo' }, { name: '👥 Tous — tout le salon coopère', value: 'tous' }),
        ),
    )
    .addSubcommand((sub) => sub.setName('motus').setDescription('Motus : le mot mystère de 5 lettres en 6 essais'))
    .addSubcommand((sub) =>
      sub
        .setName('quiz')
        .setDescription('Quiz multijoueur chronométré avec podium')
        .addStringOption((option) => option.setName('theme').setDescription('Thème (défaut : mélangés)').addChoices(...QUIZ_THEME_CHOICES))
        .addStringOption((option) =>
          option
            .setName('difficulte')
            .setDescription('Difficulté (défaut : mixte)')
            .addChoices(
              { name: '⭐ Facile', value: 'facile' },
              { name: '⭐⭐ Normal', value: 'normal' },
              { name: '⭐⭐⭐ Difficile', value: 'difficile' },
              { name: '🎲 Mixte', value: 'mix' },
            ),
        )
        .addIntegerOption((option) => option.setName('questions').setDescription('Nombre de questions (3–20, défaut : 5)').setMinValue(3).setMaxValue(20))
        .addIntegerOption((option) => option.setName('secondes').setDescription('Temps par question en secondes (10–60, défaut : 20)').setMinValue(10).setMaxValue(60)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('demineur')
        .setDescription('Démineur 5×4 avec mode drapeau et chrono')
        .addIntegerOption((option) => option.setName('mines').setDescription('Nombre de mines (2–8, défaut : 4)').setMinValue(2).setMaxValue(8)),
    )
    .addSubcommand((sub) => sub.setName('2048').setDescription('2048 : fusionnez les tuiles jusqu’à 2048'))
    .addSubcommand((sub) => sub.setName('blackjack').setDescription('Blackjack contre le croupier : pariez votre argent (gagné en discutant)'))
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Statistiques de mini-jeux d’un membre')
        .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter (défaut : vous)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('classement')
        .setDescription('Classement des joueurs du serveur')
        .addStringOption((option) => option.setName('jeu').setDescription('Limiter à un jeu (défaut : général)').addChoices(...GAME_CHOICES)),
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Catalogue des mini-jeux disponibles')),
  category: 'games',
  summary: 'Mini-jeux interactifs (IA, duels, quiz) avec classement du serveur',
  usage: ['/jeu puissance4 niveau:expert', '/jeu morpion adversaire:@Membre', '/jeu quiz theme:geographie questions:10', '/jeu classement'],
  cooldown: 3,
  publicReply: true,
  noDefer: true,

  async run(ctx) {
    const { interaction, settings } = ctx;
    if (settings.modules.games === false) {
      await ctx.error('Les mini-jeux sont désactivés sur ce serveur. Un administrateur peut les réactiver avec `/config modules module:🎮 Mini-jeux actif:true`.');
      return;
    }

    const subcommand = ctx.subcommand() ?? 'liste';
    if (subcommand === 'liste') return showList(ctx);
    if (subcommand === 'stats') return showStats(ctx);
    if (subcommand === 'classement') return showLeaderboard(ctx);

    const session = buildSession(ctx, subcommand);
    const definition = gameService.definition(session.game);
    if (!definition) {
      gameService.discard(session);
      throw new BotError('Ce jeu n’est pas disponible.');
    }

    const payload = definition.render(session);
    const opponent = session.status === 'waiting' ? session.players[1] : undefined;
    try {
      const response = await interaction.reply({
        content: opponent ? `<@${opponent.id}>` : payload.content || undefined,
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
        allowedMentions: opponent ? { users: [opponent.id] } : { parse: [] },
        withResponse: true,
      });
      session.messageId = response.resource?.message?.id ?? (await interaction.fetchReply()).id;
    } catch (error) {
      gameService.discard(session);
      throw error;
    }
  },
};

export default command;
