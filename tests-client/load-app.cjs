// Carga app.js (script clásico de navegador) en una VM de Node con un DOM
// mínimo, para probar el render y los constructores de anuncios sin
// navegador. Lo usan tests-client/smoke.test.cjs y worker/tests/e2e-local.mjs.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class El {
  constructor(tag = "div") {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.style = {};
    this._html = "";
    this.textContent = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this._attrs = {};
    this._classes = new Set();
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) this._classes.add(c);
        else this._classes.delete(c);
      },
      contains: (c) => this._classes.has(c),
    };
    this._listeners = {};
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  focus() {}
}

/** Carga app.js con `?demo=1` o sin demo según `search`. Devuelve el
 *  sandbox: sandbox.__BASTA__ trae los helpers expuestos y
 *  sandbox.__els__ es el mapa id → elemento (para leer stage.innerHTML).
 *  `opts` (opcional): { apiUrl, speech, appPath }.
 *   - apiUrl: valor de window.GAME_API_URL antes de cargar app.js.
 *   - speech: { synth, Utterance } para instalar window.speechSynthesis
 *     y SpeechSynthesisUtterance (p. ej. un stub estilo iOS).
 *   - appPath: ruta del app.js a cargar (por defecto ../app.js).
 *   - storage: valores iniciales de localStorage { clave: valor }.
 *  Los listeners de document quedan registrados y se pueden disparar con
 *  sandbox.__dispatch__(type). */
function loadApp(search = "", opts = {}) {
  const appFile = opts.appPath || path.join(__dirname, "..", "app.js");
  const code = fs.readFileSync(appFile, "utf8");
  const els = {};
  const docListeners = {};
  const documentStub = {
    readyState: "complete",
    getElementById: (id) => {
      if (!els[id]) els[id] = new El();
      return els[id];
    },
    createElement: (tag) => new El(tag),
    addEventListener: (type, fn) => {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
    removeEventListener: (type, fn) => {
      const arr = docListeners[type] || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  const store = {};
  if (opts.storage) Object.assign(store, opts.storage);
  const localStorageStub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    // El bucle de UI (setInterval 200 ms) no se ejecuta en pruebas: el
    // render se verifica directamente y el intervalo impediría salir.
    setInterval: () => 0,
    clearInterval: () => {},
    URLSearchParams,
    document: documentStub,
    localStorage: localStorageStub,
  };
  sandbox.window = sandbox;
  sandbox.location = { search };
  if (opts.apiUrl) sandbox.GAME_API_URL = opts.apiUrl;
  if (opts.fetch) sandbox.fetch = opts.fetch;
  if (opts.speech) {
    sandbox.speechSynthesis = opts.speech.synth;
    sandbox.SpeechSynthesisUtterance = opts.speech.Utterance;
  }
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "app.js" });
  sandbox.__els__ = els;
  sandbox.__doc__ = documentStub;
  sandbox.__store__ = store;
  sandbox.__docListeners__ = docListeners;
  sandbox.__dispatch__ = (type, ev) => {
    for (const fn of (docListeners[type] || []).slice()) fn(ev || {});
  };
  return sandbox;
}

module.exports = { loadApp, El };
