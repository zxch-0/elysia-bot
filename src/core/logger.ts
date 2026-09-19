import { loadConfig } from './config';

type Level = 'debug' | 'info' | 'warn' | 'error' | 'success';

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, success: 25, warn: 30, error: 40 };

const COLOR = {
  reset: '\u001b[0m',
  gray: '\u001b[90m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  white: '\u001b[37m',
  bold: '\u001b[1m',
};

const LEVEL_STYLE: Record<Level, { tag: string; color: string }> = {
  debug: { tag: 'DEBUG', color: COLOR.gray },
  info: { tag: ' INFO', color: COLOR.cyan },
  success: { tag: '   OK', color: COLOR.green },
  warn: { tag: ' WARN', color: COLOR.yellow },
  error: { tag: 'ERROR', color: COLOR.red },
};

function timestamp(): string {
  const now = new Date();
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
  return (
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
    `${pad(now.getMilliseconds(), 3)}`
  );
}

export interface Logger {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  success(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string | Error, ...meta: unknown[]): void;
  child(scope: string): Logger;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

/**
 * Sérialisation compacte d'une erreur passée en métadonnée.
 * `JSON.stringify(new Error(...))` renvoie `[{}]` (message et stack ne sont pas
 * énumérables) : on extrait donc explicitement les champs utiles, sans le
 * `requestBody` volumineux des DiscordAPIError.
 */
function compactError(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const record: Record<string, unknown> = { name: value.name, message: value.message };
  const extra = value as Error & { code?: unknown; status?: unknown; method?: unknown; url?: unknown };
  for (const key of ['code', 'status', 'method', 'url'] as const) {
    if (extra[key] !== undefined) record[key] = extra[key];
  }
  return record;
}

function write(scope: string, level: Level, message: string | Error, meta: unknown[]): void {
  const config = (() => {
    try {
      return loadConfig();
    } catch {
      return undefined;
    }
  })();

  const minLevel = (config?.logLevel ?? 'info') as Level;
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;

  const isError = message instanceof Error;
  const text = isError ? `${message.message}` : message;
  // Les erreurs en métadonnée sont compactées : sans cela, `JSON.stringify`
  // produit `[{}]` (Error) ou un dump de plusieurs Ko (DiscordAPIError).
  const payload = [...meta.map(compactError), ...(isError ? [serializeError(message)] : [])];

  if (config?.logFormat === 'json') {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        scope,
        message: text,
        meta: payload,
      }),
    );
    return;
  }

  const style = LEVEL_STYLE[level];
  const head = `${COLOR.gray}${timestamp()}${COLOR.reset} ${style.color}${COLOR.bold}${style.tag}${COLOR.reset} ${COLOR.magenta}[${scope}]${COLOR.reset}`;
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  const extras = payload.length ? ` ${COLOR.gray}${safeStringify(payload)}${COLOR.reset}` : '';
  stream(`${head} ${text}${extras}`);

  if (isError && message.stack) {
    const frames = message.stack.split('\n').slice(1, 6).map((line) => `       ${COLOR.gray}${line.trim()}${COLOR.reset}`);
    stream(frames.join('\n'));
  }
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, ...meta) => write(scope, 'debug', message, meta),
    info: (message, ...meta) => write(scope, 'info', message, meta),
    success: (message, ...meta) => write(scope, 'success', message, meta),
    warn: (message, ...meta) => write(scope, 'warn', message, meta),
    error: (message, ...meta) => write(scope, 'error', message, meta),
    child: (child) => createLogger(`${scope}:${child}`),
  };
}

export const logger = createLogger('elysia');
