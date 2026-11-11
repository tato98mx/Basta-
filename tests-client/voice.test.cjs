// Pruebas de voz de Basta con un stub de speechSynthesis estilo iOS:
// las voces llegan de forma asíncrona y speak() fuera de un gesto se
// descarta en silencio (ver tests-client/ios-speech-stub.cjs).
// Se ejecuta con `node --test tests-client/voice.test.cjs` (desde la raíz).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.cjs");
const { makeIOSSPEECH } = require("./ios-speech-stub.cjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Textos audibles (sin el "¡Hola!" silencioso del desbloqueo).
const audible = (ios) => ios.delivered.filter((t) => t !== "¡Hola!");

function roundEndState() {
  return {
    code: "TEST", phase: "roundEnd", round: 1, totalRounds: 3,
    roundWinner: "p1",
    roundPoints: { p1: 750, p2: 600, p3: 450 },
    players: [
      { id: "p1", name: "Tato", score: 1000 },
      { id: "p2", name: "Milly", score: 600 },
      { id: "p3", name: "Ledya", score: 450 },
    ],
    results: {}, categories: [], bonusCategories: [],
  };
}

describe("voz en iOS ?v=3: desbloqueo verificado y recuperación", () => {
  it("si el desbloqueo silencioso no cuenta, el anuncio no se pierde: el siguiente gesto lo reintenta audible", async () => {
    // Variante del stub: WebKit descarta el utterance a volumen 0 incluso
    // dentro de un gesto (hipótesis: el desbloqueo silencioso no vale).
    // ?v=2 ponía voiceUnlocked = true sin verificar y perdía el anuncio;
    // ?v=3 no desbloquea hasta ver onstart y reintenta audible.
    const ios = makeIOSSPEECH({ voicesDelayMs: 0, dropSilentUnlock: true });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;

    // Primer gesto con la cola vacía: el desbloqueo silencioso se descarta.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(200);
    assert.equal(BASTA.isVoiceUnlocked(), false, "?v=3 no debe dar por hecho el desbloqueo sin onstart");
    assert.deepEqual(audible(ios), [], "el desbloqueo silencioso descartado no debe sonar");

    // Llega el anuncio de fin de ronda (fuera de gesto): ?v=3 lo encola
    // SIN intentarlo (no se descarta, no se pierde).
    BASTA.renderState(roundEndState());
    await sleep(2000);
    assert.deepEqual(audible(ios), [], "sin desbloqueo verificado no debe sonar todavía");
    assert.equal(BASTA.isVoiceUnlocked(), false);

    // Segundo gesto: el desbloqueo se reintenta AUDIBLE y arranca.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(4000);
    assert.equal(BASTA.isVoiceUnlocked(), true, "el reintento audible debe verificar el desbloqueo");
    const said = audible(ios).join(" ");
    assert.ok(said.includes("El ganador de la ronda es Tato, con 750 puntos."), `debió decir al ganador, dijo: ${said}`);
    assert.ok(said.includes("En segundo lugar, Milly, con 600 puntos."), `debió decir el 2º, dijo: ${said}`);
    assert.ok(said.includes("En tercer lugar, Ledya, con 450 puntos."), `debió decir el 3º, dijo: ${said}`);
  });

  it("si un speak fuera de gesto deja la cola atorada, el código nuevo no habla antes de desbloquear y se recupera", async () => {
    // Variante del stub: un speak() fuera de gesto queda COLGADO como
    // utterance actual (speaking=true sin eventos) y bloquea la cola
    // hasta cancel(). ?v=2 intentaba el anuncio antes del primer gesto
    // y se atoraba; ?v=3 no habla sin desbloqueo verificado.
    const ios = makeIOSSPEECH({ voicesDelayMs: 0, stuckOutsideGesture: true });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;

    // El anuncio llega antes de cualquier gesto: ?v=3 lo encola sin
    // intentarlo, así que nada queda colgado en el motor.
    BASTA.renderState(roundEndState());
    await sleep(500);
    assert.equal(ios.synth.speaking, false, "sin desbloqueo no debe haber nada sonando ni colgado");
    assert.deepEqual(audible(ios), [], "sin gesto no debe sonar nada todavía");

    // Primer gesto: desbloquea y la cola se vacía con el anuncio completo.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(4000);
    const said = audible(ios).join(" ");
    assert.ok(said.includes("El ganador de la ronda es Tato, con 750 puntos."), `debió decir al ganador, dijo: ${said}`);
    assert.ok(said.includes("En segundo lugar, Milly, con 600 puntos."), `debió decir el 2º, dijo: ${said}`);
    assert.ok(said.includes("En tercer lugar, Ledya, con 450 puntos."), `debió decir el 3º, dijo: ${said}`);
  });

  it("si la voz tarda en arrancar (onstart lento), el anuncio se dice UNA sola vez, no tres", async () => {
    // Regresión del fallo visto en vivo (sala ACQA, 2026-11-11): con una
    // voz lenta (onstart > 1.5 s, como espeak en Linux o la primera voz
    // tras el desbloqueo), el watchdog reencolaba el anuncio y cada
    // texto se decía 3 veces; la cola se atascaba y los anuncios de las
    // rondas siguientes y el podio no llegaban. El watchdog debe esperar
    // mientras el motor sigue speaking/pending (el utterance está vivo).
    const ios = makeIOSSPEECH({ voicesDelayMs: 0, slowStartMs: 2500 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;

    // Desbloqueo por gesto (el "¡Hola!" también arranca lento, pero
    // llega su onstart y verifica el desbloqueo).
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(3500);
    assert.equal(BASTA.isVoiceUnlocked(), true, "el desbloqueo debe verificarse aunque el onstart tarde");

    // Anuncio de fin de ronda (2 frases): debe sonar cada una UNA vez.
    BASTA.renderState(roundEndState());
    await sleep(9000);
    const said = audible(ios);
    const count = (text) => said.filter((t) => t === text).length;
    assert.equal(count("El ganador de la ronda es Tato, con 750 puntos."), 1, `el ganador debe decirse 1 vez, se dijo: ${JSON.stringify(said)}`);
    assert.equal(count("En segundo lugar, Milly, con 600 puntos."), 1, `el 2º debe decirse 1 vez, se dijo: ${JSON.stringify(said)}`);
    assert.equal(count("En tercer lugar, Ledya, con 450 puntos."), 1, `el 3º debe decirse 1 vez, se dijo: ${JSON.stringify(said)}`);
  });

  it("'Probar voz' muestra éxito cuando la voz responde y fallo cuando no responde", async () => {
    // Éxito: con voces y gesto, el ejemplo suena y el estado es "ok".
    const iosOk = makeIOSSPEECH({ voicesDelayMs: 0 });
    iosOk.loadVoices();
    const appOk = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: iosOk });
    const btnOk = appOk.__els__.voiceTestBtn;
    iosOk.setGesture(true);
    try { btnOk._listeners.click[0](); } finally { iosOk.setGesture(false); }
    await sleep(2500);
    assert.equal(appOk.__BASTA__.voiceStatus(), "ok", "con voz funcionando el estado debe ser ok");
    assert.ok((appOk.__els__.voiceStatus.textContent || "").includes("funcionando"), "la pantalla debe decir que la voz funciona");

    // Fallo: el desbloqueo silencioso se descarta y no hay segundo gesto.
    const iosBad = makeIOSSPEECH({ voicesDelayMs: 0, dropSilentUnlock: true });
    iosBad.loadVoices();
    const appBad = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: iosBad });
    const btnBad = appBad.__els__.voiceTestBtn;
    iosBad.setGesture(true);
    try { btnBad._listeners.click[0](); } finally { iosBad.setGesture(false); }
    await sleep(4500);
    assert.equal(appBad.__BASTA__.voiceStatus(), "blocked", "si la voz no responde el estado debe ser blocked");
    assert.ok((appBad.__els__.voiceStatus.textContent || "").includes("no respondió"), "la pantalla debe avisar que la voz no respondió");
  });
});
describe("voz en iOS: desbloqueo por gesto y cola con reintento", () => {
  it("el anuncio de fin de ronda no se pierde si llega antes del primer gesto: se dice tras el tap", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;

    // Sin gesto previo: el anuncio se intenta, se descarta en silencio y
    // queda en cola (no se pierde).
    BASTA.renderState(roundEndState());
    assert.deepEqual(audible(ios), [], "sin gesto no debe sonar nada todavía");

    // Pasa el watchdog (1500 ms) sin onstart: el texto se reencola.
    await sleep(2000);
    assert.deepEqual(audible(ios), [], "tras el descarte sigue sin sonar");

    // Tap del usuario (gesto): desbloquea y la cola se vacía.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(3500);
    const said = audible(ios).join(" ");
    assert.ok(said.includes("El ganador de la ronda es Tato, con 750 puntos."), `debió decir al ganador, dijo: ${said}`);
    assert.ok(said.includes("En segundo lugar, Milly, con 600 puntos."), `debió decir el 2º, dijo: ${said}`);
    assert.ok(said.includes("En tercer lugar, Ledya, con 450 puntos."), `debió decir el 3º, dijo: ${said}`);
  });

  it("si las voces aún no cargaron, se espera a voiceschanged; suena tras el siguiente gesto", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 60000 });
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;
    BASTA.speak("¡La letra es R!");
    await sleep(400);
    assert.deepEqual(audible(ios), [], "sin voces no debe sonar todavía");
    ios.loadVoices();
    await sleep(400);
    assert.deepEqual(audible(ios), [], "cargar voces no basta en iOS: falta el gesto que desbloquea");
    // El siguiente tap desbloquea la voz y vacía la cola.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(2500);
    assert.ok(audible(ios).includes("¡La letra es R!"), `debió sonar tras el gesto, sonó: ${audible(ios)}`);
  });

  it("con el sonido silenciado persistido no suena nada; 'Probar voz' quita el silencio y dice el ejemplo", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", {
      apiUrl: "https://basta.ydfz296yrr.workers.dev",
      speech: ios,
      storage: { "basta-muted": "1" },
    });
    const BASTA = app.__BASTA__;
    BASTA.speak("¡La letra es R!");
    await sleep(300);
    assert.deepEqual(audible(ios), [], "silenciado no debe sonar");

    // El botón "Probar voz" está en el lobby y al tocarlo (gesto) habla.
    const stageHtml = app.__els__.stage ? app.__els__.stage.innerHTML : "";
    assert.ok(stageHtml.includes('id="voiceTestBtn"'), "el lobby debe tener el botón Probar voz");
    assert.ok(stageHtml.includes("Probar voz"), "el botón debe decir Probar voz");
    const btn = app.__els__.voiceTestBtn;
    assert.ok(btn && btn._listeners && btn._listeners.click && btn._listeners.click.length === 1, "el botón debe tener su handler");
    ios.setGesture(true);
    try { btn._listeners.click[0](); } finally { ios.setGesture(false); }
    await sleep(2500);
    assert.equal(app.__store__["basta-muted"], "0", "Probar voz debe quitar el silencio persistido");
    const said = audible(ios).join(" ");
    assert.ok(said.includes("El ganador de la ronda es Tato, con 900 puntos."), `debió decir el ejemplo, dijo: ${said}`);
    assert.ok(said.includes("En segundo lugar, Milly, con 600 puntos."), `debió decir el 2º del ejemplo, dijo: ${said}`);
  });

  it("las frases largas se parten en oraciones y se dicen en orden", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;
    // Desbloquear con un gesto primero.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    BASTA.speak("El ganador de la ronda es Tato, con 750 puntos. En segundo lugar, Milly, con 600 puntos. En tercer lugar, Ledya, con 450 puntos.");
    await sleep(4000);
    const said = audible(ios);
    assert.equal(said.length, 3, `debió partirse en 3 oraciones, dijo: ${JSON.stringify(said)}`);
    assert.ok(said.every((t) => t.length <= 100), "cada parte debe ser corta (límite iOS ~15 s)");
    assert.equal(said.join(" "), "El ganador de la ronda es Tato, con 750 puntos. En segundo lugar, Milly, con 600 puntos. En tercer lugar, Ledya, con 450 puntos.");
  });
});
