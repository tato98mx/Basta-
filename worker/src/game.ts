/**
 * Basta — lógica pura del juego.
 *
 * SIN dependencias del runtime de Cloudflare: máquina de estados, ruleta de
 * letras, juez con diccionario, puntuación, gracia de 5 s, congelamiento a
 * los 3 minutos con categoría bonus, podio y revancha. Importable y
 * testeable con node.
 *
 * El servidor es autoritativo: `publicState()` es lo único que se envía al
 * cliente y NUNCA incluye las respuestas de otros jugadores mientras se
 * escribe (ni siquiera sus borradores). El cliente solo renderiza.
 */

import DICTIONARY from "./dictionary.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Parámetros del juego (un solo lugar para cambiarlos)
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  { id: "nombre", label: "Nombre", article: "un", noun: "nombre" },
  { id: "apellido", label: "Apellido", article: "un", noun: "apellido" },
  { id: "ciudad", label: "Ciudad o País", article: "una", noun: "ciudad o país" },
  { id: "animal", label: "Animal", article: "un", noun: "animal" },
  { id: "fruta", label: "Fruta o Verdura", article: "una", noun: "fruta o verdura" },
  { id: "comida", label: "Comida", article: "una", noun: "comida" },
  { id: "cosa", label: "Cosa / Objeto", article: "una", noun: "cosa u objeto" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export const BONUS_CATEGORIES = [
  { id: "superheroe", label: "Superhéroe", article: "un", noun: "superhéroe" },
  { id: "deporte", label: "Deporte", article: "un", noun: "deporte" },
  { id: "cantante", label: "Cantante o Banda", article: "un", noun: "cantante o banda" },
  { id: "marca", label: "Marca", article: "una", noun: "marca" },
  { id: "videojuego", label: "Videojuego", article: "un", noun: "videojuego" },
] as const;
export type BonusCategoryId = (typeof BONUS_CATEGORIES)[number]["id"];

/** Rotación de la categoría bonus: ronda 1 → Superhéroe, ronda 2 → Deporte,
 *  ronda 3 → Cantante o Banda, ronda 4 → Marca, ronda 5 → Videojuego,
 *  ronda 6 → Superhéroe otra vez, etc. */
export const BONUS_ROTATION: BonusCategoryId[] = BONUS_CATEGORIES.map((c) => c.id);

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const TOTAL_ROUNDS_OPTIONS = [3, 5, 7, 10] as const;
export const MAX_PLAYERS = 6;

export const ROULETTE_MS = 4_000; // ruleta de la letra: ~4 s
export const COUNTDOWN_MS = 3_000; // cuenta atrás 3-2-1: 3 s
export const FREEZE_MS = 180_000; // sin límite de escritura, pero a los 3 min se congela
export const GRACE_MS = 5_000; // gracia del ganador anterior: 5 s
export const BONUS_MS = 60_000; // ?v=8 (A2): la fase bonus también tiene límite:
// si nadie oprime ¡BASTA! con su palabra bonus en 60 s, la ronda se
// cierra sola con lo que cada quien haya escrito (antes deadline=null y
// la partida podía quedarse colgada para siempre).
export const DISCONNECT_PURGE_MS = 300_000; // ?v=8 (A1): un jugador
// desconectado se saca de la sala a los 5 min (libera su asiento); las
// puertas de "¡Listo!" y "Continuar" solo cuentan jugadores CONECTADOS,
// así que un desconectado ya no bloquea la partida ni un minuto.

export const POINTS_UNIQUE = 100;
export const POINTS_REPEATED = 50;
export const POINTS_INVALID = 0;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Phase =
  | "lobby"
  | "ready"
  | "roulette"
  | "countdown"
  | "writing"
  | "grace"
  | "bonus"
  | "roundEnd"
  | "gameOver";

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  ready: boolean;
  /** Tocó "Continuar" en fin de ronda (puerta entre rondas). */
  continued: boolean;
  /** ?v=8 (A1): marca de tiempo (ms) en que se le cayó la conexión, o null
   *  si está conectado. Las puertas solo cuentan conectados y a los 5 min
   *  el jugador se purga de la sala (ver tick). */
  disconnectedAt: number | null;
}

export interface JudgedAnswer {
  category: string;
  word: string;
  canonical: string | null;
  points: number;
  valid: boolean;
  reason: string;
}

export interface PlayerRoundResult {
  answers: JudgedAnswer[];
  bonus: JudgedAnswer | null;
  frozenPoints: number;
  bonusPoints: number;
  roundPoints: number;
}

export interface GameState {
  code: string;
  phase: Phase;
  players: PlayerState[];
  totalRounds: number;
  round: number;
  letter: string | null;
  usedLetters: string[];
  /** Borradores de respuestas por jugador (SOLO servidor, nunca se envían
   *  a otros jugadores). */
  answers: Record<string, Record<string, string>>;
  bonusAnswers: Record<string, string>;
  bonusCategory: BonusCategoryId | null;
  bastaBy: string | null;
  gracePlayer: string | null;
  prevRoundWinner: string | null;
  roundWinner: string | null;
  roundPoints: Record<string, number>;
  results: Record<string, PlayerRoundResult> | null;
  frozenPoints: Record<string, number> | null;
  winner: string | null;
  podium: string[];
  deadline: number | null;
}

export type Rng = () => number;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function ok(): ActionResult {
  return { ok: true };
}
function fail(error: string): ActionResult {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function defaultRng(): number {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  } catch {
    return Math.random();
  }
}

/** Normalizar: minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de Levenshtein (para tolerar typos de 1 letra). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2; // más de 1 de distancia seguro
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

interface DictionaryData {
  categories: Record<string, Record<string, string[]>>;
  bonus: Record<string, string[]>;
}
const DICT = DICTIONARY as unknown as DictionaryData;

/** Número de palabras del diccionario (para documentar y testear). */
export function dictionaryStats(): {
  main: number;
  bonus: number;
  perCategory: Record<string, number>;
} {
  const perCategory: Record<string, number> = {};
  let main = 0;
  for (const [cat, byLetter] of Object.entries(DICT.categories)) {
    const n = Object.values(byLetter).reduce((s, arr) => s + arr.length, 0);
    perCategory[cat] = n;
    main += n;
  }
  const bonus = Object.values(DICT.bonus).reduce((s, arr) => s + arr.length, 0);
  return { main, bonus, perCategory };
}

/** Busca la entrada canónica de `word` en una lista (exacta o typo ≤1).
 *  Regla anti-colisión (?v=8, partida real 2026-11-11): en palabras CORTAS
 *  una diferencia de 1 letra casi siempre es OTRA palabra, no un typo
 *  ("caca" y "caja" caían a 1 letra de "cama" —primera entrada de Cosa/C—
 *  y ambas valían 50 de repetida siendo distintas). Por eso el fuzzy solo aplica cuando la diferencia es
 *  por inserción/borrado (longitud distinta, p. ej. "ratta" → "rata") o la
 *  palabra tiene 6+ letras (un typo de 1 letra en palabra larga). */
function findCanonical(normalized: string, entries: string[]): string | null {
  for (const e of entries) {
    if (normalizeAnswer(e) === normalized) return normalizeAnswer(e);
  }
  for (const e of entries) {
    const canon = normalizeAnswer(e);
    if (levenshtein(canon, normalized) <= 1 &&
        (canon.length !== normalized.length || normalized.length >= 6)) {
      return canon;
    }
  }
  return null;
}

export interface JudgeResult {
  valid: boolean;
  canonical: string | null;
  reason: string;
}

/**
 * Juez de una respuesta de las 7 categorías (servidor, autoritativo).
 * Válida solo si empieza con la letra de la ronda Y pertenece a la
 * categoría según el diccionario. Tolera typos de 1 letra (Levenshtein ≤1).
 * `letter` es la letra de la ronda (A-Z); si es null no se exige letra
 * (solo se usa para el bonus, que va por `judgeBonus`).
 */
export function judgeAnswer(
  raw: string | null | undefined,
  categoryId: string,
  letter: string | null,
): JudgeResult {
  const word = (raw ?? "").trim();
  if (!word) return { valid: false, canonical: null, reason: "Sin respuesta" };
  const n = normalizeAnswer(word);
  if (!n) return { valid: false, canonical: null, reason: "Sin respuesta" };

  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (letter) {
    if (n[0] !== letter.toLowerCase()) {
      return { valid: false, canonical: null, reason: `No empieza con ${letter}` };
    }
    const entries = DICT.categories[categoryId]?.[letter.toLowerCase()] ?? [];
    const canonical = findCanonical(n, entries);
    if (canonical) return { valid: true, canonical, reason: "¡Válida!" };
    // ¿Existe en OTRA categoría con esa misma letra? Entonces es de otra
    // categoría, no de esta.
    for (const other of CATEGORIES) {
      if (other.id === categoryId) continue;
      const otherEntries = DICT.categories[other.id]?.[letter.toLowerCase()] ?? [];
      if (findCanonical(n, otherEntries)) {
        return {
          valid: false,
          canonical: null,
          reason: `No es ${cat ? `${cat.article} ${cat.noun}` : "de esta categoría"}`,
        };
      }
    }
    return { valid: false, canonical: null, reason: "No está en el diccionario del juego" };
  }
  // Sin letra (no se usa en las 7 categorías; el bonus usa judgeBonus).
  return { valid: false, canonical: null, reason: "No está en el diccionario del juego" };
}

/**
 * Juez de la palabra bonus: NO exige letra, solo que pertenezca a la
 * categoría bonus según su diccionario (con la misma tolerancia a typos).
 */
export function judgeBonus(raw: string | null | undefined, bonusId: string): JudgeResult {
  const word = (raw ?? "").trim();
  if (!word) return { valid: false, canonical: null, reason: "Sin respuesta" };
  const n = normalizeAnswer(word);
  if (!n) return { valid: false, canonical: null, reason: "Sin respuesta" };
  const entries = DICT.bonus[bonusId] ?? [];
  const canonical = findCanonical(n, entries);
  if (canonical) return { valid: true, canonical, reason: "¡Válida!" };
  const cat = BONUS_CATEGORIES.find((c) => c.id === bonusId);
  for (const other of BONUS_CATEGORIES) {
    if (other.id === bonusId) continue;
    if (findCanonical(n, DICT.bonus[other.id] ?? [])) {
      return {
        valid: false,
        canonical: null,
        reason: `No es ${cat ? `${cat.article} ${cat.noun}` : "de esta categoría"}`,
      };
    }
  }
  return { valid: false, canonical: null, reason: "No está en el diccionario del juego" };
}

/** Elige una letra al azar (A-Z) que no se haya usado en esta partida. */
export function pickLetter(used: string[], rng: Rng = defaultRng): string {
  let pool = LETTERS.filter((l) => !used.includes(l));
  if (pool.length === 0) pool = [...LETTERS];
  return pool[Math.floor(rng() * pool.length)];
}

// ---------------------------------------------------------------------------
// Creación y jugadores
// ---------------------------------------------------------------------------

export interface CreateGameOptions {
  totalRounds?: number;
}

export function createGame(code: string, opts: CreateGameOptions = {}): GameState {
  const totalRounds = TOTAL_ROUNDS_OPTIONS.includes(opts.totalRounds as (typeof TOTAL_ROUNDS_OPTIONS)[number])
    ? (opts.totalRounds as number)
    : 5;
  return {
    code,
    phase: "lobby",
    players: [],
    totalRounds,
    round: 0,
    letter: null,
    usedLetters: [],
    answers: {},
    bonusAnswers: {},
    bonusCategory: null,
    bastaBy: null,
    gracePlayer: null,
    prevRoundWinner: null,
    roundWinner: null,
    roundPoints: {},
    results: null,
    frozenPoints: null,
    winner: null,
    podium: [],
    deadline: null,
  };
}

/** Añade un jugador a la sala. Máximo 6. Devuelve su id o null si está llena. */
export function addPlayer(state: GameState, name: string): string | null {
  const clean = name.trim().slice(0, 30);
  if (!clean) return null;
  if (state.players.length >= MAX_PLAYERS) return null;
  const id = `p${state.players.length + 1}`;
  state.players.push({ id, name: clean, score: 0, ready: false, continued: false, disconnectedAt: null });
  state.answers[id] = {};
  state.bonusAnswers[id] = "";
  return id;
}

export function playerById(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

/** Jugadores con la conexión activa (?v=8, A1). Las puertas de "¡Listo!"
 *  y "Continuar" solo cuentan a estos: si a alguien se le cae el internet
 *  en el móvil, la partida no se queda esperando eternamente. */
export function connectedPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.disconnectedAt === null);
}

/** Marca a un jugador como desconectado (lo llama el DO al cerrarse su
 *  socket). No borra nada: si reconecta antes de la purga, sigue en la
 *  partida con sus respuestas y puntos. */
export function markDisconnected(state: GameState, playerId: string, now: number = Date.now()): void {
  const p = playerById(state, playerId);
  if (p && p.disconnectedAt === null) p.disconnectedAt = now;
}

/** Al reconectar, el jugador vuelve a contar para las puertas. */
export function markConnected(state: GameState, playerId: string): void {
  const p = playerById(state, playerId);
  if (p) p.disconnectedAt = null;
}

/** ¿La sala ya puede pasar a "ready"? (al entrar el 2º jugador). */
export function maybeEnterReady(state: GameState): void {
  if (state.phase === "lobby" && state.players.length >= 2) {
    state.phase = "ready";
    for (const p of state.players) p.ready = false;
  }
}

// ---------------------------------------------------------------------------
// Flujo de la partida
// ---------------------------------------------------------------------------

export interface StartOptions {
  rng?: Rng;
  now?: number;
}

/** Abre la ruleta de una ronda: elige letra nueva y pone fecha límite. */
function beginRound(state: GameState, now: number, rng: Rng): void {
  const letter = pickLetter(state.usedLetters, rng);
  state.usedLetters.push(letter);
  state.letter = letter;
  state.answers = {};
  for (const p of state.players) state.answers[p.id] = {};
  state.bonusAnswers = {};
  for (const p of state.players) state.bonusAnswers[p.id] = "";
  state.bonusCategory = null;
  state.bastaBy = null;
  state.gracePlayer = null;
  state.roundWinner = null;
  state.roundPoints = {};
  state.results = null;
  state.frozenPoints = null;
  // Nueva ronda: nadie ha tocado "Continuar" todavía.
  for (const p of state.players) p.continued = false;
  state.phase = "roulette";
  state.deadline = now + ROULETTE_MS;
}

/** Arranca la partida desde "ready": requiere TODOS los CONECTADOS listos
 *  y 2+ jugadores conectados (?v=8, A1: un desconectado no bloquea). */
export function startGame(state: GameState, opts: StartOptions = {}): ActionResult {
  if (state.phase !== "ready") return fail("La partida no está en fase de listos.");
  if (state.players.length < 2) return fail("Faltan jugadores para empezar.");
  const connected = connectedPlayers(state);
  if (!connected.every((p) => p.ready)) {
    return fail("Todavía no están todos listos.");
  }
  const rng = opts.rng ?? defaultRng;
  const now = opts.now ?? Date.now();
  state.round = 1;
  for (const p of state.players) p.score = 0;
  state.prevRoundWinner = null;
  state.winner = null;
  state.podium = [];
  beginRound(state, now, rng);
  return ok();
}

/** Un jugador oprime "¡Listo a jugar!". Si son todos, arranca la partida. */
export function setReady(
  state: GameState,
  playerId: string,
  opts: StartOptions = {},
): ActionResult {
  if (state.phase !== "ready") return fail("Ahora no toca ponerse listo.");
  const player = playerById(state, playerId);
  if (!player) return fail("Jugador desconocido.");
  player.ready = true;
  const connected = connectedPlayers(state);
  if (connected.length >= 1 && connected.every((p) => p.ready)) {
    return startGame(state, opts);
  }
  return ok();
}

/** Un jugador oprime "Continuar" en fin de ronda. Cuando TODOS los
 *  jugadores CONECTADOS lo han tocado, se avanza a la siguiente ronda
 *  (ruleta) o al podio final si era la última. ?v=8 (A1): un jugador
 *  desconectado ya no bloquea la puerta (antes se esperaba eternamente
 *  a alguien que cerró la pestaña o se quedó sin internet). */
export function setContinue(
  state: GameState,
  playerId: string,
  opts: StartOptions = {},
): ActionResult {
  if (state.phase !== "roundEnd") return fail("Ahora no toca continuar.");
  const player = playerById(state, playerId);
  if (!player) return fail("Jugador desconocido.");
  player.continued = true;
  const connected = connectedPlayers(state);
  if (connected.length >= 1 && connected.every((p) => p.continued)) {
    return advance(state, opts);
  }
  return ok();
}

/** Puntúa las 7 respuestas de cada jugador (unicidad por canónica) y
 *  devuelve los puntos de la ronda por jugador. */
function judgeMainAnswers(
  state: GameState,
): { results: Record<string, PlayerRoundResult>; roundPoints: Record<string, number> } {
  const letter = state.letter;
  // Primero: juzgar cada respuesta (válida o no, con su canónica).
  const judged: Record<string, JudgedAnswer[]> = {};
  for (const p of state.players) {
    judged[p.id] = CATEGORY_IDS.map((catId) => {
      const word = state.answers[p.id]?.[catId] ?? "";
      const j = judgeAnswer(word, catId, letter);
      return {
        category: catId,
        word: word.trim(),
        canonical: j.canonical,
        points: 0,
        valid: j.valid,
        reason: j.reason,
      };
    });
  }
  // Después: unicidad — una canónica válida repetida vale 50, única vale 100.
  const counts: Record<string, number> = {};
  for (const p of state.players) {
    for (const a of judged[p.id]) {
      if (a.valid && a.canonical) {
        const key = `${a.category}:${a.canonical}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }
  const results: Record<string, PlayerRoundResult> = {};
  const roundPoints: Record<string, number> = {};
  for (const p of state.players) {
    let total = 0;
    for (const a of judged[p.id]) {
      if (!a.valid || !a.canonical) {
        a.points = POINTS_INVALID;
      } else if (counts[`${a.category}:${a.canonical}`] > 1) {
        a.points = POINTS_REPEATED;
        a.reason = "Repetida: 50 pts";
      } else {
        a.points = POINTS_UNIQUE;
        a.reason = "¡Única! 100 pts";
      }
      total += a.points;
    }
    results[p.id] = {
      answers: judged[p.id],
      bonus: null,
      frozenPoints: total,
      bonusPoints: 0,
      roundPoints: total,
    };
    roundPoints[p.id] = total;
  }
  return { results, roundPoints };
}

/** Desempate del ganador de ronda: más puntos; si empatan, gana quien
 *  oprimió ¡BASTA!; si tampoco, el primer jugador en orden de entrada. */
function pickRoundWinner(state: GameState, roundPoints: Record<string, number>): string {
  let best: string | null = null;
  let bestPts = -1;
  for (const p of state.players) {
    const pts = roundPoints[p.id] ?? 0;
    if (pts > bestPts) {
      best = p.id;
      bestPts = pts;
    }
  }
  const tied = state.players.filter((p) => (roundPoints[p.id] ?? 0) === bestPts);
  if (tied.length > 1 && state.bastaBy && tied.some((p) => p.id === state.bastaBy)) {
    return state.bastaBy;
  }
  return best ?? state.players[0].id;
}

/** Cierra la ronda con los puntos ya juzgados: suma al marcador, guarda el
 *  ganador de la ronda y pasa a "roundEnd". */
function finishRound(
  state: GameState,
  results: Record<string, PlayerRoundResult>,
  roundPoints: Record<string, number>,
): void {
  for (const p of state.players) {
    p.score += roundPoints[p.id] ?? 0;
  }
  state.results = results;
  state.roundPoints = roundPoints;
  state.roundWinner = pickRoundWinner(state, roundPoints);
  state.prevRoundWinner = state.roundWinner;
  state.phase = "roundEnd";
  state.deadline = null;
  state.gracePlayer = null;
  // Fin de ronda: la puerta de "Continuar" empieza en cero.
  for (const p of state.players) p.continued = false;
}

/** Puntúa la ronda normal (sin congelamiento): juzga y cierra. */
function scoreRound(state: GameState): void {
  const { results, roundPoints } = judgeMainAnswers(state);
  finishRound(state, results, roundPoints);
}

/** Congelamiento (3 min en escritura): juzga las respuestas principales
 *  AHORA, guarda los puntos congelados y abre la categoría bonus. ?v=8
 *  (A2): el bonus tiene 60 s de límite (BONUS_MS); si nadie oprime
 *  ¡BASTA!, tick() cierra la ronda solo con lo que haya escrito. */
function freezeRound(state: GameState, now: number): void {
  const { results, roundPoints } = judgeMainAnswers(state);
  state.results = results;
  state.frozenPoints = { ...roundPoints };
  state.roundPoints = { ...roundPoints };
  const idx = (state.round - 1) % BONUS_ROTATION.length;
  state.bonusCategory = BONUS_ROTATION[idx];
  state.phase = "bonus";
  state.deadline = now + BONUS_MS;
}

/** Puntúa la palabra bonus y cierra la ronda (congelado + bonus). */
function scoreBonusRound(state: GameState): void {
  const bonusId = state.bonusCategory;
  if (!bonusId || !state.results || !state.frozenPoints) {
    // No debería pasar; si pasa, se cierra con lo congelado.
    scoreRound(state);
    return;
  }
  const judged: Record<string, JudgedAnswer> = {};
  for (const p of state.players) {
    const word = state.bonusAnswers[p.id] ?? "";
    const j = judgeBonus(word, bonusId);
    judged[p.id] = {
      category: bonusId,
      word: word.trim(),
      canonical: j.canonical,
      points: 0,
      valid: j.valid,
      reason: j.reason,
    };
  }
  const counts: Record<string, number> = {};
  for (const p of state.players) {
    const a = judged[p.id];
    if (a.valid && a.canonical) counts[a.canonical] = (counts[a.canonical] ?? 0) + 1;
  }
  const roundPoints: Record<string, number> = {};
  for (const p of state.players) {
    const a = judged[p.id];
    let bonusPts = POINTS_INVALID;
    if (a.valid && a.canonical) {
      if (counts[a.canonical] > 1) {
        bonusPts = POINTS_REPEATED;
        a.reason = "Repetida: 50 pts";
      } else {
        bonusPts = POINTS_UNIQUE;
        a.reason = "¡Única! 100 pts";
      }
    }
    a.points = bonusPts;
    const frozen = state.frozenPoints[p.id] ?? 0;
    const total = frozen + bonusPts;
    state.results[p.id].bonus = a;
    state.results[p.id].bonusPoints = bonusPts;
    state.results[p.id].roundPoints = total;
    roundPoints[p.id] = total;
  }
  finishRound(state, state.results, roundPoints);
}

// ---------------------------------------------------------------------------
// Acciones del jugador
// ---------------------------------------------------------------------------

function cleanAnswers(
  raw: unknown,
): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CATEGORY_IDS.includes(k as CategoryId)) continue;
    if (typeof v !== "string") return null;
    out[k] = v.trim().slice(0, 80);
  }
  return out;
}

/** Guarda el borrador de respuestas (se envía al escribir, para que el
 *  servidor siempre tenga lo último cuando alguien oprime ¡BASTA!). */
export function submitAnswers(
  state: GameState,
  playerId: string,
  rawAnswers: unknown,
): ActionResult {
  if (!playerById(state, playerId)) return fail("Jugador desconocido.");
  if (state.phase === "writing") {
    // Todos pueden escribir.
  } else if (state.phase === "grace") {
    if (playerId !== state.gracePlayer) {
      return fail("La ronda ya se cerró con ¡BASTA! Estás bloqueado.");
    }
  } else {
    return fail("Ahora no se puede escribir.");
  }
  const answers = cleanAnswers(rawAnswers);
  if (!answers) return fail("Respuestas inválidas.");
  state.answers[playerId] = { ...state.answers[playerId], ...answers };
  return ok();
}

/** Guarda el borrador de la palabra bonus. */
export function submitBonusAnswer(
  state: GameState,
  playerId: string,
  raw: unknown,
): ActionResult {
  if (state.phase !== "bonus") return fail("Ahora no toca la categoría bonus.");
  if (!playerById(state, playerId)) return fail("Jugador desconocido.");
  if (typeof raw !== "string") return fail("Palabra inválida.");
  state.bonusAnswers[playerId] = raw.trim().slice(0, 80);
  return ok();
}

/** ¿Puede este jugador oprimir ¡BASTA! ahora? (las 7 casillas llenas, o la
 *  palabra bonus llena en fase bonus). El cliente deshabilita el botón con
 *  la misma regla; el servidor la vuelve a comprobar. */
export function canBasta(state: GameState, playerId: string): boolean {
  if (state.phase === "bonus") {
    return (state.bonusAnswers[playerId] ?? "").trim().length > 0;
  }
  if (state.phase === "writing") return allFilled(state, playerId);
  if (state.phase === "grace") {
    return playerId === state.gracePlayer && allFilled(state, playerId);
  }
  return false;
}

function allFilled(state: GameState, playerId: string): boolean {
  const mine = state.answers[playerId] ?? {};
  return CATEGORY_IDS.every((c) => (mine[c] ?? "").trim().length > 0);
}

/**
 * ¡BASTA! — cierra la ronda.
 * - En escritura: el primero que lo oprime con las 7 llenas cierra para
 *   todos. Si el ganador de la ronda anterior NO es quien oprimió, ese
 *   ganador tiene 5 s de gracia para terminar (fase "grace"); los demás
 *   quedan bloqueados de inmediato.
 * - En gracia: solo el jugador con gracia puede oprimirlo (para terminar
 *   antes de los 5 s); al hacerlo se puntúa.
 * - En bonus: el primero con palabra bonus llena cierra la ronda.
 * `answers` / `bonusAnswer` opcionales: el cliente manda lo último que
 * escribió junto con el ¡BASTA! para no perder ni una letra.
 */
export function submitBasta(
  state: GameState,
  playerId: string,
  opts: { answers?: unknown; bonusAnswer?: unknown; now?: number } = {},
): ActionResult {
  if (!playerById(state, playerId)) return fail("Jugador desconocido.");
  const now = opts.now ?? Date.now();

  if (state.phase === "bonus") {
    if (opts.bonusAnswer !== undefined) {
      const r = submitBonusAnswer(state, playerId, opts.bonusAnswer);
      if (!r.ok) return r;
    }
    if (!canBasta(state, playerId)) {
      return fail("Escribe primero la palabra bonus.");
    }
    state.bastaBy = playerId;
    scoreBonusRound(state);
    return ok();
  }

  if (state.phase === "grace") {
    if (playerId !== state.gracePlayer) {
      return fail("La ronda ya se cerró con ¡BASTA! Estás bloqueado.");
    }
    if (opts.answers !== undefined) {
      const r = submitAnswers(state, playerId, opts.answers);
      if (!r.ok) return r;
    }
    if (!canBasta(state, playerId)) {
      return fail("Te faltan casillas por llenar.");
    }
    scoreRound(state);
    return ok();
  }

  if (state.phase !== "writing") return fail("Ahora no se puede cantar ¡BASTA!");
  if (opts.answers !== undefined) {
    const r = submitAnswers(state, playerId, opts.answers);
    if (!r.ok) return r;
  }
  if (!allFilled(state, playerId)) {
    return fail("Te faltan casillas por llenar.");
  }
  state.bastaBy = playerId;
  if (state.prevRoundWinner && state.prevRoundWinner !== playerId) {
    // Gracia de 5 s para el ganador de la ronda anterior.
    state.gracePlayer = state.prevRoundWinner;
    state.phase = "grace";
    state.deadline = now + GRACE_MS;
    return ok();
  }
  scoreRound(state);
  return ok();
}

/** Avanzar: de fin de ronda a la siguiente ruleta (o al podio final). */
export function advance(
  state: GameState,
  opts: StartOptions = {},
): ActionResult {
  if (state.phase !== "roundEnd") return fail("No hay nada que avanzar en esta fase.");
  const rng = opts.rng ?? defaultRng;
  const now = opts.now ?? Date.now();
  if (state.round < state.totalRounds) {
    state.round += 1;
    beginRound(state, now, rng);
    return ok();
  }
  state.phase = "gameOver";
  state.deadline = null;
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  state.winner = sorted[0]?.id ?? null;
  state.podium = sorted.map((p) => p.id);
  return ok();
}

/** Revancha: nueva partida en la misma sala. NO pasa por "ready": arranca
 *  directo en la ruleta de la ronda 1 (ya están todos dentro y listos). */
export function rematch(state: GameState, opts: StartOptions = {}): ActionResult {
  if (state.phase !== "gameOver") return fail("La partida aún no termina.");
  const rng = opts.rng ?? defaultRng;
  const now = opts.now ?? Date.now();
  for (const p of state.players) {
    p.score = 0;
    p.ready = false;
  }
  state.round = 1;
  state.usedLetters = [];
  state.prevRoundWinner = null;
  state.winner = null;
  state.podium = [];
  state.letter = null;
  beginRound(state, now, rng);
  return ok();
}

// ---------------------------------------------------------------------------
// Temporizadores (el servidor los hace cumplir)
// ---------------------------------------------------------------------------

/**
 * Aplica lo que toque si se agotó la fecha límite de la fase actual.
 * Devuelve true si el estado cambió.
 */
export function tick(
  state: GameState,
  now: number = Date.now(),
  rng: Rng = defaultRng,
): boolean {
  // ?v=8 (A1): purga de desconectados. Solo entre rondas (lobby, ready,
  // roundEnd, gameOver): en plena ronda el jugador puede estar
  // reconectando y su asiento y sus respuestas se conservan; las puertas
  // ya no lo esperan de todos modos (solo cuentan conectados).
  let changed = false;
  if (["lobby", "ready", "roundEnd", "gameOver"].includes(state.phase)) {
    const before = state.players.length;
    state.players = state.players.filter(
      (p) => p.disconnectedAt === null || now - p.disconnectedAt <= DISCONNECT_PURGE_MS,
    );
    if (state.players.length !== before) changed = true;
  }
  if (state.deadline === null || now < state.deadline) return changed;
  switch (state.phase) {
    case "roulette": {
      state.phase = "countdown";
      state.deadline = now + COUNTDOWN_MS;
      return true;
    }
    case "countdown": {
      state.phase = "writing";
      state.deadline = now + FREEZE_MS;
      return true;
    }
    case "writing": {
      freezeRound(state, now);
      return true;
    }
    case "grace": {
      // Se acabó la gracia: se puntúa con lo que cada quien tenga escrito.
      scoreRound(state);
      return true;
    }
    case "bonus": {
      // ?v=8 (A2): se acabaron los 60 s del bonus sin ¡BASTA!: se cierra
      // la ronda con lo congelado + lo que cada quien haya escrito.
      scoreBonusRound(state);
      return true;
    }
    default:
      return changed;
  }
}

// ---------------------------------------------------------------------------
// Estado público (lo único que se envía al cliente)
// ---------------------------------------------------------------------------

/**
 * Snapshot autoritativo para el cliente, filtrado para `viewerId`.
 * - Las respuestas (borradores) de OTROS jugadores NUNCA se envían durante
 *   escritura, gracia ni bonus: solo se manda lo que escribió CADA QUIEN
 *   (`myAnswers` / `myBonus`) y cuántas casillas lleva cada uno (`progress`,
 *   solo el conteo, sin palabras).
 * - En `roundEnd` y `gameOver` sí se revelan todas las respuestas ya
 *   juzgadas (con puntos y motivo), porque la ronda ya se cerró.
 */
export function publicState(state: GameState, viewerId?: string): Record<string, unknown> {
  const progress: Record<string, number> = {};
  for (const p of state.players) {
    if (state.phase === "bonus") {
      progress[p.id] = (state.bonusAnswers[p.id] ?? "").trim() ? 1 : 0;
    } else {
      const mine = state.answers[p.id] ?? {};
      progress[p.id] = CATEGORY_IDS.filter((c) => (mine[c] ?? "").trim()).length;
    }
  }
  const showResults = state.phase === "roundEnd" || state.phase === "gameOver";
  return {
    code: state.code,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      ready: p.ready,
      continued: p.continued,
      connected: p.disconnectedAt === null,
    })),
    totalRounds: state.totalRounds,
    round: state.round,
    letter: state.letter,
    usedLetters: [...state.usedLetters],
    categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    bonusCategories: BONUS_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    bonusCategory: state.bonusCategory,
    myAnswers: viewerId ? { ...(state.answers[viewerId] ?? {}) } : {},
    myBonus: viewerId ? (state.bonusAnswers[viewerId] ?? "") : "",
    progress,
    bastaBy: state.bastaBy,
    gracePlayer: state.gracePlayer,
    prevRoundWinner: state.prevRoundWinner,
    roundWinner: state.roundWinner,
    roundPoints: { ...state.roundPoints },
    frozenPoints: state.frozenPoints ? { ...state.frozenPoints } : null,
    results: showResults ? state.results : null,
    winner: state.winner,
    podium: [...state.podium],
    deadline: state.deadline,
  };
}
