// Stub de speechSynthesis que imita el comportamiento documentado de
// Safari en iOS (WebKit) — la base de la reproducción del fallo de voz:
//  1. getVoices() devuelve [] hasta que se dispara `voiceschanged`
//     (las voces se cargan de forma asíncrona).
//  2. speak() fuera de un gesto del usuario (tap/click) se descarta EN
//     SILENCIO: sin evento, sin error, sin sonido. Solo el primer
//     speak() que corre sincrónicamente dentro de un gesto desbloquea
//     la voz; a partir de ahí los siguientes funcionan.
//  3. Un utterance descartado no dispara onstart/onend/onerror: el
//     código que espera esos eventos nunca se entera del fallo.
//
// Uso: const ios = makeIOSSPEECH({ voicesDelayMs: 800 });
//   - ios.setGesture(true) mientras se despacha un tap; luego false.
//   - ios.loadVoices() simula la llegada de las voces (o se dispara
//     solo tras voicesDelayMs con ios.armVoices()).
//   - ios.delivered: textos que sí sonaron. ios.dropped: descartados.

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
  const handlers = {};

  const synth = {
    get speaking() { return speaking; },
    get paused() { return paused; },
    get pending() { return false; },
    getVoices() { return voicesLoaded ? VOICES.slice() : []; },
    set onvoiceschanged(fn) { handlers.voiceschanged = fn; },
    get onvoiceschanged() { return handlers.voiceschanged || null; },
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener(type, fn) { if (handlers[type] === fn) delete handlers[type]; },
    speak(u) {
      // Regla de WebKit en iOS: sin gesto previo, se descarta en silencio.
      if (!unlocked && !gesture) { dropped.push(u.text); return; }
      // Sin voces cargadas, el utterance no tiene voz que lo lea.
      if (!voicesLoaded) { dropped.push(u.text); return; }
      unlocked = true;
      speaking = true;
      delivered.push(u.text);
      // Simular duración real de la locución: onstart al empezar,
      // onend al terminar.
      const dur = Math.min(1500, Math.max(30, (u.text || "").length * 30));
      setTimeout(() => { if (typeof u.onstart === "function") { try { u.onstart(); } catch (e) {} } }, 5);
      setTimeout(() => {
        speaking = false;
        if (typeof u.onend === "function") { try { u.onend(); } catch (e) {} }
      }, dur);
    },
    cancel() { speaking = false; },
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
    setGesture(v) { gesture = !!v; },
    loadVoices,
    armVoices() { setTimeout(loadVoices, voicesDelayMs); },
  };
}

module.exports = { makeIOSSPEECH, Utterance };
