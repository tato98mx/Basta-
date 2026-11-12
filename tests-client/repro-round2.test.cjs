// REPRO de los fallos reportados por Tato el 2026-11-11 en partida real
// contra Ledya (2 jugadores, ronda 2 letra C):
//  1) Al empezar el round 2, las palabras de la ronda 1 seguían en los casilleros.
//  2) En el round 2 llenaron todo y el botón ¡BASTA! no se podía tocar.
// Se ejecuta con `node --test tests-client/repro-round2.test.cjs`.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.cjs");

function stageHtml(app) {
  return app.__els__.stage ? app.__els__.stage.innerHTML : "";
}

function typeWord(app, catId, word) {
  const input = app.__els__["cat-" + catId];
  assert.ok(input, `debe existir el input cat-${catId}`);
  input.value = word;
  for (const fn of (input._listeners.input || [])) fn.call(input);
}

function writingState(app, patch) {
  const base = app.__BASTA__.demoStates().find((d) => d.label.includes("Escribiendo"));
  const s = JSON.parse(JSON.stringify(base.state));
  Object.assign(s, patch);
  return s;
}

const ROUND1_WORDS = ["Rosa", "Ramírez", "Roma", "Rata", "Rábano", "Ramen", "Reportero", "Reloj", "Ratatouille"];

describe("REPRO bug 1: palabras de la ronda anterior en los casilleros", () => {
  it("al arrancar la ronda 2 los casilleros deben estar VACÍOS", () => {
    const app = loadApp("?demo=1");
    // Ronda 1: escribo las 7 palabras con R.
    app.__BASTA__.renderState(writingState(app, { myAnswers: {
      nombre: "Rosa", apellido: "Ramírez", ciudad: "Roma", animal: "Rata",
      fruta: "Rábano", comida: "Ramen", cosa: "Reloj",
    } }));
    assert.equal(app.__els__.myProgress.textContent, "7 / 7 casillas");
    // Fin de ronda 1 y arranque de la ronda 2 con letra C.
    // El servidor limpia myAnswers al empezar la ronda (beginRound).
    const end = app.__BASTA__.demoStates().find((d) => d.label.includes("Fin de ronda"));
    app.__BASTA__.renderState(JSON.parse(JSON.stringify(end.state)));
    app.__BASTA__.renderState(writingState(app, {
      round: 2, letter: "C", myAnswers: {}, progress: { p1: 0, p2: 0 },
    }));
    const html = stageHtml(app);
    for (const w of ROUND1_WORDS) {
      assert.ok(!html.includes(`value="${w}"`), `el casillero NO debe traer la palabra vieja "${w}" en la ronda 2`);
    }
    assert.equal(app.__els__.myProgress.textContent, "0 / 7 casillas", "la ronda 2 debe empezar en 0/7");
  });
});

describe("REPRO bug 2: botón ¡BASTA! en la ronda 2", () => {
  it("tras reescribir las 7 casillas de la ronda 2 el botón debe habilitarse", () => {
    const app = loadApp("?demo=1");
    // Ronda 1 llena, fin de ronda, ronda 2 letra C con myAnswers vacío.
    app.__BASTA__.renderState(writingState(app, { myAnswers: {
      nombre: "Rosa", apellido: "Ramírez", ciudad: "Roma", animal: "Rata",
      fruta: "Rábano", comida: "Ramen", cosa: "Reloj",
    } }));
    const end = app.__BASTA__.demoStates().find((d) => d.label.includes("Fin de ronda"));
    app.__BASTA__.renderState(JSON.parse(JSON.stringify(end.state)));
    const r2 = writingState(app, { round: 2, letter: "C", myAnswers: {}, progress: { p1: 0, p2: 0 } });
    app.__BASTA__.renderState(r2);
    // El usuario reescribe cada casillero con palabra con C (seleccionar todo
    // y teclear encima de la palabra vieja). Entre palabra y palabra llegan
    // ecos del servidor con myAnswers todavía vacío (el otro jugador también
    // está escribiendo).
    const words = { nombre: "Carlos", apellido: "Castillo", ciudad: "Cancún", animal: "calamar", fruta: "cereza", comida: "ceviche", cosa: "caja" };
    for (const [cat, word] of Object.entries(words)) {
      typeWord(app, cat, word);
      const stale = JSON.parse(JSON.stringify(r2));
      stale.myAnswers = {};
      app.__BASTA__.renderState(stale);
    }
    assert.equal(app.__els__.myProgress.textContent, "7 / 7 casillas", "con las 7 palabras nuevas el contador debe decir 7/7");
    assert.equal(app.__els__.bastaBtn.disabled, false, "con 7/7 el botón ¡BASTA! debe habilitarse en la ronda 2");
  });

  it("si toco ¡BASTA! y el servidor lo rechaza, el botón debe volver a habilitarse", () => {
    // Regresión del diseño que dejaba el botón muerto: el handler de click
    // ponía btn.disabled = true y solo un estado nuevo lo revivía. Si el
    // servidor rechaza el basta (eco de error), el jugador se queda sin
    // botón hasta que alguien más escriba. El click NO debe auto-bloquear
    // el botón: el bloqueo lo decide el cambio de fase del servidor.
    const app = loadApp("?demo=1");
    app.__BASTA__.renderState(writingState(app, { myAnswers: {} }));
    const words = { nombre: "Carlos", apellido: "Castillo", ciudad: "Cancún", animal: "calamar", fruta: "cereza", comida: "ceviche", cosa: "caja" };
    for (const [cat, word] of Object.entries(words)) typeWord(app, cat, word);
    const btn = app.__els__.bastaBtn;
    assert.equal(btn.disabled, false, "antes del click el botón debe estar habilitado");
    for (const fn of (btn._listeners.click || [])) fn.call(btn);
    // Sin cambio de fase del servidor (el basta no se concretó), el botón
    // debe seguir habilitado para reintentarlo.
    assert.equal(btn.disabled, false, "tras un click sin cambio de fase el botón debe seguir habilitado");
  });
});

describe("REPRO bug 2c (A3): envío perdido + eco viejo NO debe borrar la palabra", () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  it("si el envío se pierde, el eco viejo del servidor no borra mi palabra ni mata el botón", async () => {
    const app = loadApp("?demo=1");
    // Ronda 2, letra C, servidor sin nada mío todavía.
    app.__BASTA__.renderState(writingState(app, {
      round: 2, letter: "C", myAnswers: {}, progress: { p1: 0, p2: 0 },
    }));
    // Escribo "calamar" en Animal: el cliente programa el envío a 300 ms.
    typeWord(app, "animal", "calamar");
    assert.equal(app.__els__.myProgress.textContent, "1 / 7 casillas");
    await sleep(400); // el timer dispara send() (en demo no sale a la red:
    // simula el envío perdido: el servidor nunca lo recibió).
    // Llega un estado del servidor (actividad del otro jugador) con el
    // valor VIEJO de mi casilla (vacío): antes borraba "calamar" del draft
    // sin tocar el input, y el botón quedaba muerto con la casilla llena.
    app.__BASTA__.renderState(writingState(app, {
      round: 2, letter: "C", myAnswers: { animal: "" }, progress: { p1: 0, p2: 1 },
    }));
    assert.equal(app.__els__["cat-animal"].value, "calamar", "el input debe seguir mostrando calamar");
    assert.equal(app.__els__.myProgress.textContent, "1 / 7 casillas", "el draft debe conservar calamar");
    // Completo las 7 y el botón debe habilitarse.
    const words = { nombre: "Carlos", apellido: "Castillo", ciudad: "Cancún", fruta: "cereza", comida: "ceviche", cosa: "caja" };
    for (const [cat, w] of Object.entries(words)) typeWord(app, cat, w);
    assert.equal(app.__els__.myProgress.textContent, "7 / 7 casillas");
    assert.equal(app.__els__.bastaBtn.disabled, false, "con 7/7 el botón ¡BASTA! debe habilitarse");
  });
});
