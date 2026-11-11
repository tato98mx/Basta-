// Stub de speechSynthesis que imita el comportamiento documentado de
// Safari en iOS (WebKit) — la base de la reproducción del fallo de voz.
// Modela, con una cola FIFO real (como el motor de WebKit):
//  1. getVoices() devuelve [] hasta que se dispara `voiceschanged`
//     (las voces se cargan de forma asíncrona).
//  2. speak() fuera de un gesto del usuario (tap/click), antes del
//     desbloqueo, se descarta EN SILENCIO: sin evento, sin error, sin
//     sonido. Solo el primer speak() que corre sincrónicamente dentro
//     de un gesto desbloquea la voz; a partir de ahí los siguientes
//     funcionan. Un utterance descartado no dispara onstart/onend/
//     onerror: el código que espera esos eventos nunca se entera.
//  3. Cola FIFO con bloqueo: un utterance que nunca arranca bloquea a
//     los que vienen detrás hasta que algo hace cancel().
//  4. Sin voces cargadas, el utterance no tiene voz que lo lea y se
//     descarta (como en ?v=2).
//
// Variantes (opts) para modelar riesgos reales de WebKit:
//  - dropSilentUnlock: true → un utterance a volumen 0 se descarta
//    incluso dentro de un gesto (hipótesis: WebKit no cuenta un
//    utterance silencioso como desbloqueo válido). El código debe
//    reintentarlo audible en el siguiente gesto.
//  - stuckOutsideGesture: true → un speak() fuera de gesto, en vez de
//    descartarse, queda COLGADO como utterance actual (speaking=true
//    para siempre, sin eventos) y bloquea la cola hasta cancel().
//    Modela el riesgo de "primer utterance colgado bloquea la cola".
//
// Uso: const ios = makeIOSSPEECH({ voicesDelayMs: 800 });
//   - ios.setGesture(true) mientras se despacha un tap; luego false.
//   - ios.loadVoices() simula la llegada de las voces (o se dispara
//     solo tras voicesDelayMs con ios.armVoices()).
//   - ios.delivered: textos que sí empezaron a sonar (al arrancar).
//     ios.dropped: descartados en silencio. ios.pendingCount(): en cola.

function Utterance(text) {
  this.text = String(text == null ? "" : text);
  this.lang = "";
  this.voice = null;
  this.rate = 1;
  this.pitch = 1;
  this.volume = 1;
  this.onstart = null;
  this.onend = null;
  this.onerror = null;
}

function makeIOSSPEECH(opts = {}) {
  const voicesDelayMs = opts.voicesDelayMs == null ? 800 : opts.voicesDelayMs;
  const dropSilentUnlock = !!opts.dropSilentUnlock;
  const stuckOutsideGesture = !!opts.stuckOutsideGesture;
  const VOICES = [
    { name: "Paulina", lang: "es-MX", voiceURI: "com.apple.speech.synthesis.voice.paulina", default: false, localService: true },
    { name: "Mónica", lang: "es-ES", voiceURI: "com.apple.speech.synthesis.voice.monica", default: false, localService: true },
  ];
  const delivered = [];
  const dropped = [];
  let voicesLoaded = false;
  let unlocked = false;
  let gesture = false;
  let speaking = false;
  let paused = false;
  let current = null; // utterance sonando ahora (o colgado)
  const pending = []; // cola FIFO de utterances en espera
  const handlers = {};

  function startNext() {
    if (current || !pending.length) return;
    const u = pending.shift();
    start(u);
  }

  function start(u) {
    current = u;
    speaking = true;
    delivered.push(u.text);
    const dur = Math.min(1500, Math.max(30, (u.text || "").length * 30));
    setTimeout(() => {
      if (current !== u) return; // ya se canceló
      if (typeof u.onstart === "function") { try { u.onstart(); } catch (e) {} }
    }, 5);
    setTimeout(() => {
      if (current !== u) return; // ya se canceló
      current = null;
      speaking = false;
      if (typeof u.onend === "function") { try { u.onend(); } catch (e) {} }
      startNext();
    }, dur);
  }

  const synth = {
    get speaking() { return speaking; },
    get paused() { return paused; },
    get pending() { return pending.length > 0; },
    getVoices() { return voicesLoaded ? VOICES.slice() : []; },
    set onvoiceschanged(fn) { handlers.voiceschanged = fn; },
    get onvoiceschanged() { return handlers.voiceschanged || null; },
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener(type, fn) { if (handlers[type] === fn) delete handlers[type]; },
    speak(u) {
      // Variante: un utterance silencioso no cuenta como desbloqueo.
      if (dropSilentUnlock && u.volume === 0) { dropped.push(u.text); return; }
      // Regla de WebKit en iOS: sin gesto previo, se descarta en silencio
      // (o, en la variante, queda colgado y bloquea la cola).
      if (!unlocked && !gesture) {
        if (stuckOutsideGesture) {
          if (!current) {
            current = u;
            speaking = true;
            // Sin eventos nunca: ni onstart, ni onend, ni onerror.
          } else {
            pending.push(u);
          }
          return;
        }
        dropped.push(u.text);
        return;
      }
      // Sin voces cargadas, el utterance no tiene voz que lo lea.
      if (!voicesLoaded) { dropped.push(u.text); return; }
      unlocked = true;
      if (current) { pending.push(u); return; }
      start(u);
    },
    cancel() {
      // cancel() limpia la cola entera y libera el utterance actual
      // (que dispara onerror "canceled" si lo tiene).
      const cur = current;
      current = null;
      pending.length = 0;
      speaking = false;
      if (cur && typeof cur.onerror === "function") {
        try { cur.onerror({ error: "canceled" }); } catch (e) {}
      }
    },
    resume() { paused = false; },
    pause() { paused = true; },
  };

  function loadVoices() {
    if (voicesLoaded) return;
    voicesLoaded = true;
    if (typeof handlers.voiceschanged === "function") {
      try { handlers.voiceschanged(); } catch (e) {}
    }
  }

  return {
    synth,
    Utterance,
    delivered,
    dropped,
    get unlocked() { return unlocked; },
    get voicesLoaded() { return voicesLoaded; },
    pendingCount() { return pending.length; },
    setGesture(v) { gesture = !!v; },
    loadVoices,
    armVoices() { setTimeout(loadVoices, voicesDelayMs); },
  };
}

module.exports = { makeIOSSPEECH, Utterance };
