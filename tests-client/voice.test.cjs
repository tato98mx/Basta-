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
  it("el desbloqueo ?v=6 es audible: el primer gesto dice '¡Hola!' a volumen 1 y verifica el desbloqueo", async () => {
    // ?v=6: ya no hay desbloqueo silencioso (volumen 0): en el teléfono
    // de Tato se descartaba sin disparar onstart/onend/onerror. El
    // primer gesto dice "¡Hola!" AUDIBLE y su onstart verifica el
    // desbloqueo; el anuncio encolado se dice después.
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;

    // Capturar los utterances para verificar que ninguno es silencioso.
    const volumes = [];
    const origSpeak = ios.synth.speak.bind(ios.synth);
    ios.synth.speak = (u) => { volumes.push(u.volume); return origSpeak(u); };

    // El anuncio llega antes de cualquier gesto: se encola sin intentarlo.
    BASTA.renderState(roundEndState());
    await sleep(500);
    assert.deepEqual(audible(ios), [], "sin gesto no debe sonar todavía");
    assert.equal(BASTA.isVoiceUnlocked(), false);

    // Primer gesto: desbloqueo AUDIBLE y la cola se vacía.
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(4000);
    assert.equal(BASTA.isVoiceUnlocked(), true, "el desbloqueo audible debe verificarse con onstart");
    assert.ok(volumes.length > 0 && volumes.every((v) => v === 1), `ningún utterance debe ser silencioso (volumen 0), volúmenes: ${volumes}`);
    assert.ok(ios.delivered.includes("¡Hola!"), "el desbloqueo audible debe sonar");
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

    // Fallo (?v=6): el motor atora todo speak() sin eventos (como el
    // teléfono de Tato en CNWN): a los 8 s marca blocked con diagnóstico.
    const iosBad = makeIOSSPEECH({ voicesDelayMs: 0, dropAll: true });
    iosBad.loadVoices();
    const appBad = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: iosBad });
    const btnBad = appBad.__els__.voiceTestBtn;
    iosBad.setGesture(true);
    try { btnBad._listeners.click[0](); } finally { iosBad.setGesture(false); }
    await sleep(9000);
    assert.equal(appBad.__BASTA__.voiceStatus(), "blocked", "si la voz no responde el estado debe ser blocked");
    assert.ok((appBad.__els__.voiceStatus.textContent || "").includes("no respondió"), "la pantalla debe avisar que la voz no respondió");
    assert.ok((appBad.__els__.voiceDiag.textContent || "").includes("Paulina (mejorada)"), "el diagnóstico debe mostrar la voz elegida");
    assert.ok((appBad.__els__.voiceDiag.textContent || "").includes("Voces: 4"), "el diagnóstico debe mostrar el número de voces");
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

describe("voz ?v=6: testVoice audible directo, selección por puntaje y sin éxito falso", () => {
  it("'Probar voz' habla UN solo utterance audible directo en el tap, sin '¡Hola!' previo", async () => {
    // ?v=6: testVoice ya no llama a unlockVoice() ni encola por speak():
    // crea un solo utterance audible con el ejemplo, directo en el tap.
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;
    const btn = app.__els__.voiceTestBtn;
    ios.setGesture(true);
    try { btn._listeners.click[0](); } finally { ios.setGesture(false); }
    await sleep(2500);
    assert.equal(BASTA.voiceStatus(), "ok", "el ejemplo debe sonar y marcar ok");
    assert.ok(!ios.delivered.includes("¡Hola!"), `testVoice no debe decir "¡Hola!" antes, dijo: ${JSON.stringify(ios.delivered)}`);
    assert.equal(ios.delivered.length, 1, `debe ser UN solo utterance, dijo: ${JSON.stringify(ios.delivered)}`);
    assert.ok(ios.delivered[0].includes("El ganador de la ronda es Tato, con 900 puntos."), "el utterance debe ser el ejemplo completo");
    assert.ok(ios.delivered[0].includes("En segundo lugar, Milly, con 600 puntos."), "el ejemplo debe incluir el 2º lugar");
    assert.equal(BASTA.isVoiceUnlocked(), true, "el ejemplo audible desbloquea la voz para los anuncios");
  });

  it("la selección de voz puntúa Paulina mejorada es-MX primero (la que tiene Tato instalada)", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    assert.equal(app.__BASTA__.voiceName(), "Paulina (mejorada)", "con Paulina mejorada instalada debe elegirla");
    assert.ok((app.__els__.voiceDiag.textContent || "").includes("Paulina (mejorada)"), "el lobby debe mostrar la voz seleccionada");
    assert.ok((app.__els__.voiceDiag.textContent || "").includes("Voces: 4"), "el diagnóstico debe contar las voces");

    // Sin mejoradas: Paulina compacta antes que Mónica compacta.
    const iosCompact = makeIOSSPEECH({ voicesDelayMs: 0, voices: [
      { name: "Mónica", lang: "es-ES", voiceURI: "com.apple.voice.compact.es-ES.Monica", default: false, localService: true },
      { name: "Paulina", lang: "es-MX", voiceURI: "com.apple.voice.compact.es-MX.Paulina", default: false, localService: true },
    ] });
    iosCompact.loadVoices();
    const appCompact = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: iosCompact });
    assert.equal(appCompact.__BASTA__.voiceName(), "Paulina", "sin mejoradas debe elegir Paulina compacta es-MX");

    // Mónica mejorada es-ES antes que Paulina compacta es-MX.
    const iosMonica = makeIOSSPEECH({ voicesDelayMs: 0, voices: [
      { name: "Paulina", lang: "es-MX", voiceURI: "com.apple.voice.compact.es-MX.Paulina", default: false, localService: true },
      { name: "Mónica (mejorada)", lang: "es-ES", voiceURI: "com.apple.voice.enhanced.es-ES.Monica", default: false, localService: true },
    ] });
    iosMonica.loadVoices();
    const appMonica = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: iosMonica });
    assert.equal(appMonica.__BASTA__.voiceName(), "Mónica (mejorada)", "la mejorada es-ES debe ganar a la compacta es-MX");
  });

  it("el listener voiceschanged actualiza la voz cuando las voces llegan tarde", async () => {
    // En iOS getVoices() empieza vacío; ?v=6 agrega el listener
    // voiceschanged (antes solo se hacía polling).
    const ios = makeIOSSPEECH({ voicesDelayMs: 60000 });
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    assert.equal(app.__BASTA__.voiceName(), null, "sin voces cargadas no hay voz elegida");
    ios.loadVoices(); // dispara voiceschanged
    await sleep(200);
    assert.equal(app.__BASTA__.voiceName(), "Paulina (mejorada)", "al llegar las voces debe elegirse Paulina mejorada");
  });

  it("speakNow sin onstart nunca es éxito: reintenta 2 veces como máximo y no duplica", async () => {
    // Regresión ?v=6: antes, un temporizador a los 6 s+ marcaba
    // finishOnce(true) SIN onstart (éxito falso). Con el motor atorado
    // el anuncio debe fallar tras 2 reintentos y no sonar nunca.
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;
    // Desbloquear primero con un gesto (motor sano).
    ios.setGesture(true);
    try { app.__dispatch__("pointerdown", {}); } finally { ios.setGesture(false); }
    await sleep(1500);
    assert.equal(BASTA.isVoiceUnlocked(), true, "precondición: voz desbloqueada");

    // Ahora el motor se atora: todo speak() se descarta sin eventos.
    let speakCalls = 0;
    const origSpeak = ios.synth.speak.bind(ios.synth);
    ios.synth.speak = (u) => { speakCalls++; return origSpeak(u); };
    ios.setDropAll(true);
    BASTA.speak("¡La letra es R!");
    await sleep(7000);
    assert.equal(speakCalls, 3, `debe intentarse 1 vez + 2 reintentos, se intentó ${speakCalls} veces`);
    assert.ok(!ios.delivered.includes("¡La letra es R!"), "el anuncio atorado no debe sonar nunca");
    assert.equal(BASTA.speechQueueLength(), 0, "tras agotar reintentos la cola debe quedar vacía");
  });

  it("el punto de conexión muestra clase y título correctos (?v=6: el title siempre decía 'Sin conexión')", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;
    BASTA.setConnected(true);
    assert.equal(app.__els__.connDot.className, "conn-dot on", "conectado: punto verde");
    assert.equal(app.__els__.connDot.title, "Conectado", "conectado: título 'Conectado'");
    BASTA.setConnected(false);
    assert.equal(app.__els__.connDot.className, "conn-dot off", "sin conexión: punto rojo");
    assert.equal(app.__els__.connDot.title, "Sin conexión", "sin conexión: título 'Sin conexión'");
  });

  it("fin de ronda tiene botón 'Salir' que vuelve al lobby (?v=6: antes había que recargar)", async () => {
    const ios = makeIOSSPEECH({ voicesDelayMs: 0 });
    ios.loadVoices();
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", speech: ios });
    const BASTA = app.__BASTA__;
    BASTA.renderState(roundEndState());
    const stageHtml = app.__els__.stage ? app.__els__.stage.innerHTML : "";
    assert.ok(stageHtml.includes('id="leaveBtn"'), "fin de ronda debe tener el botón Salir");
    assert.ok(stageHtml.includes("Salir de la sala"), "el botón debe decir Salir de la sala");
    const lb = app.__els__.leaveBtn;
    assert.ok(lb && lb._listeners && lb._listeners.click && lb._listeners.click.length === 1, "el botón debe tener su handler");
    lb._listeners.click[0]();
    const afterHtml = app.__els__.stage ? app.__els__.stage.innerHTML : "";
    assert.ok(afterHtml.includes("¡A JUGAR AL BASTA!"), "tras Salir debe volver al lobby");
    assert.equal(app.__els__.connDot.className, "conn-dot off", "tras Salir el punto debe marcar sin conexión");
  });
});
