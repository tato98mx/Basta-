/* ¡Basta! — cliente (frontend estático, sin frameworks).
 *
 * REGLA DE ORO: el cliente NUNCA calcula puntos ni transiciones.
 * Solo muestra el estado autoritativo que envía el servidor ({type:"state"})
 * y envía las acciones del jugador por WebSocket. El servidor decide todo.
 *
 * Protocolo (SPEC.md §4):
 *   cliente -> servidor: join, ready, answers, bonus, basta, next,
 *     rematch, ping
 *   servidor -> cliente: {type:"state", state} | {type:"error", message}
 *
 * ANUNCIOS DE VOZ (español, como show):
 * - Al arrancar cada ronda: "¡Ronda N!" + "¡La letra es X!" + cuenta 3-2-1.
 * - Al terminar cada ronda: ganador de la ronda (puntos DE ESA RONDA) y
 *   2º/3º por TOTAL acumulado del marcador. El texto se construye en el
 *   cliente con buildRoundEndAnnouncement(state) a partir del estado del
 *   servidor; nunca se inventa. (Ver SPEC.md §6 y tests-client.)
 * - Al final de la partida: ganador final EN GRANDE + fuegos artificiales
 *   visuales (canvas) y de sonido (Web Audio).
 * - Voz: Web Speech API, lang es-MX, con fallback a tonos si no hay voz en
 *   español. Música bajita (2/5) y voz/efectos fuertes (5/5): al hablar, la
 *   música se baja momentáneamente (ducking) y se restaura después.
 */

"use strict";

/* ------------------------------------------------------------------ */
/* Constantes ajustables                                               */
/* ------------------------------------------------------------------ */

var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
var ROULETTE_MS = 4000; // ruleta de la letra: ~4 s (lo decide el servidor)
var FREEZE_MS = 180000; // 3 min hasta congelar (lo decide el servidor)
var GRACE_MS = 5000; // gracia del ganador anterior

var LS_NAME = "basta-name";
var LS_MUTED = "basta-muted";
var LS_ROUNDS = "basta-rounds";

/* Volúmenes en escala de 1 a 5 (como pidió Tato): música 2/5, efectos 5/5. */
var MUSIC_LEVEL = 2 / 5; // 0.4
var SFX_LEVEL = 5 / 5; // 1.0
var DUCKED_MUSIC_LEVEL = 0.05; // música mientras habla la voz

/* ------------------------------------------------------------------ */
/* Estado local (nada de esto es autoridad: todo viene del servidor)   */
/* ------------------------------------------------------------------ */

var ws = null;
var myName = "";
var myId = null;
var roomCode = "";
var currentState = null;
var connected = false;
var demoMode = false;
var demoIndex = 0;

var reconnectAttempts = 0;
var reconnectTimer = null;
var toastTimer = null;
var draft = {}; // mis respuestas de la ronda (se sincronizan con el servidor)
var draftBonus = "";
var answersTimer = null;
var uiTimer = null;
var rouletteTimer = null;
var rouletteKey = "";
var rouletteStopped = false;
var spokenRoundKey = "";
var spokenCountdownKey = "";
var spokenRoundEndKey = "";
var spokenGameOverKey = "";
var writingKey = "";
var muted = false;
try { muted = localStorage.getItem(LS_MUTED) === "1"; } catch (e) {}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function apiBase() {
  var u = (window.GAME_API_URL || "").trim();
  return u ? u.replace(/\/+$/, "") : "";
}

function wsBase() {
  var base = apiBase();
  if (!base) return "";
  if (/^wss?:\/\//i.test(base)) return base;
  return base.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

function playerById(state, id) {
  if (!state || !state.players) return null;
  for (var i = 0; i < state.players.length; i++) {
    if (state.players[i].id === id) return state.players[i];
  }
  return null;
}

function me(state) { return myId ? playerById(state, myId) : null; }

function identifyMe(state) {
  if (!state) return;
  if (state.myId) { myId = state.myId; return; }
  if (state.you) { myId = state.you; return; }
  if (!myId && myName && state.players) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].name === myName) { myId = state.players[i].id; return; }
    }
  }
}

function ptsWord(n) { return n === 1 ? "1 punto" : n + " puntos"; }

/* ------------------------------------------------------------------ */
/* Sonido: música (2/5), efectos (5/5), voz en español con ducking    */
/* ------------------------------------------------------------------ */

var audioCtx = null;
var musicGain = null;
var sfxGain = null;
var musicTimer = null;
var musicStep = 0;
var speechActive = 0;
var spanishVoice = null;

/* Melodía alegre en bucle (notas en Hz, estilo show). */
var MELODY = [523, 659, 784, 659, 880, 784, 659, 523, 587, 659, 784, 880, 784, 659, 587, 523];

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume().catch(function () {});
    return;
  }
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = muted ? 0 : MUSIC_LEVEL;
    musicGain.connect(audioCtx.destination);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = muted ? 0 : SFX_LEVEL;
    sfxGain.connect(audioCtx.destination);
  } catch (e) { audioCtx = null; }
}

function startMusic() {
  ensureAudio();
  if (!audioCtx || musicTimer) return;
  musicTimer = setInterval(function () {
    if (muted || !audioCtx) return;
    var freq = MELODY[musicStep % MELODY.length];
    musicStep++;
    playNote(freq, 0.42, "triangle", 0.5, musicGain);
  }, 450);
}

function playNote(freq, dur, type, vol, dest) {
  if (!audioCtx || !dest) return;
  try {
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(g); g.connect(dest);
    osc.start(); osc.stop(audioCtx.currentTime + dur + 0.05);
  } catch (e) {}
}

function playNoiseBurst(dur, filterFreq, vol) {
  if (!audioCtx || !sfxGain) return;
  try {
    var len = Math.floor(audioCtx.sampleRate * dur);
    var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    var filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = filterFreq; filter.Q.value = 0.8;
    var g = audioCtx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(sfxGain);
    src.start();
  } catch (e) {}
}

/** Aplausos: ráfagas de ruido como palmas (Web Audio, sin archivos). */
function playApplause() {
  ensureAudio();
  if (!audioCtx || muted) return;
  for (var i = 0; i < 14; i++) {
    (function (k) {
      setTimeout(function () {
        playNoiseBurst(0.09, 900 + Math.random() * 1200, 0.5 + Math.random() * 0.4);
      }, k * 90 + Math.random() * 60);
    })(i);
  }
}

/** Fanfarria de ¡BASTA! + aplausos. */
function playBastaFanfare() {
  ensureAudio();
  if (!audioCtx || muted) return;
  var notes = [523, 659, 784, 1047];
  notes.forEach(function (f, i) {
    setTimeout(function () { playNote(f, 0.35, "square", 0.35, sfxGain); }, i * 110);
  });
  setTimeout(playApplause, 450);
}

/** Fuegos artificiales: estallidos (ruido + grave que cae). */
function playFireworksSound() {
  ensureAudio();
  if (!audioCtx || muted) return;
  for (var i = 0; i < 6; i++) {
    (function (k) {
      setTimeout(function () {
        playNoiseBurst(0.7, 400 + Math.random() * 900, 0.9);
        try {
          var osc = audioCtx.createOscillator();
          var g = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(160, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(38, audioCtx.currentTime + 0.6);
          g.gain.setValueAtTime(0.7, audioCtx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.65);
          osc.connect(g); g.connect(sfxGain);
          osc.start(); osc.stop(audioCtx.currentTime + 0.7);
        } catch (e) {}
      }, k * 420);
    })(i);
  }
}

function playBeep(final) {
  ensureAudio();
  if (!audioCtx || muted) return;
  playNote(final ? 1320 : 880, final ? 0.5 : 0.18, "square", 0.4, sfxGain);
}

/* --- Ducking: mientras habla la voz, la música baja y luego vuelve. --- */

function duckMusic(on) {
  if (!audioCtx || !musicGain) return;
  try {
    var target = muted ? 0 : (on ? DUCKED_MUSIC_LEVEL : MUSIC_LEVEL);
    musicGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.15);
  } catch (e) {}
}

function pickSpanishVoice() {
  try {
    if (!("speechSynthesis" in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    var es = voices.filter(function (v) { return (v.lang || "").toLowerCase().indexOf("es") === 0; });
    if (!es.length) return null;
    var mx = es.filter(function (v) { return (v.lang || "").toLowerCase().indexOf("es-mx") === 0; });
    if (mx.length) return mx[0];
    var esEs = es.filter(function (v) { return (v.lang || "").toLowerCase().indexOf("es-es") === 0; });
    if (esEs.length) return esEs[0];
    return es[0];
  } catch (e) { return null; }
}

/* --- Desbloqueo y cola de voz (clave en iOS/Safari) -------------------- */
/*
 * CAUSA RAÍZ DEL FALLO DE VOZ (revisión ?v=3, 2026-11-11):
 *
 * 1) CACHÉ (causa principal, con evidencia de línea de tiempo): la
 *    partida en la que Tato reportó "no sale la voz" (sala HFTY,
 *    06:58–07:01 UTC) empezó ~5 minutos después de publicarse ?v=2
 *    (commit 8712b70c, 06:52 UTC) en una pestaña de Safari abierta
 *    desde ~06:31 con ?v=1, sin recarga forzada. GitHub Pages sirve
 *    index.html con max-age=600 y sin service worker, así que esa
 *    pestaña vieja siguió sirviendo ?v=1, que NO tiene unlockVoice ni
 *    "Probar voz". Por eso no sonó NADA: ni la letra, ni el podio.
 *    Remedio: ?v=3 + version.json con chequeo de versión en vivo y
 *    banner "Hay una versión nueva — Actualizar ahora" (recarga).
 *
 * 2) DEFECTOS DE DISEÑO DE ?v=2 (que hacían el fallo silencioso e
 *    irrecuperable, y que ?v=3 corrige aunque la caché no fuera la
 *    causa):
 *    a. unlockVoice() ponía voiceUnlocked = true INCONDICIONALMENTE
 *       tras speak(), sin verificar que el utterance arrancara
 *       (onstart). Si WebKit descartaba el utterance silencioso, la
 *       app creía estar desbloqueada y los anuncios se perdían.
 *    b. Ningún cancel()/resume() de recuperación: si el primer
 *       utterance quedaba colgado (speaking atorado), bloqueaba la
 *       cola para siempre (WebKit encola en FIFO).
 *    c. El desbloqueo era solo silencioso (volumen 0): si WebKit no
 *       cuenta un utterance silencioso como gesto válido, el
 *       desbloqueo nunca ocurre. ?v=3 lo intenta silencioso primero
 *       y, si no arranca, lo reintenta AUDIBLE ("¡Hola!") en el
 *       siguiente gesto.
 *    d. "Probar voz" no daba feedback: si la voz fallaba, el usuario
 *       no veía nada. ?v=3 muestra éxito/fallo en pantalla.
 *
 * REGLAS DEL NUEVO DISEÑO (?v=3):
 *  - voiceUnlocked solo se pone en true cuando un utterance de
 *    desbloqueo dispara onstart/onend (verificado). Antes de eso,
 *    los anuncios se quedan en cola y se dicen tras el próximo gesto.
 *  - Antes de cada speak(): resume() + limpieza de cola atorada
 *    (cancel() solo si speaking lleva > 2.5 s sin actividad).
 *  - Watchdog de 1.5 s: sin onstart se limpia la cola atorada y se
 *    reencola (hasta 2 reintentos); el texto nunca se pierde en
 *    silencio.
 *  - Si no hay voces en español o speechSynthesis no responde,
 *    "Probar voz" lo muestra en pantalla y el juego sigue con
 *    pitidos de respaldo.
 */
var voiceSupported = (typeof window !== "undefined") && ("speechSynthesis" in window);
var voiceUnlocked = false;   // true SOLO tras onstart/onend de un utterance de desbloqueo
var voicesReady = false;
var voiceStatus = "unknown"; // unknown | ok | blocked | unsupported | no-voices
var voiceStatusText = "";
var speechQueue = []; // { text, opts, tries }
var speechBusy = false;
var speechWaitingVoices = false;
var voiceUnlockAttemptedAt = 0;
var voiceUnlockAudible = false; // el próximo intento de desbloqueo será audible
var lastSpeechActivityAt = 0;

function refreshVoices() {
  try {
    var vs = window.speechSynthesis ? window.speechSynthesis.getVoices() || [] : [];
    if (vs && vs.length) voicesReady = true;
  } catch (e) {}
  spanishVoice = pickSpanishVoice();
  if (spanishVoice) voicesReady = true;
}

function setVoiceStatus(status, text) {
  voiceStatus = status;
  if (text) voiceStatusText = text;
  var el = $("voiceStatus");
  if (el && text) el.textContent = text;
}

/** Si el motor quedó hablando algo que nunca arrancó (cola atorada),
 *  limpiarla con cancel(). Solo se hace cuando hay evidencia de atasco
 *  (speaking sin actividad > 2.5 s): un cancel() gratuito justo antes
 *  de speak() puede descartar el utterance nuevo en Safari antiguo
 *  (WebKit bug 191745). */
function clearStuckSpeech() {
  try {
    var s = window.speechSynthesis;
    if (!s || !s.speaking) return;
    if (lastSpeechActivityAt && Date.now() - lastSpeechActivityAt > 2500) {
      s.cancel();
      speechBusy = false;
    }
  } catch (e) {}
}

/** Desbloqueo de la voz. SOLO se llama desde un gesto del usuario
 *  (pointerdown/touchstart en document, o click en "¡Listo a jugar!" /
 *  "Probar voz"). Devuelve true solo si el desbloqueo ya estaba
 *  verificado; el desbloqueo nuevo se confirma por onstart/onend del
 *  utterance, nunca aquí. */
function unlockVoice() {
  if (!voiceSupported) {
    setVoiceStatus("unsupported", "⚠️ Este navegador no tiene voz (Web Speech no disponible).");
    return false;
  }
  refreshVoices();
  try { window.speechSynthesis.resume(); } catch (e) {}
  if (voiceUnlocked) { pumpSpeech(); return true; }
  var now = Date.now();
  if (now - voiceUnlockAttemptedAt < 800) return false;
  voiceUnlockAttemptedAt = now;
  clearStuckSpeech();
  var u;
  try {
    // Silencioso primero ("¡Hola!" a volumen 0: patrón estándar de
    // desbloqueo). Si no arranca, el próximo gesto lo reintenta audible.
    u = new SpeechSynthesisUtterance("¡Hola!");
  } catch (e) { return false; }
  u.lang = "es-MX";
  if (spanishVoice) u.voice = spanishVoice;
  u.volume = voiceUnlockAudible ? 1 : 0;
  u.rate = 1.2;
  var done = false;
  u.onstart = function () {
    if (done) return; done = true;
    voiceUnlocked = true;
    setVoiceStatus("ok", "✅ Voz lista.");
    pumpSpeech();
  };
  u.onend = function () {
    if (done) return; done = true;
    voiceUnlocked = true;
    setVoiceStatus("ok", "✅ Voz lista.");
    pumpSpeech();
  };
  u.onerror = function () { /* sin onstart: se reintenta en el próximo gesto */ };
  setTimeout(function () {
    if (!done) {
      // El utterance de desbloqueo no arrancó (WebKit lo descartó).
      // NO desbloquear; el próximo gesto reintenta, audible.
      voiceUnlockAudible = true;
    }
  }, 1500);
  lastSpeechActivityAt = now;
  try { window.speechSynthesis.speak(u); } catch (e) {}
  return false;
}

function splitSentences(text) {
  var parts = String(text || "").split(/(?<=[.!?])\s+/);
  return parts.map(function (p) { return p.trim(); }).filter(Boolean);
}

function speak(text, opts) {
  if (!text) return;
  var parts = splitSentences(text);
  for (var i = 0; i < parts.length; i++) {
    speechQueue.push({ text: parts[i], opts: opts || {}, tries: 0 });
  }
  pumpSpeech();
}

/** Saca el siguiente anuncio de la cola y lo dice. No habla sin
 *  desbloqueo verificado: en iOS ese speak() sería descartado en
 *  silencio. La cola espera al próximo gesto (unlockVoice hace pump). */
function pumpSpeech() {
  if (speechBusy || !speechQueue.length) return;
  if (muted) { speechQueue.length = 0; return; }
  if (!voiceSupported) { speechQueue.length = 0; return; }
  if (!voiceUnlocked) return;
  if (!voicesReady) {
    refreshVoices();
    if (!voicesReady) {
      if (!speechWaitingVoices) {
        speechWaitingVoices = true;
        setTimeout(function () { speechWaitingVoices = false; pumpSpeech(); }, 1200);
      }
      return;
    }
  }
  speechBusy = true;
  speakNow(speechQueue[0]);
}

function speakNow(item) {
  try { window.speechSynthesis.resume(); } catch (e) {}
  clearStuckSpeech();
  var u;
  try { u = new SpeechSynthesisUtterance(item.text); } catch (e) { finishSpeech(item, true, false); return; }
  u.lang = "es-MX";
  if (spanishVoice) u.voice = spanishVoice;
  u.rate = (item.opts && item.opts.rate) || 1.05;
  u.pitch = (item.opts && item.opts.pitch) || 1.1;
  u.volume = 1;
  var done = false, started = false;
  var finishOnce = function (ok) { if (done) return; done = true; finishSpeech(item, ok, started); };
  u.onstart = function () {
    if (done) return;
    started = true;
    lastSpeechActivityAt = Date.now();
    speechActive++;
    duckMusic(true);
    if (item.opts && item.opts.onstart) { try { item.opts.onstart(); } catch (e) {} }
  };
  u.onend = function () { lastSpeechActivityAt = Date.now(); finishOnce(true); };
  u.onerror = function (ev) { lastSpeechActivityAt = Date.now(); finishOnce(!(ev && ev.error === "not-allowed")); };
  setTimeout(function () { if (!done && !started) { clearStuckSpeech(); finishOnce(false); } }, 1500);
  setTimeout(function () { if (!done) finishOnce(true); }, Math.max(6000, item.text.length * 200 + 6000));
  lastSpeechActivityAt = Date.now();
  try { window.speechSynthesis.speak(u); } catch (e) { finishOnce(false); }
}

function finishSpeech(item, ok, started) {
  speechActive = Math.max(0, speechActive - 1);
  if (speechActive === 0) duckMusic(false);
  speechBusy = false;
  if (speechQueue.length && speechQueue[0] === item) speechQueue.shift();
  if (!ok && !started && item.tries < 2) {
    item.tries++;
    speechQueue.unshift(item);
    pumpSpeech(); // si no hay desbloqueo verificado, la cola espera al próximo gesto
    return;
  }
  if (!ok && item.opts && item.opts.onfail) { try { item.opts.onfail(); } catch (e) {} }
  if (speechQueue.length) pumpSpeech();
}

function stopSpeaking() {
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  speechActive = 0;
  speechBusy = false;
  duckMusic(false);
}

/** Prueba de voz desde el lobby: quita el silencio si estaba puesto,
 *  desbloquea la voz dentro del gesto (tap) y dice un ejemplo del
 *  anuncio de fin de ronda, para probarla sin jugar una ronda entera.
 *  Muestra en pantalla si funcionó o si falló (y qué revisar). */
function testVoice() {
  ensureAudio();
  if (muted) {
    muted = false;
    try { localStorage.setItem(LS_MUTED, "0"); } catch (e) {}
    if (musicGain) musicGain.gain.value = MUSIC_LEVEL;
    if (sfxGain) sfxGain.gain.value = SFX_LEVEL;
    updateSoundBtn();
  }
  unlockVoice(); // dentro del gesto: desbloquea la voz en iOS
  var said = false;
  speak("El ganador de la ronda es Tato, con 900 puntos. En segundo lugar, Milly, con 600 puntos.", {
    onstart: function () {
      said = true;
      setVoiceStatus("ok", "✅ Voz funcionando: se escuchó el ejemplo.");
    },
    onfail: function () {
      setVoiceStatus("blocked", "⚠️ La voz no se escuchó. Revisa el interruptor de silencio de tu iPhone y el volumen.");
    }
  });
  toast("🔊 Probando la voz…");
  setTimeout(function () {
    if (!said && voiceStatus !== "ok") {
      setVoiceStatus("blocked", "⚠️ La voz no respondió. Toca de nuevo \"Probar voz\" o revisa el interruptor de silencio de tu iPhone y el volumen.");
    }
  }, 4000);
}

/* --- Versión de la app y aviso de actualización ---------------------- */
/* GitHub Pages puede servir index.html cacheado (max-age=600) y una
 * pestaña vieja de Safari seguiría corriendo ?v=2 aunque ya exista ?v=3.
 * version.json se pide con anti-caché; si el servidor reporta una
 * versión mayor que APP_VERSION, se muestra un banner con botón de
 * recarga. Así el usuario nunca juega sin saber que hay una versión
 * nueva (esto es lo que pasó con ?v=2 en la sala HFTY). */
var APP_VERSION = 3;

function checkAppVersion() {
  try {
    fetch("version.json?nocache=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && typeof data.version === "number" && data.version > APP_VERSION) {
          showUpdateBanner();
        }
      })
      .catch(function () {});
  } catch (e) {}
}

function showUpdateBanner() {
  var b = $("updateBanner");
  if (!b) return;
  b.hidden = false;
  var btn = $("updateBtn");
  if (btn) btn.addEventListener("click", function () { window.location.reload(); });
}

/* ------------------------------------------------------------------ */
/* Textos de los anuncios de voz (puros: solo usan el estado del server) */
/* ------------------------------------------------------------------ */

/**
 * Anuncio de fin de ronda.
 *
 * - El GANADOR DE LA RONDA se anuncia con sus PUNTOS DE ESA RONDA
 *   (state.roundPoints[roundWinner], que manda el servidor).
 * - El 2º y 3º lugar se anuncian con su TOTAL ACUMULADO del marcador
 *   (state.players[].score, que manda el servidor), ordenados por total y
 *   sin repetir al ganador de la ronda.
 * - Si hay menos de 3 jugadores, se anuncian solo los que haya.
 * El texto se construye en el cliente a partir del estado del servidor;
 * nunca se inventa un nombre ni un punto.
 *
 * Ejemplo: "El ganador de la ronda es Tato, con 750 puntos. En segundo
 * lugar, Milly, con 600 puntos. En tercer lugar, Ledya, con 450 puntos."
 */
function buildRoundEndAnnouncement(state) {
  if (!state || !state.roundWinner) return "";
  var players = state.players || [];
  var winner = playerById(state, state.roundWinner);
  if (!winner) return "";
  var roundPts = 0;
  if (state.roundPoints && typeof state.roundPoints[state.roundWinner] === "number") {
    roundPts = state.roundPoints[state.roundWinner];
  }
  var parts = ["El ganador de la ronda es " + winner.name + ", con " + ptsWord(roundPts) + "."];
  var rest = [];
  for (var i = 0; i < players.length; i++) {
    if (players[i].id !== state.roundWinner) rest.push(players[i]);
  }
  rest.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
  var places = ["segundo", "tercer"];
  for (var j = 0; j < Math.min(2, rest.length); j++) {
    parts.push("En " + places[j] + " lugar, " + rest[j].name + ", con " + ptsWord(rest[j].score || 0) + ".");
  }
  return parts.join(" ");
}

/**
 * Anuncio del ganador final: nombre + TOTAL acumulado del marcador.
 * Ejemplo: "¡El ganador del juego es Tato, con 1250 puntos! En segundo
 * lugar, Milly, con 900 puntos."
 */
function buildGameOverAnnouncement(state) {
  if (!state || !state.winner) return "";
  var players = state.players || [];
  var winner = playerById(state, state.winner);
  if (!winner) return "";
  var parts = ["¡El ganador del juego es " + winner.name + ", con " + ptsWord(winner.score || 0) + "!"];
  var rest = [];
  for (var i = 0; i < players.length; i++) {
    if (players[i].id !== state.winner) rest.push(players[i]);
  }
  rest.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
  if (rest.length > 0) {
    parts.push("En segundo lugar, " + rest[0].name + ", con " + ptsWord(rest[0].score || 0) + ".");
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Toasts / confeti / fuegos artificiales visuales                     */
/* ------------------------------------------------------------------ */

function toast(msg, kind) {
  var el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast" + (kind === "error" ? " error" : "");
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 4500);
}

var CONFETTI_COLORS = ["#ffd700", "#e63329", "#00d4c8", "#2ee06f", "#ff5ce1", "#ffffff", "#ff8c42"];

function spawnConfetti(n) {
  var box = $("confetti");
  if (!box) return;
  box.innerHTML = "";
  var count = n || 90;
  for (var i = 0; i < count; i++) {
    var piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = (Math.random() * 100) + "vw";
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = (2.2 + Math.random() * 1.8) + "s";
    piece.style.animationDelay = (Math.random() * 0.7) + "s";
    piece.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
    if (Math.random() < 0.4) piece.style.borderRadius = "50%";
    box.appendChild(piece);
  }
  setTimeout(function () { box.innerHTML = ""; }, 5200);
}

/* Fuegos artificiales en canvas: cohetes que suben y estallan en partículas. */
var fwParticles = [];
var fwRaf = null;
var fwUntil = 0;

function launchFireworks(durationMs) {
  var canvas = $("fireworksCanvas");
  if (!canvas || !canvas.getContext) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  fwUntil = Date.now() + (durationMs || 6000);
  var lastSpawn = 0;
  function frame(now) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (Date.now() < fwUntil && now - lastSpawn > 280) {
      lastSpawn = now;
      spawnRocket(canvas);
    }
    var alive = [];
    for (var i = 0; i < fwParticles.length; i++) {
      var p = fwParticles[i];
      p.vy += p.gravity;
      p.x += p.vx; p.y += p.vy;
      p.life -= 1;
      if (p.life > 0 && p.y < canvas.height + 20) {
        alive.push(p);
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    fwParticles = alive;
    if (Date.now() < fwUntil || fwParticles.length > 0) {
      fwRaf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fwRaf = null;
    }
  }
  if (!fwRaf) fwRaf = requestAnimationFrame(frame);
}

function spawnRocket(canvas) {
  var colors = ["#ffd700", "#ff3b30", "#00d4c8", "#ff5ce1", "#2ee06f", "#ffffff"];
  var color = colors[Math.floor(Math.random() * colors.length)];
  var x = 40 + Math.random() * (canvas.width - 80);
  var y = canvas.height;
  var targetY = canvas.height * (0.15 + Math.random() * 0.35);
  fwParticles.push({
    x: x, y: y, vx: (Math.random() - 0.5) * 1.2, vy: -9 - Math.random() * 3,
    gravity: 0.12, life: 999, maxLife: 999, size: 3, color: "#ffffff",
    rocket: true, targetY: targetY, burstColor: color, canvas: canvas
  });
  // El cohete estalla al llegar a su altura: se programa con un temporizador.
  setTimeout(function () {
    burstFirework(x, targetY, color);
  }, 700 + Math.random() * 400);
}

function burstFirework(x, y, color) {
  var n = 45 + Math.floor(Math.random() * 35);
  for (var i = 0; i < n; i++) {
    var ang = Math.random() * Math.PI * 2;
    var speed = 1 + Math.random() * 4.5;
    fwParticles.push({
      x: x, y: y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      gravity: 0.045, life: 55 + Math.random() * 35, maxLife: 90,
      size: 2 + Math.random() * 2.5, color: color
    });
  }
}

/* ------------------------------------------------------------------ */
/* Conexión: crear sala / unirse / WebSocket con reconexión            */
/* ------------------------------------------------------------------ */

function setConnected(on) {
  connected = on;
  var dot = $("connDot");
  if (dot) dot.className = "conn-dot " + (on ? "on" : "off");
}

function send(msg) {
  if (demoMode) {
    toast("🎭 Demo: se enviaría " + JSON.stringify(msg));
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    toast("Sin conexión con el servidor. Reintenta entrar a la sala.", "error");
  }
}

function reconnectDelayMs() {
  // Backoff 1 s → 30 s, máx. 12 intentos.
  return Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
}

function scheduleReconnect() {
  if (demoMode) return;
  if (reconnectAttempts >= 12) {
    toast("Se perdió la conexión y ya no se pudo reconectar. Vuelve a entrar con el código de la sala.", "error");
    return;
  }
  var delay = reconnectDelayMs();
  reconnectAttempts++;
  toast("Se perdió la conexión. Reintentando en " + Math.round(delay / 1000) + " s… (intento " + reconnectAttempts + " de 12)");
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(function () {
    if (roomCode) connectWS(roomCode);
  }, delay);
}

function connectWS(code) {
  var base = wsBase();
  if (!base) { showConfigWarning(); return; }
  var url = base + "/room/" + code + "/ws?name=" + encodeURIComponent(myName);
  try { ws = new WebSocket(url); } catch (e) {
    toast("No se pudo abrir la conexión: " + e.message, "error");
    return;
  }
  ws.onopen = function () {
    setConnected(true);
    reconnectAttempts = 0;
    send({ type: "join", name: myName });
  };
  ws.onmessage = function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type === "state" && msg.state) onState(msg.state);
    else if (msg.type === "error" && msg.message) toast("🔔 " + msg.message, "error");
  };
  ws.onclose = function () {
    setConnected(false);
    if (demoMode) return;
    if (currentState && currentState.phase !== "gameOver") scheduleReconnect();
  };
  ws.onerror = function () { setConnected(false); };
}

var selectedRounds = 5;

function createRoom() {
  var base = apiBase();
  if (!base) { showConfigWarning(); return; }
  var name = readName();
  if (!name) return;
  myName = name;
  ensureAudio(); startMusic();
  toast("Creando sala…");
  fetch(base + "/api/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ totalRounds: selectedRounds })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.code) throw new Error("El servidor no devolvió código de sala.");
      roomCode = String(data.code).toUpperCase();
      myId = "p1"; // quien crea la sala es el primer jugador (el estado lo confirma)
      draft = {}; draftBonus = "";
      connectWS(roomCode);
    })
    .catch(function (e) { toast("No se pudo crear la sala: " + e.message, "error"); });
}

function joinRoom(code) {
  var base = apiBase();
  if (!base) { showConfigWarning(); return; }
  var name = readName();
  if (!name) return;
  code = (code || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) { toast("El código de sala tiene 4 letras.", "error"); return; }
  myName = name;
  roomCode = code;
  myId = null; // lo confirma el estado al entrar
  draft = {}; draftBonus = "";
  ensureAudio(); startMusic();
  connectWS(code);
}

function readName() {
  var input = $("nameInput");
  var name = input ? input.value.trim() : myName;
  if (!name) { toast("Escribe tu nombre primero.", "error"); if (input) input.focus(); return ""; }
  try { localStorage.setItem(LS_NAME, name); } catch (e) {}
  return name;
}

function showConfigWarning() {
  var w = $("configWarning");
  if (w) w.hidden = false;
  toast("Falta configurar la dirección del servidor (config.js).", "error");
}

/* ------------------------------------------------------------------ */
/* Recepción del estado                                                */
/* ------------------------------------------------------------------ */

function onState(state) {
  currentState = state;
  identifyMe(state);
  if (state.code) {
    roomCode = state.code;
    var badge = $("roomBadge");
    if (badge) badge.hidden = false;
    var rc = $("roomCode");
    if (rc) rc.textContent = state.code;
  }
  // Mi borrador: el servidor me devuelve lo que llevo escrito.
  if (state.myAnswers) draft = Object.assign({}, state.myAnswers);
  if (typeof state.myBonus === "string") draftBonus = state.myBonus;
  render(state);
}

/* ------------------------------------------------------------------ */
/* Anuncios de voz por fase (se disparan UNA vez por ronda/fase)       */
/* ------------------------------------------------------------------ */

/** Al arrancar la ronda (ruleta): "¡Ronda N!" + "¡La letra es X!". */
function maybeAnnounceRoundStart(state) {
  if (state.phase !== "roulette" || !state.letter) return;
  var key = (state.code || "") + "|ronda|" + state.round;
  if (spokenRoundKey === key) return;
  spokenRoundKey = key;
  speak("¡Ronda " + state.round + "!");
  speak("¡La letra es " + state.letter + "!");
}

/** Cuenta atrás 3-2-1 con voz (y pitido de respaldo). */
function maybeAnnounceCountdown(state) {
  if (state.phase !== "countdown") return;
  var key = (state.code || "") + "|cuenta|" + state.round;
  if (spokenCountdownKey === key) return;
  spokenCountdownKey = key;
  var words = ["Tres", "Dos", "Uno"];
  words.forEach(function (w, i) {
    setTimeout(function () {
      if (!currentState || currentState.phase !== "countdown") return;
      if (spokenCountdownKey !== key) return;
      speak(w);
      playBeep(i === 2);
    }, i * 1000);
  });
}

/** Al terminar la ronda: ganador + 2º/3º (ver buildRoundEndAnnouncement). */
function maybeAnnounceRoundEnd(state) {
  if (state.phase !== "roundEnd") return;
  var key = (state.code || "") + "|fin|" + state.round;
  if (spokenRoundEndKey === key) return;
  spokenRoundEndKey = key;
  playApplause();
  var text = buildRoundEndAnnouncement(state);
  if (text) speak(text);
}

/** Al final de la partida: ganador final + fuegos artificiales. */
function maybeAnnounceGameOver(state) {
  if (state.phase !== "gameOver") return;
  var key = (state.code || "") + "|final";
  if (spokenGameOverKey === key) return;
  spokenGameOverKey = key;
  playFireworksSound();
  launchFireworks(6000);
  spawnConfetti(120);
  var text = buildGameOverAnnouncement(state);
  if (text) speak(text);
}

/* ------------------------------------------------------------------ */
/* Temporizador / UI en vivo (intervalo de 200 ms)                     */
/* ------------------------------------------------------------------ */

function startUiLoop() {
  if (uiTimer) return;
  uiTimer = setInterval(function () {
    var state = currentState;
    if (!state) return;
    var now = Date.now();
    if (state.phase === "countdown" && state.deadline) {
      var n = Math.max(0, Math.ceil((state.deadline - now) / 1000));
      var el = $("countNum");
      if (el && el.textContent !== String(n)) {
        el.textContent = String(n);
        el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      }
    }
    if ((state.phase === "writing" || state.phase === "grace") && state.deadline) {
      var remain = Math.max(0, state.deadline - now);
      var elapsed = FREEZE_MS - remain;
      if (state.phase === "writing") {
        var t = $("elapsedTime");
        if (t) {
          var s = Math.floor(elapsed / 1000);
          t.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        }
        var bar = $("freezeBar");
        if (bar) {
          var pct = Math.min(100, (elapsed / FREEZE_MS) * 100);
          bar.style.width = pct + "%";
          bar.className = "freeze-bar" + (pct >= 85 ? " hot" : "");
        }
      } else {
        var g = $("graceNum");
        if (g) g.textContent = String(Math.max(0, Math.ceil(remain / 1000)));
      }
    }
    if (state.phase === "roulette" && state.deadline && !rouletteStopped) {
      var elapsedR = ROULETTE_MS - Math.max(0, state.deadline - now);
      if (elapsedR >= 3200 && state.letter) {
        rouletteStopped = true;
        if (rouletteTimer) { clearInterval(rouletteTimer); rouletteTimer = null; }
        var rl = $("rouletteLetter");
        if (rl) { rl.textContent = state.letter; rl.className = "roulette-letter landed"; }
      }
    }
  }, 200);
}

/* ------------------------------------------------------------------ */
/* Render — marcador                                                   */
/* ------------------------------------------------------------------ */

function renderScoreboard(state) {
  var box = $("players");
  if (!box || !state.players) return;
  var inGame = ["roulette", "countdown", "writing", "grace", "bonus", "roundEnd"].indexOf(state.phase) >= 0;
  box.innerHTML = state.players.map(function (p) {
    var isMe = p.id === myId;
    var isBasta = state.bastaBy === p.id;
    var prog = state.progress ? (state.progress[p.id] || 0) : 0;
    var tag = "";
    var tagCls = "";
    if (state.phase === "ready") {
      tag = p.ready ? "✅ LISTO" : "⏳ ESPERANDO";
      tagCls = p.ready ? " ready-yes" : " ready-no";
    } else if (isMe) {
      tag = "TÚ";
    } else if (isBasta) {
      tag = "¡BASTA!";
    }
    var progHtml = "";
    if (inGame && (state.phase === "writing" || state.phase === "grace")) {
      progHtml = '<div class="p-progress">' + prog + ' / 9 ✏️</div>';
    } else if (inGame && state.phase === "bonus") {
      progHtml = '<div class="p-progress">' + (prog ? "✅ bonus listo" : "✏️ escribiendo bonus…") + "</div>";
    } else if (state.phase === "ready") {
      progHtml = '<div class="p-progress"></div>';
    }
    return '<div class="player-card' + (isMe ? " me" : "") + (isBasta ? " basta-by" : "") + '">' +
      '<div class="p-tag' + tagCls + '">' + esc(tag) + '</div>' +
      '<div class="p-name">' + esc(p.name) + '</div>' +
      '<div class="p-score">' + (typeof p.score === "number" ? p.score : 0) + '</div>' +
      progHtml +
      '</div>';
  }).join("");

  var info = $("roundInfo");
  if (info) {
    if (state.phase === "lobby" || state.phase === "ready" || state.phase === "gameOver") { info.hidden = true; return; }
    info.hidden = false;
    var letterHtml = state.letter ? '<span class="letter-pill">Letra ' + esc(state.letter) + '</span>' : "";
    info.innerHTML = '<span>Ronda ' + (state.round || 1) + ' de ' + (state.totalRounds || 5) + '</span>' + letterHtml;
  }
}

/* ------------------------------------------------------------------ */
/* Render — escritura (sin reconstruir el formulario mientras escribes) */
/* ------------------------------------------------------------------ */

function allDraftFilled() {
  var cats = currentState && currentState.categories ? currentState.categories : [];
  if (!cats.length) return false;
  for (var i = 0; i < cats.length; i++) {
    if (!(draft[cats[i].id] || "").trim()) return false;
  }
  return true;
}

function scheduleAnswersSync() {
  if (answersTimer) clearTimeout(answersTimer);
  answersTimer = setTimeout(function () {
    send({ type: "answers", answers: draft });
  }, 300);
}

function refreshWritingControls(state) {
  var locked = state.phase === "grace" && state.gracePlayer !== myId;
  var btn = $("bastaBtn");
  if (btn) {
    btn.disabled = locked || !allDraftFilled();
    btn.textContent = locked ? "🔒 ¡BASTA! (bloqueado)" : "🛑 ¡BASTA!";
  }
  var cats = state.categories || [];
  for (var i = 0; i < cats.length; i++) {
    var input = $("cat-" + cats[i].id);
    if (input) {
      input.disabled = locked;
      input.classList.toggle("filled", !!(draft[cats[i].id] || "").trim());
    }
  }
  var prog = $("myProgress");
  if (prog) {
    var n = 0;
    for (var j = 0; j < cats.length; j++) if ((draft[cats[j].id] || "").trim()) n++;
    prog.textContent = n + " / 9 casillas";
  }
}

function renderWriting(state) {
  var stage = $("stage");
  var key = state.phase + "|" + state.round + "|" + (state.letter || "");
  var isGrace = state.phase === "grace";
  if (writingKey === key && stage.getAttribute("data-writing") === "1") {
    refreshWritingControls(state);
    return;
  }
  writingKey = key;
  stage.setAttribute("data-writing", "1");
  var locked = isGrace && state.gracePlayer !== myId;
  var graceName = isGrace ? (playerById(state, state.gracePlayer) || {}).name || "" : "";
  var bastaName = state.bastaBy ? (playerById(state, state.bastaBy) || {}).name || "" : "";
  var banner = "";
  if (isGrace) {
    if (state.gracePlayer === myId) {
      banner = '<div class="alert-banner"><h3>⏰ ¡TIENES 5 SEGUNDOS DE GRACIA!</h3>' +
        '<p><b>' + esc(bastaName) + '</b> cantó ¡BASTA! primero, pero como ganaste la ronda anterior, tienes 5 s para terminar.</p>' +
        '<div class="grace-num" id="graceNum">5</div></div>';
    } else {
      banner = '<div class="alert-banner"><h3>🛑 ¡BASTA! DE ' + esc(bastaName.toUpperCase()) + '</h3>' +
        '<p>La ronda se cerró. <b>' + esc(graceName) + '</b> (ganador de la ronda anterior) tiene 5 s de gracia para terminar. Tú ya estás bloqueado.</p>' +
        '<div class="grace-num" id="graceNum">5</div></div>';
    }
  }
  var rows = (state.categories || []).map(function (c) {
    var val = draft[c.id] || "";
    return '<div class="write-row"><label for="cat-' + esc(c.id) + '">' + esc(c.label) + '</label>' +
      '<input type="text" id="cat-' + esc(c.id) + '" data-cat="' + esc(c.id) + '" value="' + esc(val) + '" placeholder="Empieza con ' + esc(state.letter || "?") + '…" autocomplete="off" maxlength="80"' + (locked ? " disabled" : "") + '></div>';
  }).join("");
  stage.innerHTML = '<div class="phase-title">✏️ RONDA ' + (state.round || 1) + ' · LETRA ' + esc(state.letter || "?") + '</div>' +
    banner +
    '<p class="phase-sub">Llena las 9 casillas y oprime <b>¡BASTA!</b> antes que nadie. <span id="myProgress"></span></p>' +
    '<div class="write-grid">' + rows + '</div>' +
    '<button type="button" class="btn btn-basta" id="bastaBtn">🛑 ¡BASTA!</button>' +
    '<div class="elapsed">⏱️ <b id="elapsedTime">0:00</b> · a los 3:00 la ronda se congela y hay categoría bonus<div class="freeze-track"><div id="freezeBar" class="freeze-bar"></div></div></div>';

  (state.categories || []).forEach(function (c) {
    var input = $("cat-" + c.id);
    if (!input) return;
    input.addEventListener("input", function () {
      draft[c.id] = input.value;
      input.classList.toggle("filled", !!input.value.trim());
      refreshWritingControls(state);
      scheduleAnswersSync();
    });
    input.addEventListener("change", function () { send({ type: "answers", answers: draft }); });
  });
  var btn = $("bastaBtn");
  if (btn) btn.addEventListener("click", function () {
    if (!allDraftFilled()) { toast("Te faltan casillas por llenar.", "error"); return; }
    send({ type: "basta", answers: draft });
    playBastaFanfare();
    btn.disabled = true;
  });
  refreshWritingControls(state);
  var first = $("cat-" + (state.categories && state.categories[0] ? state.categories[0].id : ""));
  if (first && !locked) first.focus();
}

function clearWritingFlag() {
  var stage = $("stage");
  if (stage) stage.removeAttribute("data-writing");
  writingKey = "";
}

/* ------------------------------------------------------------------ */
/* Render — fases                                                      */
/* ------------------------------------------------------------------ */

function renderLobby(state) {
  clearWritingFlag();
  var stage = $("stage");
  var players = state.players || [];
  var code = state.code || roomCode;
  var name = "";
  try { name = localStorage.getItem(LS_NAME) || ""; } catch (e) {}
  var configured = !!apiBase();
  try { selectedRounds = parseInt(localStorage.getItem(LS_ROUNDS) || "5", 10) || 5; } catch (e) {}

  var roundsBtns = [3, 5, 7, 10].map(function (n) {
    return '<button type="button" data-rounds="' + n + '" class="' + (n === selectedRounds ? "sel" : "") + '">' + n + '</button>';
  }).join("");

  stage.innerHTML = '<div class="lobby-card">' +
    '<div class="phase-title">🎉 ¡A JUGAR AL BASTA!</div>' +
    '<form class="lobby-form" id="lobbyForm">' +
      '<label for="nameInput">Tu nombre</label>' +
      '<input type="text" id="nameInput" placeholder="Ej. Tato" value="' + esc(name) + '" maxlength="20" autocomplete="off">' +
      '<label>¿Cuántas rondas?</label>' +
      '<div class="rounds-picker" id="roundsPicker">' + roundsBtns + '</div>' +
      '<button type="submit" class="btn" id="createBtn" ' + (configured ? "" : "disabled") + '>➕ Crear sala</button>' +
      '<div class="lobby-or">— o —</div>' +
      '<label for="codeInput">Código de sala (4 letras)</label>' +
      '<input type="text" id="codeInput" class="code-input" placeholder="ABCD" maxlength="4" autocomplete="off">' +
      '<button type="button" class="btn btn-red" id="joinBtn" ' + (configured ? "" : "disabled") + '>🚪 Unirse a la sala</button>' +
    '</form>' +
    (code ? '<div class="lobby-code-big">' + esc(code) + '</div><p class="share-note">Comparte este código con tus amigos para que se unan (de 2 a 6 jugadores). En cuanto entre el 2º jugador, todos se ponen listos… ¡y arranca la ruleta!</p>' : "") +
    (players.length === 1 ? '<p class="share-note"><b>' + esc(players[0].name) + '</b> ya está en la sala. Esperando a alguien más…</p>' : "") +
    '<button type="button" class="btn btn-ghost" id="voiceTestBtn" style="width:100%;margin-top:12px">🔊 Probar voz</button>' +
    '<p id="voiceStatus" class="share-note">' + esc(voiceStatusText || "Toca “Probar voz” para oír un ejemplo del anuncio de fin de ronda sin jugar. Si no se escucha, revisa el interruptor de silencio de tu iPhone y el volumen.") + '</p>' +
    '</div>';

  var vt = $("voiceTestBtn");
  if (vt) vt.addEventListener("click", function () { testVoice(); });
  var form = $("lobbyForm");
  if (form) form.addEventListener("submit", function (ev) { ev.preventDefault(); createRoom(); });
  var joinBtn = $("joinBtn");
  if (joinBtn) joinBtn.addEventListener("click", function () {
    var c = $("codeInput"); joinRoom(c ? c.value : "");
  });
  var picker = $("roundsPicker");
  if (picker) {
    var btns = picker.children;
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          selectedRounds = parseInt(b.getAttribute("data-rounds"), 10);
          try { localStorage.setItem(LS_ROUNDS, String(selectedRounds)); } catch (e) {}
          for (var j = 0; j < btns.length; j++) btns[j].className = (btns[j] === b ? "sel" : "");
        });
      })(btns[i]);
    }
  }
  var nameInput = $("nameInput");
  if (nameInput && !nameInput.value) nameInput.focus();
}

function renderReady(state) {
  clearWritingFlag();
  var stage = $("stage");
  var players = state.players || [];
  var iAmReady = me(state) ? me(state).ready : false;
  var rows = players.map(function (p) {
    return '<div class="ready-row' + (p.ready ? " is-ready" : "") + '"><span>' + esc(p.name) + (p.id === myId ? " (tú)" : "") + '</span>' +
      '<span class="' + (p.ready ? "st-yes" : "st-no") + '">' + (p.ready ? "✅ ¡Listo!" : "⏳ Esperando…") + '</span></div>';
  }).join("");
  stage.innerHTML = '<div class="lobby-card">' +
    '<div class="phase-title">🙋 ¡A PONERSE LISTOS!</div>' +
    '<p class="phase-sub">La partida empieza solo cuando <b>TODOS</b> opriman <b>“¡Listo a jugar!”</b>. Todavía pueden entrar más jugadores (hasta 6).</p>' +
    '<div class="ready-list">' + rows + '</div>' +
    '<button type="button" class="btn btn-teal" id="readyBtn" style="width:100%" ' + (iAmReady ? "disabled" : "") + '>' +
    (iAmReady ? "✅ ¡Listo! Esperando a los demás…" : "✅ ¡Listo a jugar!") + '</button>' +
    '<p class="share-note">Código de sala: <b>' + esc(state.code || roomCode) + '</b> · ' + players.length + ' de 6 jugadores</p>' +
    '</div>';
  var btn = $("readyBtn");
  if (btn) btn.addEventListener("click", function () {
    ensureAudio(); startMusic(); unlockVoice();
    send({ type: "ready" });
    btn.disabled = true;
    btn.textContent = "✅ ¡Listo! Esperando a los demás…";
  });
}

function renderRoulette(state) {
  clearWritingFlag();
  var stage = $("stage");
  var key = (state.code || "") + "|ruleta|" + state.round;
  var firstTime = rouletteKey !== key;
  rouletteKey = key;
  rouletteStopped = false;
  var used = state.usedLetters || [];
  var strip = LETTERS.map(function (l) {
    return '<span class="' + (used.indexOf(l) >= 0 && l !== state.letter ? "used" : "") + '">' + l + '</span>';
  }).join("");
  stage.innerHTML = '<div class="phase-title">🎡 RULETA DE LA LETRA · RONDA ' + (state.round || 1) + '</div>' +
    '<div class="roulette-wrap"><div class="roulette-letter" id="rouletteLetter">?</div>' +
    '<p class="phase-sub">¡La ruleta gira…! ¿Con qué letra jugamos?</p>' +
    '<div class="roulette-strip">' + strip + '</div></div>';
  maybeAnnounceRoundStart(state);
  if (rouletteTimer) clearInterval(rouletteTimer);
  var el = $("rouletteLetter");
  rouletteTimer = setInterval(function () {
    if (!el || rouletteStopped) return;
    el.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }, 70);
  if (firstTime) {
    setTimeout(function () {
      if (rouletteTimer) { clearInterval(rouletteTimer); rouletteTimer = null; }
      rouletteStopped = true;
      var rl = $("rouletteLetter");
      if (rl && currentState && currentState.phase === "roulette") {
        rl.textContent = state.letter || "?";
        rl.className = "roulette-letter landed";
      }
    }, 3200);
  }
}

function renderCountdown(state) {
  clearWritingFlag();
  var stage = $("stage");
  var n = 3;
  if (state.deadline) n = Math.max(1, Math.ceil((state.deadline - Date.now()) / 1000));
  stage.innerHTML = '<div class="phase-title">⏱️ ¡PREPARADOS…!</div>' +
    '<p class="phase-sub">Ronda ' + (state.round || 1) + ' · Letra <b>' + esc(state.letter || "?") + '</b></p>' +
    '<div class="countdown-num" id="countNum">' + n + '</div>' +
    '<p class="phase-sub">¡A escribir en cuanto salga el 1…!</p>';
  maybeAnnounceCountdown(state);
}

function renderBonus(state) {
  clearWritingFlag();
  var stage = $("stage");
  var catLabel = "";
  (state.bonusCategories || []).forEach(function (c) {
    if (c.id === state.bonusCategory) catLabel = c.label;
  });
  var frozen = state.frozenPoints || {};
  var frozenHtml = state.players.map(function (p) {
    return '<div class="ready-row"><span>' + esc(p.name) + '</span><span>' + (frozen[p.id] || 0) + ' pts congelados</span></div>';
  }).join("");
  stage.innerHTML = '<div class="alert-banner teal"><h3>🧊 ¡RONDA CONGELADA!</h3>' +
    '<p>Pasaron 3 minutos escribiendo. Las respuestas principales ya se calificaron y los puntos quedaron congelados.</p></div>' +
    '<div class="phase-title">🎁 CATEGORÍA BONUS</div>' +
    '<div class="big-name">' + esc(catLabel || state.bonusCategory || "") + '</div>' +
    '<p class="phase-sub">¡Sin letra! Escribe <b>una</b> palabra de esta categoría y oprime <b>¡BASTA!</b>. El primero cierra la ronda.<br>Bonus: 100 pts si es única, 50 si se repite, 0 si no vale.</p>' +
    '<div class="write-grid"><div class="write-row"><label for="bonusInput">' + esc(catLabel || "Bonus") + '</label>' +
    '<input type="text" id="bonusInput" value="' + esc(draftBonus) + '" placeholder="Tu palabra bonus…" autocomplete="off" maxlength="80"></div></div>' +
    '<button type="button" class="btn btn-basta" id="bastaBtn">🛑 ¡BASTA!</button>' +
    '<div class="ready-list" style="margin-top:16px">' + frozenHtml + '</div>';
  var input = $("bonusInput");
  if (input) {
    input.addEventListener("input", function () {
      draftBonus = input.value;
      var b = $("bastaBtn");
      if (b) b.disabled = !draftBonus.trim();
      if (answersTimer) clearTimeout(answersTimer);
      answersTimer = setTimeout(function () { send({ type: "bonus", answer: draftBonus }); }, 300);
    });
    input.addEventListener("change", function () { send({ type: "bonus", answer: draftBonus }); });
    input.focus();
  }
  var btn = $("bastaBtn");
  if (btn) {
    btn.disabled = !draftBonus.trim();
    btn.addEventListener("click", function () {
      if (!draftBonus.trim()) { toast("Escribe primero la palabra bonus.", "error"); return; }
      send({ type: "basta", bonusAnswer: draftBonus });
      playBastaFanfare();
      btn.disabled = true;
    });
  }
}

function categoryLabel(state, id) {
  var cats = state.categories || [];
  for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].label;
  var bonus = state.bonusCategories || [];
  for (var j = 0; j < bonus.length; j++) if (bonus[j].id === id) return bonus[j].label;
  return id;
}

function renderRoundEnd(state) {
  clearWritingFlag();
  maybeAnnounceRoundEnd(state);
  var stage = $("stage");
  var winner = state.roundWinner ? playerById(state, state.roundWinner) : null;
  var winnerPts = winner && state.roundPoints ? (state.roundPoints[winner.id] || 0) : 0;
  var bastaName = state.bastaBy ? (playerById(state, state.bastaBy) || {}).name || "" : "";
  var order = (state.players || []).slice().sort(function (a, b) {
    return ((state.roundPoints || {})[b.id] || 0) - ((state.roundPoints || {})[a.id] || 0);
  });
  var cards = order.map(function (p) {
    var res = state.results ? state.results[p.id] : null;
    if (!res) return "";
    var rows = res.answers.map(function (a) {
      var ptsCls = a.points > 0 ? "good" : "zero";
      return '<div class="result-row"><span class="cat">' + esc(categoryLabel(state, a.category)) + '</span>' +
        '<span class="word">' + (a.word ? esc(a.word) : "—") + '</span>' +
        '<span class="pts ' + ptsCls + '">' + a.points + '</span>' +
        '<span class="why' + (a.valid ? "" : " bad") + '">' + esc(a.reason) + '</span></div>';
    }).join("");
    var bonusRow = "";
    if (res.bonus) {
      var b = res.bonus;
      var bCls = b.points > 0 ? "good" : "zero";
      bonusRow = '<div class="result-row"><span class="cat">🎁 ' + esc(categoryLabel(state, b.category)) + '</span>' +
        '<span class="word">' + (b.word ? esc(b.word) : "—") + '</span>' +
        '<span class="pts ' + bCls + '">' + b.points + '</span>' +
        '<span class="why' + (b.valid ? "" : " bad") + '">' + esc(b.reason) + '</span></div>';
    }
    var isWin = state.roundWinner === p.id;
    return '<div class="result-card' + (isWin ? " winner" : "") + '">' +
      '<div class="result-head"><span>' + (isWin ? "👑 " : "") + esc(p.name) + '</span>' +
      '<span class="rp">' + (state.roundPoints[p.id] || 0) + ' pts · total ' + (p.score || 0) + '</span></div>' +
      '<div class="result-rows">' + rows + bonusRow + '</div></div>';
  }).join("");
  // Puerta de "Continuar": la siguiente ronda (o el podio final) solo
  // arranca cuando TODOS los jugadores han tocado Continuar, como la
  // puerta de "¡Listo a jugar!" al inicio. Sin límite de tiempo.
  var iContinued = me(state) ? !!me(state).continued : false;
  var isLastRound = state.round >= state.totalRounds;
  var contRows = (state.players || []).map(function (p) {
    return '<div class="ready-row' + (p.continued ? " is-ready" : "") + '"><span>' + esc(p.name) + (p.id === myId ? " (tú)" : "") + '</span>' +
      '<span class="' + (p.continued ? "st-yes" : "st-no") + '">' + (p.continued ? "✅ Continuar" : "⏳ Esperando…") + '</span></div>';
  }).join("");
  stage.innerHTML = '<div class="phase-title">🏁 FIN DE LA RONDA ' + (state.round || 1) + '</div>' +
    (bastaName ? '<p class="phase-sub">🛑 ¡BASTA! lo cantó <b>' + esc(bastaName) + '</b></p>' : "") +
    (winner ? '<div class="big-name">' + esc(winner.name) + '</div>' +
      '<p class="phase-sub">🏆 Gana la ronda con <b>' + winnerPts + ' puntos</b></p>' : "") +
    '<div class="results">' + cards + '</div>' +
    '<p class="phase-sub">La siguiente ronda empieza solo cuando <b>TODOS</b> toquen <b>“Continuar”</b>.</p>' +
    '<div class="ready-list">' + contRows + '</div>' +
    '<div class="btn-row"><button class="btn" id="continueBtn" ' + (iContinued ? "disabled" : "") + '>' +
    (iContinued ? "✅ ¡Listo para continuar! Esperando a los demás…" : (isLastRound ? "🏆 Ver el podio final" : "➡️ Continuar")) + '</button></div>';
  var btn = $("continueBtn");
  if (btn) btn.addEventListener("click", function () {
    btn.disabled = true;
    send({ type: "continue" });
  });
}

function renderGameOver(state) {
  clearWritingFlag();
  maybeAnnounceGameOver(state);
  var stage = $("stage");
  var winner = state.winner ? playerById(state, state.winner) : null;
  var podium = state.podium || [];
  var medals = ["🥇", "🥈", "🥉"];
  var spots = podium.slice(0, 3).map(function (id, i) {
    var p = playerById(state, id);
    if (!p) return "";
    var cls = i === 0 ? "first" : (i === 1 ? "second" : "third");
    return '<div class="podium-spot ' + cls + '"><div class="medal">' + medals[i] + '</div>' +
      '<div class="p-name">' + esc(p.name) + '</div>' +
      '<div class="p-score">' + (p.score || 0) + ' pts</div></div>';
  }).join("");
  var rest = podium.slice(3).map(function (id, i) {
    var p = playerById(state, id);
    if (!p) return "";
    return '<div>' + (i + 4) + 'º · ' + esc(p.name) + ' — ' + (p.score || 0) + ' pts</div>';
  }).join("");
  stage.innerHTML = '<div class="gameover"><div class="trophy">🎆</div>' +
    '<h2>¡FIN DEL JUEGO!</h2>' +
    (winner ? '<div class="big-name">' + esc(winner.name) + '</div><p class="phase-sub">👑 ¡GANADOR DEL JUEGO con <b>' + (winner.score || 0) + ' puntos</b>!</p>' : "") +
    '<div class="podium">' + spots + '</div>' +
    (rest ? '<div class="podium-rest">' + rest + '</div>' : "") +
    '<div class="btn-row"><button class="btn" id="rematchBtn">🔄 ¡Revancha!</button></div>' +
    '<p class="phase-sub">La revancha arranca directo, sin ponerse listos otra vez.</p>' +
    '<div class="btn-row"><button class="btn btn-ghost" id="leaveBtn">🚪 Salir de la sala</button></div></div>';
  var rb = $("rematchBtn");
  if (rb) rb.addEventListener("click", function () {
    draft = {}; draftBonus = "";
    send({ type: "rematch" });
    toast("🔄 ¡Revancha! La ruleta gira otra vez…");
  });
  var lb = $("leaveBtn");
  if (lb) lb.addEventListener("click", function () {
    if (ws) ws.close();
    myId = null; roomCode = ""; currentState = null;
    render({ phase: "lobby", players: [], code: "" });
  });
}

/* ------------------------------------------------------------------ */
/* Render principal                                                    */
/* ------------------------------------------------------------------ */

function render(state) {
  if (!state) return;
  renderScoreboard(state);
  startUiLoop();
  switch (state.phase) {
    case "lobby": renderLobby(state); break;
    case "ready": renderReady(state); break;
    case "roulette": renderRoulette(state); break;
    case "countdown": renderCountdown(state); break;
    case "writing":
    case "grace": renderWriting(state); break;
    case "bonus": renderBonus(state); break;
    case "roundEnd": renderRoundEnd(state); break;
    case "gameOver": renderGameOver(state); break;
    default:
      clearWritingFlag();
      $("stage").innerHTML = '<div class="waiting">Fase desconocida: ' + esc(state.phase) + '</div>';
  }
}

/* ------------------------------------------------------------------ */
/* Modo demo (?demo=1): estados de ejemplo incrustados, sin servidor   */
/* ------------------------------------------------------------------ */

function demoStates() {
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function withPhase(o, patch) { var s = clone(o); Object.assign(s, patch); return s; }
  var cats = [
    { id: "nombre", label: "Nombre" }, { id: "apellido", label: "Apellido" },
    { id: "ciudad", label: "Ciudad o País" }, { id: "animal", label: "Animal" },
    { id: "fruta", label: "Fruta o Verdura" }, { id: "comida", label: "Comida" },
    { id: "profesion", label: "Profesión o trabajo" }, { id: "cosa", label: "Cosa / Objeto" },
    { id: "pelicula", label: "Película o Serie" }
  ];
  var bonusCats = [
    { id: "superheroe", label: "Superhéroe" }, { id: "deporte", label: "Deporte" },
    { id: "cantante", label: "Cantante o Banda" }, { id: "marca", label: "Marca" },
    { id: "videojuego", label: "Videojuego" }
  ];
  var base = {
    code: "DEMO", totalRounds: 5, round: 1, letter: "R", usedLetters: ["R"],
    categories: cats, bonusCategories: bonusCats, bonusCategory: null,
    myAnswers: {}, myBonus: "", progress: { p1: 9, p2: 7, p3: 4 },
    bastaBy: null, gracePlayer: null, prevRoundWinner: null,
    roundWinner: null, roundPoints: {}, frozenPoints: null, results: null,
    winner: null, podium: [], deadline: null,
    players: [
      { id: "p1", name: "Tato", score: 750, ready: true, continued: false },
      { id: "p2", name: "Milly", score: 600, ready: true, continued: false },
      { id: "p3", name: "Ledya", score: 450, ready: false, continued: false }
    ]
  };
  var fullAnswers = {
    nombre: "Rosa", apellido: "Ramírez", ciudad: "Roma", animal: "Rata",
    fruta: "Rábano", comida: "Ramen", profesion: "Reportero", cosa: "Reloj", pelicula: "Ratatouille"
  };
  var demoResults = {
    p1: {
      answers: [
        { category: "nombre", word: "Rosa", canonical: "rosa", points: 100, valid: true, reason: "¡Única! 100 pts" },
        { category: "apellido", word: "Ramírez", canonical: "ramirez", points: 100, valid: true, reason: "¡Única! 100 pts" },
        { category: "ciudad", word: "Roma", canonical: "roma", points: 50, valid: true, reason: "Repetida: 50 pts" },
        { category: "animal", word: "Rata", canonical: "rata", points: 100, valid: true, reason: "¡Única! 100 pts" },
        { category: "fruta", word: "Rábano", canonical: "rabano", points: 100, valid: true, reason: "¡Única! 100 pts" },
        { category: "comida", word: "Ramen", canonical: "ramen", points: 100, valid: true, reason: "¡Única! 100 pts" },
        { category: "profesion", word: "Reportero", canonical: "reportero", points: 100, valid: true, reason: "¡Única! 100 pts" },
        { category: "cosa", word: "Reloj", canonical: "reloj", points: 50, valid: true, reason: "Repetida: 50 pts" },
        { category: "pelicula", word: "Ratatouille", canonical: "ratatouille", points: 100, valid: true, reason: "¡Única! 100 pts" }
      ],
      bonus: null, frozenPoints: 800, bonusPoints: 0, roundPoints: 800
    },
    p2: {
      answers: cats.map(function (c) {
        return { category: c.id, word: "Rosa", canonical: "rosa", points: 0, valid: false, reason: "No es un animal" };
      }),
      bonus: null, frozenPoints: 0, bonusPoints: 0, roundPoints: 0
    },
    p3: {
      answers: cats.map(function (c) {
        return { category: c.id, word: "", canonical: null, points: 0, valid: false, reason: "Sin respuesta" };
      }),
      bonus: null, frozenPoints: 0, bonusPoints: 0, roundPoints: 0
    }
  };
  // Arreglar el demo de p2: respuestas variadas y válidas en parte.
  demoResults.p2.answers = [
    { category: "nombre", word: "Raúl", canonical: "raul", points: 100, valid: true, reason: "¡Única! 100 pts" },
    { category: "apellido", word: "Reyes", canonical: "reyes", points: 100, valid: true, reason: "¡Única! 100 pts" },
    { category: "ciudad", word: "Roma", canonical: "roma", points: 50, valid: true, reason: "Repetida: 50 pts" },
    { category: "animal", word: "Rana", canonical: "rana", points: 100, valid: true, reason: "¡Única! 100 pts" },
    { category: "fruta", word: "Rúcula", canonical: "rucula", points: 100, valid: true, reason: "¡Única! 100 pts" },
    { category: "comida", word: "Rosca", canonical: "rosca", points: 100, valid: true, reason: "¡Única! 100 pts" },
    { category: "profesion", word: "Radiólogo", canonical: "radiologo", points: 100, valid: true, reason: "¡Única! 100 pts" },
    { category: "cosa", word: "Reloj", canonical: "reloj", points: 50, valid: true, reason: "Repetida: 50 pts" },
    { category: "pelicula", word: "Rocky", canonical: "rocky", points: 100, valid: true, reason: "¡Única! 100 pts" }
  ];
  demoResults.p2.roundPoints = 800;
  demoResults.p2.frozenPoints = 800;

  return [
    { label: "🏠 Lobby", state: withPhase(base, { phase: "lobby", players: [{ id: "p1", name: "Tato", score: 0, ready: false }], letter: null, usedLetters: [] }) },
    { label: "🙋 Listos", state: withPhase(base, { phase: "ready", letter: null, usedLetters: [] }) },
    { label: "🎡 Ruleta", state: withPhase(base, { phase: "roulette", deadline: Date.now() + 4000 }) },
    { label: "⏱️ Cuenta 3-2-1", state: withPhase(base, { phase: "countdown", deadline: Date.now() + 3000 }) },
    { label: "✏️ Escribiendo", state: withPhase(base, { phase: "writing", myAnswers: fullAnswers, deadline: Date.now() + 150000 }) },
    { label: "⏰ Gracia 5 s", state: withPhase(base, { phase: "grace", bastaBy: "p2", gracePlayer: "p1", prevRoundWinner: "p1", deadline: Date.now() + 5000, myAnswers: fullAnswers }) },
    { label: "🧊 Bonus", state: withPhase(base, { phase: "bonus", bonusCategory: "superheroe", frozenPoints: { p1: 800, p2: 800, p3: 0 }, deadline: null }) },
    { label: "🏁 Fin de ronda", state: withPhase(base, { phase: "roundEnd", bastaBy: "p1", roundWinner: "p1", roundPoints: { p1: 800, p2: 800, p3: 0 }, results: demoResults }) },
    { label: "🏆 Podio final", state: withPhase(base, { phase: "gameOver", winner: "p1", podium: ["p1", "p2", "p3"] }) }
  ];
}

function startDemo() {
  demoMode = true;
  myName = "Tato";
  myId = "p1";
  roomCode = "DEMO";
  var bar = $("demoBar");
  if (bar) bar.hidden = false;
  var btns = $("demoButtons");
  var list = demoStates();
  if (btns) {
    btns.innerHTML = "";
    list.forEach(function (item, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = item.label;
      b.addEventListener("click", function () { showDemo(i); });
      btns.appendChild(b);
    });
  }
  showDemo(0);
}

function showDemo(i) {
  var list = demoStates();
  demoIndex = ((i % list.length) + list.length) % list.length;
  var btns = $("demoButtons");
  if (btns) {
    Array.prototype.forEach.call(btns.children, function (b, j) {
      b.classList.toggle("active", j === demoIndex);
    });
  }
  onState(list[demoIndex].state);
}

/* ------------------------------------------------------------------ */
/* Botón de sonido / arranque                                          */
/* ------------------------------------------------------------------ */

function updateSoundBtn() {
  var b = $("soundBtn");
  if (!b) return;
  b.textContent = muted ? "🔇" : "🔊";
  b.className = "sound-btn" + (muted ? " muted" : "");
}

function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(LS_MUTED, muted ? "1" : "0"); } catch (e) {}
  if (muted) { stopSpeaking(); }
  if (musicGain) musicGain.gain.value = muted ? 0 : MUSIC_LEVEL;
  if (sfxGain) sfxGain.gain.value = muted ? 0 : SFX_LEVEL;
  updateSoundBtn();
  toast(muted ? "🔇 Sonido apagado." : "🔊 Sonido encendido.");
}

function init() {
  updateSoundBtn();
  checkAppVersion(); // si hay versión nueva en el servidor, avisar con banner
  document.addEventListener("pageshow", function () { checkAppVersion(); });
  var sb = $("soundBtn");
  if (sb) sb.addEventListener("click", function () { ensureAudio(); toggleMute(); });
  // Desbloquear el audio y la voz en iOS con cada toque: en Safari los
  // speak() fuera de un gesto se descartan en silencio, así que cada
  // tap reintenta el desbloqueo (unlockVoice es barato tras el primero).
  document.addEventListener("pointerdown", function () {
    ensureAudio();
    unlockVoice();
  });
  document.addEventListener("touchstart", function () {
    ensureAudio();
    unlockVoice();
  }, { passive: true });
  var params = new URLSearchParams(window.location.search || "");
  if (params.get("demo") === "1") { startDemo(); return; }
  if (!apiBase()) {
    showConfigWarning();
    render({ phase: "lobby", players: [], code: "" });
    return;
  }
  var preset = (params.get("sala") || "").toUpperCase();
  render({ phase: "lobby", players: [], code: "" });
  if (preset) {
    var c = $("codeInput");
    if (c) c.value = preset;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* Expuesto solo para pruebas locales (no afecta el juego). */
window.__BASTA__ = {
  renderState: onState,
  demoStates: demoStates,
  buildRoundEndAnnouncement: buildRoundEndAnnouncement,
  buildGameOverAnnouncement: buildGameOverAnnouncement,
  speak: speak,
  testVoice: testVoice,
  unlockVoice: unlockVoice,
  playApplause: playApplause,
  playFireworksSound: playFireworksSound,
  appVersion: APP_VERSION,
  checkAppVersion: checkAppVersion,
  voiceStatus: function () { return voiceStatus; },
  isVoiceUnlocked: function () { return voiceUnlocked; }
};

