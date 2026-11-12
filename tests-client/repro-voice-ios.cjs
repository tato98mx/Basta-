// Reproducción del fallo de voz de Basta en un iPhone (Safari/WebKit).
//
// Juega una partida REAL de 3 rondas contra el Worker desplegado con 2
// clientes WebSocket (Tato y Ledya) y alimenta cada estado del servidor
// al app.js REAL (cargado en VM) con un stub de speechSynthesis que
// imita el comportamiento documentado de iOS:
//
//   * getVoices() vacío hasta que llega `voiceschanged`.
//   * speak() fuera de un gesto del usuario se descarta EN SILENCIO
//     (sin evento ni error) hasta que el primer speak() corre dentro
//     de un tap.
//
// El script simula los gestos reales de Tato (toques para crear la sala
// y oprimir "¡Listo a jugar!") y comprueba qué anuncios llegaron a
// sonar de verdad (delivered) y cuáles se descartaron (dropped).
//
// Uso:
//   node tests-client/repro-voice-ios.cjs [ruta-a-app.js]
//   (por defecto usa ../app.js; para verificar el código DESPLEGADO,
//   descarga antes https://tato98mx.github.io/Basta-/app.js?v=N a /tmp
//   y pasa esa ruta.)
// Salida 0 si sonaron la letra, la cuenta atrás, el anuncio de fin de
// ronda (ganador + puntos + lugares) y el anuncio final; 1 si falta
// alguno (el fallo que reportó Tato).
const path = require("node:path");
const { loadApp } = require("./load-app.cjs");
const { makeIOSSPEECH } = require("./ios-speech-stub.cjs");

const dict = require("../worker/src/dictionary.json");

const BASE = "https://basta.ydfz296yrr.workers.dev";
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

class Client {
  constructor(name, onState) {
    this.name = name;
    this.onState = onState;
    this.lastState = null;
  }
  async connect(code) {
    this.ws = new WebSocket(`${BASE.replace("http", "ws")}/room/${code}/ws?name=${encodeURIComponent(this.name)}`);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        this.lastState = msg.state;
        if (this.onState) this.onState(msg.state);
      }
    };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.send({ type: "join", name: this.name });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  async waitFor(pred, label, timeoutMs = 40000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.lastState && pred(this.lastState)) return this.lastState;
      try { this.send({ type: "ping" }); } catch (e) {}
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`timeout esperando: ${label} (fase actual: ${this.lastState?.phase})`);
  }
}

async function main() {
  const appPath = path.resolve(process.argv[2] || path.join(__dirname, "..", "app.js"));
  // Cargar app.js con el stub de voz iOS (voces llegan a los 800 ms).
  const ios = makeIOSSPEECH({ voicesDelayMs: 800 });
  ios.armVoices();
  const app = loadApp("", { apiUrl: BASE, speech: ios, appPath });
  const BASTA = app.__BASTA__;
  const tap = () => {
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
  };

  console.log("== Reproducción voz iOS: app.js =", appPath);
  console.log("   (tap inicial en la página, como hace Tato al abrir el juego)");
  tap(); // toque al abrir la página (en el código viejo solo desbloquea AudioContext)

  // Crear sala de 3 rondas (las únicas opciones válidas: 3/5/7/10) y
  // conectar a los 2 jugadores.
  const roomRes = await fetch(`${BASE}/api/room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ totalRounds: 3 }),
  });
  const { code: roomCode } = await roomRes.json();
  console.log("   sala creada:", roomCode);

  const tato = new Client("Tato", (s) => { console.log(`   [estado] fase=${s.phase} ronda=${s.round} letra=${s.letter}`); try { BASTA.renderState(s); } catch (e) { console.log("render error:", e.message); } });
  const ledya = new Client("Ledya", null);
  await tato.connect(roomCode);
  await ledya.connect(roomCode);
  await tato.waitFor((x) => x.phase === "ready", "fase ready");
  console.log("   listos: Tato oprime '¡Listo a jugar!' (tap)");
  tap();
  tato.send({ type: "ready" });
  await new Promise((r) => setTimeout(r, 500));
  ledya.send({ type: "ready" });

  let s;
  for (let round = 1; round <= 3; round++) {
    s = await tato.waitFor((x) => x.phase === "writing" && x.round === round, `escritura ronda ${round}`);
    console.log(`   ronda ${round}, letra ${s.letter}: escribiendo…`);
    const wT = wordsFor(s.letter, 0);
    const wL = wordsFor(s.letter, 1);
    tato.send({ type: "answers", answers: wT });
    ledya.send({ type: "answers", answers: wL });
    await new Promise((r) => setTimeout(r, 500));
    tato.send({ type: "basta", answers: wT });
    s = await tato.waitFor((x) => x.phase === "roundEnd" && x.round === round, `fin ronda ${round}`);
    console.log(`   fin ronda ${round}: ganador ${s.roundWinner}, puntos`, JSON.stringify(s.roundPoints));
    console.log(`   anuncio construido: "${BASTA.buildRoundEndAnnouncement(s)}"`);
    // Dar tiempo a la cola de voz / watchdogs.
    await new Promise((r) => setTimeout(r, 4000));
    if (round < 3) tato.send({ type: "next" });
  }
  tato.send({ type: "next" });
  s = await tato.waitFor((x) => x.phase === "gameOver", "podio final");
  console.log(`   podio final: ${s.podium.join(" > ")} — ganador ${s.winner}`);
  await new Promise((r) => setTimeout(r, 4000));

  console.log("\n== Resultado de voz (stub iOS) ==");
  console.log("   SONARON (delivered):");
  for (const t of ios.delivered) console.log("     🔊 " + t);
  if (!ios.delivered.length) console.log("     (ninguno)");
  console.log("   DESCARTADOS EN SILENCIO (dropped):");
  for (const t of ios.dropped) console.log("     🔇 " + t);
  if (!ios.dropped.length) console.log("     (ninguno)");

  const joined = ios.delivered.join(" | ");
  const checks = [
    ["dice la letra al inicio", /¡La letra es [A-Z]!/.test(joined)],
    ["dice la cuenta atrás", /Tres/.test(joined) && /Dos/.test(joined) && /Uno/.test(joined)],
    ["dice ganador de ronda con puntos", /El ganador de la ronda es Tato, con 700 puntos/.test(joined)],
    ["dice el 2º lugar con puntos", /En segundo lugar, Ledya, con 700 puntos/.test(joined)],
    ["dice el ganador final", /El ganador del juego es Tato, con 2100 puntos/.test(joined)],
  ];
  let fail = 0;
  for (const [label, ok] of checks) {
    console.log(`   ${ok ? "✓" : "✗ FAIL"} ${label}`);
    if (!ok) fail++;
  }
  tato.ws.close();
  ledya.ws.close();
  console.log(fail === 0 ? "\n✅ VOZ OK: todos los anuncios sonaron" : `\n❌ VOZ ROTA: faltan ${fail} anuncios (como reportó Tato)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(2); });
