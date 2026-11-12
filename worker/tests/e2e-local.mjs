/**
 * E2E local de Basta contra `wrangler dev --local`.
 *
 * Uso:
 *   1) En una terminal:  cd worker && npm run dev   (puerto 8787)
 *   2) En otra terminal: node worker/tests/e2e-local.mjs
 *
 * Simula dos jugadores (Tato y Ledya) jugando una partida completa de
 * 3 rondas por WebSocket: lobby → ready (con espera hasta que TODOS estén
 * listos) → ruleta → cuenta 3-2-1 → escritura → ¡BASTA! → gracia de 5 s
 * para el ganador anterior → fin de ronda → podio → revancha sin ready.
 * Verifica que los dos clientes reciban el mismo estado, que el servidor
 * nunca filtre las respuestas del otro mientras se escribe, que el texto
 * del anuncio de fin de ronda se construya con los nombres y puntos reales
 * del estado del servidor (builder real de app.js, cargado en VM), y la
 * reconexión con el mismo nombre.
 *
 * Usa el diccionario local SOLO para saber qué palabras son válidas para
 * la letra de cada ronda (el cliente real no conoce el diccionario).
 */

import { createRequire } from "node:module";
import dict from "../src/dictionary.json" with { type: "json" };

const require = createRequire(import.meta.url);
const { loadApp } = require("../../tests-client/load-app.cjs");

const BASE = "http://127.0.0.1:8787";
const CATEGORIES = [
  "nombre", "apellido", "ciudad", "animal", "fruta",
  "comida", "cosa",
];

function wordsFor(letter, idx = 0) {
  const out = {};
  for (const cat of CATEGORIES) {
    const arr = dict.categories[cat][letter.toLowerCase()];
    out[cat] = arr[Math.min(idx, arr.length - 1)];
  }
  return out;
}

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) failures++;
}

class Client {
  constructor(name) {
    this.name = name;
    this.lastState = null;
    this.states = 0;
    this.errors = [];
  }
  async connect(code) {
    this.ws = new WebSocket(`${BASE.replace("http", "ws")}/room/${code}/ws?name=${encodeURIComponent(this.name)}`);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        this.lastState = msg.state;
        this.states++;
      } else if (msg.type === "error") {
        this.errors.push(msg.message);
      }
    };
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.send({ type: "join", name: this.name });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  async waitFor(pred, label, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.lastState && pred(this.lastState)) return this.lastState;
      // Ping periódico: fuerza al servidor a aplicar sus temporizadores.
      try { this.send({ type: "ping" }); } catch { /* socket cerrado */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`timeout esperando: ${label} (fase actual: ${this.lastState?.phase})`);
  }
}

function sameState(a, b) {
  // Los estados son personales: cada jugador ve SOLO sus respuestas
  // (myAnswers/myBonus). Para comparar, se quitan esos dos campos.
  const strip = (s) => {
    const c = { ...s };
    delete c.myAnswers;
    delete c.myBonus;
    return JSON.stringify(c);
  };
  return strip(a) === strip(b);
}

// --- Cargar app.js en VM para probar el builder de anuncios con estados reales ---
const app = loadApp();
const BASTA = app.__BASTA__;
check(!!BASTA, "app.js cargado en VM (window.__BASTA__ disponible)");

// --- Crear sala de 3 rondas ---
const roomRes = await fetch(`${BASE}/api/room`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ totalRounds: 3 }),
});
const { code } = await roomRes.json();
check(/^[A-Z]{4}$/.test(code), `sala creada con código ${code} (3 rondas)`);

const tato = new Client("Tato");
const ledya = new Client("Ledya");
await tato.connect(code);
await ledya.connect(code);

// ============ LOBBY → READY: no arranca hasta que TODOS estén listos ============
let s = await tato.waitFor((x) => x.phase === "ready", "fase ready al entrar el 2º jugador");
check(s.players.length === 2, "2 jugadores en la sala");
check(s.totalRounds === 3, "la sala es de 3 rondas");
tato.send({ type: "ready" });
await new Promise((r) => setTimeout(r, 800));
check(tato.lastState.phase === "ready", "con solo Tato listo, el juego NO arranca");
ledya.send({ type: "ready" });
s = await tato.waitFor((x) => x.phase === "roulette", "ruleta tras los 2 listos");
check(s.round === 1 && /^[A-Z]$/.test(s.letter), `ruleta ronda 1, letra ${s.letter}`);

// ============ RONDA 1: ruleta → cuenta → escritura → ¡BASTA! de Tato ============
s = await tato.waitFor((x) => x.phase === "writing", "escritura ronda 1", 30000);
console.log(`\nRonda 1, letra ${s.letter}: escribiendo…`);
const w1t = wordsFor(s.letter, 0);
const w1l = wordsFor(s.letter, 1);
tato.send({ type: "answers", answers: w1t });
ledya.send({ type: "answers", answers: w1l });
await new Promise((r) => setTimeout(r, 500));
// Privacidad: Tato no debe ver las palabras de Ledya (ni viceversa).
check(
  !JSON.stringify(tato.lastState).includes(w1l.nombre),
  "Tato no ve la respuesta de Ledya mientras se escribe",
);
check(
  tato.lastState.myAnswers.nombre === w1t.nombre,
  "Tato sí ve sus propias respuestas",
);
check(tato.lastState.progress.p1 === 7, "progreso de Tato: 7/7");
tato.send({ type: "basta", answers: w1t });
s = await tato.waitFor((x) => x.phase === "roundEnd", "fin ronda 1");
check(s.bastaBy === "p1", "¡BASTA! lo cantó Tato");
check(s.roundPoints.p1 === 700 && s.roundPoints.p2 === 700, `puntos ronda 1: Tato ${s.roundPoints.p1}, Ledya ${s.roundPoints.p2} (700 = 7 únicas)`);
check(s.roundWinner === "p1", "Tato gana la ronda 1 (empate, desempate: cantó ¡BASTA!)");
check(sameState(tato.lastState, ledya.lastState), "los dos clientes ven el mismo estado");

// --- Anuncio de fin de ronda con el estado REAL del servidor ---
{
  const text = BASTA.buildRoundEndAnnouncement(s);
  console.log(`  Anuncio de voz ronda 1: "${text}"`);
  const winnerName = s.players.find((p) => p.id === s.roundWinner).name;
  check(text.includes(`El ganador de la ronda es ${winnerName}, con 700 puntos.`), "el anuncio nombra al ganador con sus puntos DE LA RONDA (700)");
  check(text.includes("En segundo lugar, Ledya, con 700 puntos."), "el anuncio nombra el 2º lugar con su TOTAL acumulado (700)");
  check(!text.includes("tercer"), "con 2 jugadores el anuncio NO menciona tercer lugar");
}
tato.send({ type: "continue" });
await new Promise((r) => setTimeout(r, 800));
check(tato.lastState.phase === "roundEnd", "con solo Tato en Continuar, la ronda NO avanza");
// La puerta muestra quién ya tocó y quién falta.
check(
  tato.lastState.players.find((p) => p.id === "p1").continued === true
  && tato.lastState.players.find((p) => p.id === "p2").continued === false,
  "el estado muestra: Tato ya tocó Continuar, Ledya falta",
);
ledya.send({ type: "continue" });

// ============ RONDA 2: Ledya canta ¡BASTA! → gracia de 5 s para Tato ============
s = await tato.waitFor((x) => x.phase === "writing" && x.round === 2, "escritura ronda 2");
console.log(`\nRonda 2, letra ${s.letter}: Ledya canta ¡BASTA! primero…`);
const w2t = wordsFor(s.letter, 0);
const w2l = wordsFor(s.letter, 1);
tato.send({ type: "answers", answers: w2t });
ledya.send({ type: "answers", answers: w2l });
await new Promise((r) => setTimeout(r, 500));
ledya.send({ type: "basta", answers: w2l });
s = await tato.waitFor((x) => x.phase === "grace", "fase de gracia");
check(s.gracePlayer === "p1", "la gracia es para Tato (ganador de la ronda anterior)");
check(s.bastaBy === "p2", "¡BASTA! lo cantó Ledya");
// Ledya queda bloqueada durante la gracia; Tato termina con su ¡BASTA!
tato.send({ type: "basta", answers: w2t });
s = await tato.waitFor((x) => x.phase === "roundEnd", "fin ronda 2");
check(s.roundWinner === "p2", "Ledya gana la ronda 2 (empate 700-700, desempate: cantó ¡BASTA!)");
check(s.roundPoints.p1 === 700 && s.roundPoints.p2 === 700, "puntos ronda 2: 700-700");
{
  const text = BASTA.buildRoundEndAnnouncement(s);
  console.log(`  Anuncio de voz ronda 2: "${text}"`);
  check(text.includes("El ganador de la ronda es Ledya, con 700 puntos."), "anuncio ronda 2: ganadora Ledya, 700 pts de ronda");
  check(text.includes("En segundo lugar, Tato, con 1400 puntos."), "anuncio ronda 2: 2º Tato con TOTAL acumulado 1400");
}
// Puerta de Continuar: con solo Tato no avanza; con los 2, sí.
tato.send({ type: "continue" });
await new Promise((r) => setTimeout(r, 800));
check(tato.lastState.phase === "roundEnd", "ronda 2: con solo Tato en Continuar, no avanza");
ledya.send({ type: "continue" });

// ============ RONDA 3: Tato canta ¡BASTA! → podio ============
s = await tato.waitFor((x) => x.phase === "writing" && x.round === 3, "escritura ronda 3");
console.log(`\nRonda 3, letra ${s.letter}: Tato canta ¡BASTA!…`);
const w3t = wordsFor(s.letter, 0);
const w3l = wordsFor(s.letter, 1);
tato.send({ type: "answers", answers: w3t });
ledya.send({ type: "answers", answers: w3l });
await new Promise((r) => setTimeout(r, 500));
tato.send({ type: "basta", answers: w3t });
s = await tato.waitFor((x) => x.phase === "roundEnd", "fin ronda 3");
check(s.roundPoints.p1 === 700, "puntos ronda 3: Tato 700");
// Última ronda: la puerta de Continuar también aplica para ver el podio.
tato.send({ type: "continue" });
ledya.send({ type: "continue" });
s = await tato.waitFor((x) => x.phase === "gameOver", "podio final");
console.log(`\nPodio: ${s.podium.map((id) => s.players.find((p) => p.id === id).name).join(" > ")}`);
check(s.winner === "p1", "ganador del juego: Tato (2100-2100, primero en orden)");
check(s.podium.length === 2, "podio con los 2 jugadores");
check(s.players.every((p) => p.score === 2100), "marcador final: 2100-2100");
{
  const text = BASTA.buildGameOverAnnouncement(s);
  console.log(`  Anuncio de voz final: "${text}"`);
  check(text.includes("¡El ganador del juego es Tato, con 2100 puntos!"), "anuncio final: ganador Tato con su total 2100");
  check(text.includes("En segundo lugar, Ledya, con 2100 puntos."), "anuncio final: 2º Ledya con 2100");
}

// GET /api/room debe devolver el mismo estado
const getRes = await fetch(`${BASE}/api/room/${code}`);
const getState = await getRes.json();
check(getState.phase === "gameOver" && getState.code === code, "GET /api/room devuelve el estado actual");

// ============ REVANCHA SIN READY + RECONEXIÓN ============
tato.send({ type: "rematch" });
s = await tato.waitFor((x) => x.phase === "roulette" && x.round === 1, "revancha: ruleta directa");
check(s.players.every((p) => p.score === 0), "marcador reiniciado en la revancha");
check(s.usedLetters.length === 1, "letras usadas reseteadas (1 letra nueva)");
console.log("\nReconexión: Tato cierra su socket y vuelve con el mismo nombre…");
tato.ws.close();
await new Promise((r) => setTimeout(r, 300));
await tato.connect(code);
s = await tato.waitFor((x) => x.phase === "roulette" && x.round === 1, "reconexión: estado actual directo al reentrar");
check(s.players.length === 2, "al reconectar sigue habiendo 2 jugadores (mismo nombre = mismo jugador)");

console.log(`\nEstados recibidos: Tato ${tato.states}, Ledya ${ledya.states}`);
console.log(`Errores del servidor: Tato [${tato.errors.join("; ")}] Ledya [${ledya.errors.join("; ")}]`);
console.log(failures === 0 ? "\n✅ E2E COMPLETO: sin fallos" : `\n❌ E2E con ${failures} fallos`);
tato.ws.close();
ledya.ws.close();
process.exit(failures === 0 ? 0 : 1);
