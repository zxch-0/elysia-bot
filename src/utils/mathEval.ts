/**
 * Évaluateur d'expressions mathématiques **sans `eval()`**.
 *
 * Grammaire supportée (analyse descendante récursive) :
 *   addition/soustraction → multiplication/division/modulo → puissance (droite)
 *   → moins unaire → primaire (nombre, constante, parenthèses, fonction, factorielle).
 *
 * Exemples : `2 + 3 * 4` → 14, `sqrt(144)` → 12, `2^10` → 1024,
 * `100 / (2 + 3)` → 20, `5!` → 120, `20 % de 250` → 50.
 */

export class MathEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MathEvalError';
  }
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: (value) => {
    if (value < 0) throw new MathEvalError('Racine carrée d’un nombre négatif.');
    return Math.sqrt(value);
  },
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  cos: Math.cos,
  sin: Math.sin,
  tan: Math.tan,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  sign: Math.sign,
  min: (...values) => Math.min(...values),
  max: (...values) => Math.max(...values),
  pow: (base, exponent) => base ** exponent,
  hypot: (...values) => Math.hypot(...values),
  avg: (...values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
};

function factorial(value: number): number {
  if (value < 0 || !Number.isInteger(value)) throw new MathEvalError('Factorielle réservée aux entiers positifs.');
  if (value > 170) throw new MathEvalError('Nombre trop grand pour une factorielle (max 170).');
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'name'; value: string }
  | { type: 'op'; value: string };

/**
 * Normalise l'expression : « ² », « × », « ÷ », virgules décimales, « % de ».
 * La virgule n'est convertie en point que **hors parenthèses** : dans un appel
 * de fonction (`max(1,2)`) elle reste un séparateur d'arguments.
 */
export function normalizeDecimalCommas(input: string): string {
  let depth = 0;
  let output = '';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(depth - 1, 0);

    if (char === ',' && depth === 0 && /[0-9]/.test(input[index - 1] ?? '') && /[0-9]/.test(input[index + 1] ?? '')) {
      output += '.';
      continue;
    }
    output += char;
  }
  return output;
}

export function normalizeExpression(input: string): string {
  return normalizeDecimalCommas(input)
    .replace(/\s+/g, ' ')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/²/g, '^2')
    // « 15% de 240 » → « (15/100)*240 » ; le signe « % » reste un modulo ailleurs.
    .replace(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|du|des|of)\s*/gi, '($1/100)*')
    .replace(/(\d+(?:[.,]\d+)?)\s*%\s*$/i, '($1/100)')
    .trim()
    .toLowerCase();
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (char === ' ') {
      index += 1;
      continue;
    }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(input[index + 1] ?? ''))) {
      let literal = '';
      while (index < input.length && /[0-9._]/.test(input[index])) {
        if (input[index] !== '_') literal += input[index];
        index += 1;
      }
      if (input[index] === 'e' && /[0-9+-]/.test(input[index + 1] ?? '')) {
        literal += 'e';
        index += 1;
        if (/[+-]/.test(input[index] ?? '')) {
          literal += input[index];
          index += 1;
        }
        while (index < input.length && /[0-9]/.test(input[index])) {
          literal += input[index];
          index += 1;
        }
      }
      const value = Number(literal);
      if (!Number.isFinite(value)) throw new MathEvalError(`Nombre invalide : « ${literal} ».`);
      tokens.push({ type: 'number', value });
      continue;
    }

    if (/[a-zπ]/.test(char)) {
      let name = '';
      while (index < input.length && /[a-z0-9π]/.test(input[index])) {
        name += input[index];
        index += 1;
      }
      tokens.push({ type: 'name', value: name });
      continue;
    }

    if ('+-*/%^()!,<>=&|'.includes(char)) {
      // Opérateurs composés tolérés : « <= », « >= », « == » (comparaisons simples).
      const pair = input.slice(index, index + 2);
      if (['<=', '>=', '==', '!='].includes(pair)) {
        tokens.push({ type: 'op', value: pair });
        index += 2;
        continue;
      }
      tokens.push({ type: 'op', value: char });
      index += 1;
      continue;
    }

    throw new MathEvalError(`Caractère non reconnu : « ${char} ».`);
  }

  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private eat(value: string): boolean {
    const token = this.peek();
    if (token && token.type === 'op' && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  parse(): number {
    const value = this.comparison();
    if (this.position < this.tokens.length) throw new MathEvalError('Expression trop complexe ou mal parenthésée.');
    return value;
  }

  /** Comparaisons : renvoient 1 (vrai) ou 0 (faux). */
  private comparison(): number {
    let value = this.additive();
    for (;;) {
      const token = this.peek();
      if (!token || token.type !== 'op' || !['<', '>', '<=', '>=', '==', '!='].includes(token.value)) return value;
      this.position += 1;
      const right = this.additive();
      value = compare(value, token.value, right);
    }
  }

  private additive(): number {
    let value = this.multiplicative();
    for (;;) {
      if (this.eat('+')) value += this.multiplicative();
      else if (this.eat('-')) value -= this.multiplicative();
      else return value;
    }
  }

  private multiplicative(): number {
    let value = this.unary();
    for (;;) {
      if (this.eat('*')) value *= this.unary();
      else if (this.eat('/')) {
        const divisor = this.unary();
        if (divisor === 0) throw new MathEvalError('Division par zéro impossible.');
        value /= divisor;
      } else if (this.eat('%')) {
        const divisor = this.unary();
        if (divisor === 0) throw new MathEvalError('Modulo par zéro impossible.');
        value %= divisor;
      } else if (this.startsPrimary()) {
        // Multiplication implicite : « 2(3+4) », « 3pi ».
        value *= this.unary();
      } else return value;
    }
  }

  /** Vrai si un terme peut commencer juste ici (pour la multiplication implicite). */
  private startsPrimary(): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.type === 'number' || token.type === 'name') return true;
    return token.type === 'op' && token.value === '(';
  }

  private unary(): number {
    if (this.eat('-')) return -this.unary();
    if (this.eat('+')) return this.unary();
    return this.power();
  }

  /** La puissance est associative à droite : 2^3^2 = 2^(3^2). */
  private power(): number {
    const base = this.postfix();
    if (this.eat('^')) return base ** this.unary();
    return base;
  }

  /** Factorielle postfixée : 5! = 120. */
  private postfix(): number {
    let value = this.primary();
    while (this.eat('!')) value = factorial(value);
    return value;
  }

  private primary(): number {
    const token = this.peek();
    if (!token) throw new MathEvalError('Expression incomplète.');

    if (token.type === 'number') {
      this.position += 1;
      return token.value;
    }

    if (token.type === 'name') {
      this.position += 1;
      const name = token.value;

      if (this.eat('(')) {
        const args: number[] = [];
        if (!this.eat(')')) {
          do {
            args.push(this.comparison());
          } while (this.eat(','));
          if (!this.eat(')')) throw new MathEvalError(`Parenthèse fermante manquante après « ${name} ».`);
        }
        const fn = FUNCTIONS[name];
        if (!fn) throw new MathEvalError(`Fonction inconnue : « ${name} » (disponibles : ${Object.keys(FUNCTIONS).join(', ')}).`);
        return fn(...args);
      }

      // Multiplication implicite : « 2pi », « 3(4+1) ».
      const constant = CONSTANTS[name];
      if (constant !== undefined) return constant;

      throw new MathEvalError(`Symbole inconnu : « ${name} ».`);
    }

    if (this.eat('(')) {
      const value = this.comparison();
      if (!this.eat(')')) throw new MathEvalError('Parenthèse fermante manquante.');
      return value;
    }

    throw new MathEvalError(`Symbole inattendu : « ${token.value} ».`);
  }
}

function compare(left: number, operator: string, right: number): number {
  switch (operator) {
    case '<':
      return left < right ? 1 : 0;
    case '>':
      return left > right ? 1 : 0;
    case '<=':
      return left <= right ? 1 : 0;
    case '>=':
      return left >= right ? 1 : 0;
    case '==':
      return left === right ? 1 : 0;
    default:
      return left !== right ? 1 : 0;
  }
}

/** Évalue une expression et retourne le résultat (lève `MathEvalError` sinon). */
export function evaluateExpression(expression: string): number {
  const normalized = normalizeExpression(expression);
  if (!normalized) throw new MathEvalError('Expression vide.');
  if (normalized.length > 300) throw new MathEvalError('Expression trop longue (300 caractères maximum).');
  const result = new Parser(tokenize(normalized)).parse();
  if (!Number.isFinite(result)) throw new MathEvalError('Résultat non calculable (division par zéro ?).');
  return result;
}

/** 1234.5 → « 1 234,5 » (arrondi à 10 décimales, sans zéros inutiles). */
export function formatNumber(value: number, locale = 'fr-FR'): string {
  const rounded = Number(value.toFixed(10));
  return rounded.toLocaleString(locale, { maximumFractionDigits: 10 });
}
