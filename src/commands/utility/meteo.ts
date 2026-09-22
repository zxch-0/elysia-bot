import { SlashCommandBuilder } from 'discord.js';
import type { Command, CommandContext } from '../../core/types';
import { baseEmbed, errorEmbed, THEME } from '../../ui/embeds';
import { UsageError } from '../../core/errors';
import { truncate } from '../../utils/format';

/** API Open-Meteo : gratuite, sans clé d'API ni quota commercial. */
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
  timezone?: string;
}

/** Codes WMO → libellé français + émoji. */
const WEATHER_CODES: Record<number, { label: string; day: string; night: string }> = {
  0: { label: 'Ciel dégagé', day: '☀️', night: '🌙' },
  1: { label: 'Principalement dégagé', day: '🌤️', night: '🌙' },
  2: { label: 'Partiellement nuageux', day: '⛅', night: '☁️' },
  3: { label: 'Couvert', day: '☁️', night: '☁️' },
  45: { label: 'Brouillard', day: '🌫️', night: '🌫️' },
  48: { label: 'Brouillard givrant', day: '🌫️', night: '🌫️' },
  51: { label: 'Bruine légère', day: '🌦️', night: '🌧️' },
  53: { label: 'Bruine', day: '🌦️', night: '🌧️' },
  55: { label: 'Bruine dense', day: '🌧️', night: '🌧️' },
  56: { label: 'Bruine verglaçante', day: '🌧️', night: '🌧️' },
  57: { label: 'Bruine verglaçante dense', day: '🌧️', night: '🌧️' },
  61: { label: 'Pluie faible', day: '🌦️', night: '🌧️' },
  63: { label: 'Pluie modérée', day: '🌧️', night: '🌧️' },
  65: { label: 'Pluie forte', day: '🌧️', night: '🌧️' },
  66: { label: 'Pluie verglaçante', day: '🌧️', night: '🌧️' },
  67: { label: 'Pluie verglaçante forte', day: '🌧️', night: '🌧️' },
  71: { label: 'Neige faible', day: '🌨️', night: '🌨️' },
  73: { label: 'Neige modérée', day: '🌨️', night: '🌨️' },
  75: { label: 'Neige forte', day: '❄️', night: '❄️' },
  77: { label: 'Grains de neige', day: '🌨️', night: '🌨️' },
  80: { label: 'Averses faibles', day: '🌦️', night: '🌧️' },
  81: { label: 'Averses modérées', day: '🌧️', night: '🌧️' },
  82: { label: 'Averses violentes', day: '⛈️', night: '⛈️' },
  85: { label: 'Averses de neige', day: '🌨️', night: '🌨️' },
  86: { label: 'Fortes averses de neige', day: '❄️', night: '❄️' },
  95: { label: 'Orage', day: '⛈️', night: '⛈️' },
  96: { label: 'Orage avec grêle', day: '⛈️', night: '⛈️' },
  99: { label: 'Orage violent avec grêle', day: '🌩️', night: '🌩️' },
};

function describeCode(code: number | undefined, isDay = true): { label: string; emoji: string } {
  const entry = WEATHER_CODES[code ?? -1] ?? { label: 'Conditions inconnues', day: '❔', night: '❔' };
  return { label: entry.label, emoji: isDay ? entry.day : entry.night };
}

/** Conseil vestimentaire simple, calculé à partir de la température ressentie. */
function advice(feelsLike: number, precipitation: number): string {
  if (feelsLike <= 0) return '🧥 Couvrez-vous bien : il fait glacial.';
  if (feelsLike < 10) return '🧣 Veste chaude recommandée.';
  if (feelsLike < 18) return '🧥 Une petite veste suffira.';
  if (feelsLike < 26) return '👕 Temps agréable, tenue légère.';
  if (feelsLike < 33) return '🥵 Il fait chaud : hydratez-vous.';
  return '🔥 Canicule : restez à l’ombre et buvez de l’eau.';
}

const geocodeCache = new Map<string, { at: number; results: GeoResult[] }>();

/** Recherche une ville (avec cache mémoire de 5 minutes). */
async function geocode(query: string): Promise<GeoResult[]> {
  const key = query.trim().toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results;

  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Service de géocodage indisponible (HTTP ${response.status}).`);
  const payload = (await response.json()) as { results?: GeoResult[] };
  const results = payload.results ?? [];
  geocodeCache.set(key, { at: Date.now(), results });
  return results;
}

async function fetchForecast(place: GeoResult, days: number): Promise<ForecastResponse> {
  const url =
    `${WEATHER_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    `&timezone=auto&forecast_days=${Math.min(Math.max(days, 1), 5)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Service météo indisponible (HTTP ${response.status}).`);
  return (await response.json()) as ForecastResponse;
}

function placeLabel(place: GeoResult): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

/**
 * Météo et prévisions via l'API publique Open-Meteo (aucune clé requise).
 * L'autocomplétion propose directement les villes trouvées.
 */
const weatherCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('meteo')
    .setDescription('Météo actuelle et prévisions d’une ville (données Open-Meteo)')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('ville').setDescription('Nom de la ville (autocomplétion)').setRequired(true).setAutocomplete(true))
    .addIntegerOption((option) => option.setName('jours').setDescription('Nombre de jours de prévision (1 à 4)').setMinValue(1).setMaxValue(4)),
  category: 'utility',
  summary: 'Météo et prévisions',
  usage: ['/meteo ville:Paris', '/meteo ville:Montréal jours:3'],
  cooldown: 5,
  async run(ctx: CommandContext) {
    const query = ctx.string('ville');
    const days = ctx.interaction.options.getInteger('jours') ?? 1;

    const results = await geocode(query).catch((error: Error) => {
      throw new UsageError(`Recherche impossible : ${truncate(error.message, 120)}`);
    });
    if (results.length === 0) {
      return ctx.send(errorEmbed(`Aucune ville trouvée pour « ${truncate(query, 60)} ». Essayez un nom plus complet (ex. « Lyon », « Québec »).`, 'Ville introuvable'));
    }

    const place = results[0];
    const forecast = await fetchForecast(place, days).catch((error: Error) => {
      throw new UsageError(`Récupération de la météo impossible : ${truncate(error.message, 120)}`);
    });

    const current = forecast.current ?? {};
    const isDay = (current.is_day ?? 1) === 1;
    const condition = describeCode(current.weather_code, isDay);

    const embed = baseEmbed({
      title: `${condition.emoji} Météo à ${placeLabel(place)}`,
      description: `**${condition.label}** — ${current.temperature_2m ?? '?'} °C (ressenti ${current.apparent_temperature ?? '?'} °C)`,
      color: THEME.colors.info,
      footer: `Fuseau local : ${forecast.timezone ?? place.timezone ?? 'inconnu'} • source : Open-Meteo`,
    });

    embed.addFields(
      { name: '💨 Vent', value: `${current.wind_speed_10m ?? '?'} km/h`, inline: true },
      { name: '💧 Humidité', value: `${current.relative_humidity_2m ?? '?'} %`, inline: true },
      { name: '🌧️ Précipitations', value: `${current.precipitation ?? 0} mm`, inline: true },
      { name: '🧭 Conseil', value: advice(current.apparent_temperature ?? current.temperature_2m ?? 15, current.precipitation ?? 0) },
    );

    if (days > 1 && forecast.daily) {
      const daily = forecast.daily;
      const lines = daily.time.slice(0, days).map((date, index) => {
        const code = describeCode(daily.weather_code?.[index], true);
        const label = new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
        const rain = daily.precipitation_probability_max?.[index];
        return `${code.emoji} **${label}** — ${code.label} • ${daily.temperature_2m_min?.[index] ?? '?'} / ${daily.temperature_2m_max?.[index] ?? '?'} °C${rain !== undefined ? ` • ${rain} % de pluie` : ''}`;
      });
      embed.addFields({ name: '📅 Prévisions', value: lines.join('\n') });
    }

    const others = results.slice(1, 4).map((entry) => placeLabel(entry));
    if (others.length > 0) {
      embed.addFields({ name: '🔎 Autres résultats', value: others.map((entry) => `• ${entry}`).join('\n') });
    }

    return ctx.send(embed);
  },

  /** Autocomplétion : villes trouvées via l'API de géocodage. */
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value ?? '').trim();
    if (query.length < 2) {
      await interaction.respond([]);
      return;
    }

    try {
      const results = await geocode(query);
      await interaction.respond(
        results.slice(0, 25).map((place) => ({
          name: truncate(`${place.name}${place.admin1 ? ` (${place.admin1})` : ''}${place.country ? ` — ${place.country}` : ''}`, 95),
          value: truncate(`${place.name}${place.country ? `, ${place.country}` : ''}`, 95),
        })),
      );
    } catch {
      await interaction.respond([]);
    }
  },
};

export default weatherCommand;
