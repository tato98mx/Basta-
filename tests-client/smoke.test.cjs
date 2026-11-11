// Smoke del cliente de Basta: render de cada fase con un DOM mínimo y
// verificación de los textos de los anuncios de voz.
// Se ejecuta con `node --test tests-client/smoke.test.cjs` (desde la raíz).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app.cjs");

function stageHtml(app) {
  return app.__els__.stage ? app.__els__.stage.innerHTML : "";
}

describe("render de fases (demo)", () => {
  it("cada fase del demo renderiza su pantalla", () => {
    const app = loadApp("?demo=1");
    const BASTA = app.__BASTA__;
    assert.ok(BASTA, "app.js debe exponer window.__BASTA__");
    const states = BASTA.demoStates();
    assert.ok(states.length >= 9, `el demo debe tener 9 fases, tiene ${states.length}`);
    const markers = {
      "Lobby": "Crear sala",
      "Listos": "¡Listo a jugar!",
      "Ruleta": "RULETA",
      "Cuenta": "PREPARADOS",
      "Escribiendo": "¡BASTA!",
      "Gracia": "GRACIA",
      "Bonus": "BONUS",
      "Fin de ronda": "FIN DE LA RONDA",
      "Podio": "FIN DEL JUEGO",
    };
    for (const { label, state } of states) {
      BASTA.renderState(state);
      const html = stageHtml(app);
      const key = Object.keys(markers).find((k) => label.includes(k));
      assert.ok(key, `sin marcador esperado para ${label}`);
      assert.ok(
        html.includes(markers[key]),
        `la fase "${label}" debería mostrar "${markers[key]}"`,
      );
    }
  });

  it("la pantalla de escritura muestra las 9 categorías y el botón ¡BASTA!", () => {
    const app = loadApp("?demo=1");
    const writing = app.__BASTA__.demoStates().find((d) => d.label.includes("Escribiendo"));
    app.__BASTA__.renderState(writing.state);
    const html = stageHtml(app);
    for (const label of ["Nombre", "Apellido", "Ciudad", "Animal", "Fruta", "Comida", "Profesión", "Cosa", "Película"]) {
      assert.ok(html.includes(label), `falta la categoría ${label}`);
    }
    assert.ok(html.includes("¡BASTA!"));
    assert.ok(html.includes("LETRA R"));
  });

  it("el podio muestra al ganador EN GRANDE con medallas", () => {
    const app = loadApp("?demo=1");
    const over = app.__BASTA__.demoStates().find((d) => d.label.includes("Podio"));
    app.__BASTA__.renderState(over.state);
    const html = stageHtml(app);
    assert.ok(html.includes("Tato"));
    assert.ok(html.includes("🥇") && html.includes("🥈") && html.includes("🥉"));
    assert.ok(html.includes("Revancha"));
  });
});

describe("borrador local vs eco del servidor (carrera de sincronización)", () => {
  // Regresión del bug visto en vivo: al teclear rápido, el eco del servidor
  // (myAnswers desfasado, aún sin mi palabra) pisaba el borrador local y el
  // contador no llegaba a 9/9 hasta cambiar la palabra. El tecleo local
  // pendiente de sincronizar debe sobrevivir a un estado con myAnswers viejo.
  function typeWord(app, catId, word) {
    const input = app.__els__["cat-" + catId];
    assert.ok(input, `debe existir el input cat-${catId}`);
    input.value = word;
    for (const fn of (input._listeners.input || [])) fn.call(input);
  }

  it("un eco desfasado del servidor no borra la palabra que acabo de escribir", () => {
    const app = loadApp("?demo=1");
    const writing = app.__BASTA__.demoStates().find((d) => d.label.includes("Escribiendo"));
    const fresh = JSON.parse(JSON.stringify(writing.state));
    fresh.myAnswers = {}; // el servidor aún no recibió nada mío
    app.__BASTA__.renderState(fresh);
    typeWord(app, "nombre", "natalia");
    assert.equal(app.__els__.myProgress.textContent, "1 / 9 casillas", "tras escribir 1 palabra el contador debe decir 1/9");
    // Llega un estado del servidor con myAnswers todavía vacío (eco viejo).
    const stale = JSON.parse(JSON.stringify(fresh));
    stale.myAnswers = {};
    app.__BASTA__.renderState(stale);
    assert.equal(app.__els__.myProgress.textContent, "1 / 9 casillas", "el eco desfasado no debe borrar mi palabra");
    const btn = app.__els__.bastaBtn;
    assert.ok(btn, "debe existir el botón ¡BASTA!");
    // 1/9: el botón sigue deshabilitado (no se puede cantar Basta aún).
    assert.equal(btn.disabled, true);
  });

  it("al escribir las 9 palabras el contador llega a 9/9 aunque lleguen ecos viejos", () => {
    const app = loadApp("?demo=1");
    const writing = app.__BASTA__.demoStates().find((d) => d.label.includes("Escribiendo"));
    const fresh = JSON.parse(JSON.stringify(writing.state));
    fresh.myAnswers = {};
    app.__BASTA__.renderState(fresh);
    const words = { nombre: "natalia", apellido: "navarro", ciudad: "noruega", animal: "nutria", fruta: "naranja", comida: "nachos", profesion: "notario", cosa: "nevera", pelicula: "narnia" };
    for (const [cat, word] of Object.entries(words)) {
      typeWord(app, cat, word);
      // Eco viejo del servidor entre palabra y palabra (como en partida real
      // con el otro jugador escribiendo a la vez).
      const stale = JSON.parse(JSON.stringify(fresh));
      stale.myAnswers = {};
      app.__BASTA__.renderState(stale);
    }
    assert.equal(app.__els__.myProgress.textContent, "9 / 9 casillas", "con las 9 palabras el contador debe decir 9/9");
    assert.equal(app.__els__.bastaBtn.disabled, false, "con 9/9 el botón ¡BASTA! debe habilitarse");
  });

  it("cuando el servidor ya tiene mi palabra, el eco la conserva", () => {
    const app = loadApp("?demo=1");
    const writing = app.__BASTA__.demoStates().find((d) => d.label.includes("Escribiendo"));
    const fresh = JSON.parse(JSON.stringify(writing.state));
    fresh.myAnswers = {};
    app.__BASTA__.renderState(fresh);
    typeWord(app, "nombre", "natalia");
    // El servidor ya recibió la palabra: el eco la trae y debe conservarse.
    const echoed = JSON.parse(JSON.stringify(fresh));
    echoed.myAnswers = { nombre: "natalia" };
    app.__BASTA__.renderState(echoed);
    assert.equal(app.__els__.myProgress.textContent, "1 / 9 casillas");
  });
});

describe("aviso de versión nueva (anti-caché ?v=4)", () => {
  const fetchVersion = (v) => () => Promise.resolve({ json: () => Promise.resolve({ version: v }) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  it("si el servidor reporta una versión mayor, aparece el banner de actualización", async () => {
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", fetch: fetchVersion(5) });
    // El stub El arranca con hidden=false; simular el atributo hidden del HTML
    // antes de que se resuelva la promesa de checkAppVersion().
    const banner = app.__doc__.getElementById("updateBanner");
    banner.hidden = true;
    await sleep(100);
    assert.equal(banner.hidden, false, "con versión 5 en el servidor debe aparecer el banner");
    assert.ok(app.__BASTA__.appVersion === 4, "la app cargada es la v4");
  });

  it("si el servidor reporta la misma versión, no aparece el banner", async () => {
    const app = loadApp("", { apiUrl: "https://basta.ydfz296yrr.workers.dev", fetch: fetchVersion(4) });
    const banner = app.__doc__.getElementById("updateBanner");
    banner.hidden = true;
    await sleep(100);
    assert.equal(banner.hidden, true, "con versión 4 no debe aparecer el banner");
  });
});

describe("puerta de Continuar entre rondas (cliente)", () => {
  it("la pantalla de fin de ronda muestra el botón Continuar y quién falta", () => {
    const app = loadApp("?demo=1");
    const end = app.__BASTA__.demoStates().find((d) => d.label.includes("Fin de ronda"));
    app.__BASTA__.renderState(end.state);
    const html = stageHtml(app);
    assert.ok(html.includes("➡️ Continuar"), "debe haber un botón grande Continuar");
    assert.ok(html.includes("Tato") && html.includes("Esperando"), "debe mostrar quién ya tocó y quién falta");
    assert.ok(html.includes("TODOS") && html.includes("Continuar"), "debe explicar que la ronda empieza cuando TODOS toquen Continuar");
    const btn = app.__els__.continueBtn;
    assert.ok(btn && btn._listeners && btn._listeners.click && btn._listeners.click.length === 1, "el botón Continuar debe tener su handler");
  });

  it("en la última ronda el botón dice Ver el podio final (misma regla)", () => {
    const app = loadApp("?demo=1");
    const end = app.__BASTA__.demoStates().find((d) => d.label.includes("Fin de ronda"));
    const last = JSON.parse(JSON.stringify(end.state));
    last.round = last.totalRounds;
    app.__BASTA__.renderState(last);
    const html = stageHtml(app);
    assert.ok(html.includes("🏆 Ver el podio final"), "en la última ronda debe decir Ver el podio final");
    assert.ok(!html.includes("➡️ Continuar"), "en la última ronda no debe decir Continuar");
  });
});

describe("texto del anuncio de fin de ronda (buildRoundEndAnnouncement)", () => {
  it("formato exacto del ejemplo con 3 jugadores", () => {
    const app = loadApp();
    const state = {
      code: "TEST",
      phase: "roundEnd",
      roundWinner: "p1",
      roundPoints: { p1: 750, p2: 600, p3: 450 },
      players: [
        { id: "p1", name: "Tato", score: 1000 },
        { id: "p2", name: "Milly", score: 600 },
        { id: "p3", name: "Ledya", score: 450 },
      ],
    };
    const text = app.__BASTA__.buildRoundEndAnnouncement(state);
    assert.equal(
      text,
      "El ganador de la ronda es Tato, con 750 puntos. En segundo lugar, Milly, con 600 puntos. En tercer lugar, Ledya, con 450 puntos.",
    );
  });

  it("el ganador usa puntos DE LA RONDA; 2º y 3º usan el TOTAL acumulado", () => {
    const app = loadApp();
    // Tato ganó la ronda con 300, pero Milly lleva más total acumulado.
    const state = {
      code: "TEST",
      phase: "roundEnd",
      roundWinner: "p1",
      roundPoints: { p1: 300, p2: 800, p3: 100 },
      players: [
        { id: "p1", name: "Tato", score: 500 },
        { id: "p2", name: "Milly", score: 1500 },
        { id: "p3", name: "Ledya", score: 700 },
      ],
    };
    const text = app.__BASTA__.buildRoundEndAnnouncement(state);
    assert.equal(
      text,
      "El ganador de la ronda es Tato, con 300 puntos. En segundo lugar, Milly, con 1500 puntos. En tercer lugar, Ledya, con 700 puntos.",
    );
  });

  it("con 2 jugadores solo se anuncian 2 (nada de tercer lugar)", () => {
    const app = loadApp();
    const state = {
      code: "TEST",
      phase: "roundEnd",
      roundWinner: "p1",
      roundPoints: { p1: 500, p2: 400 },
      players: [
        { id: "p1", name: "Tato", score: 900 },
        { id: "p2", name: "Ledya", score: 700 },
      ],
    };
    const text = app.__BASTA__.buildRoundEndAnnouncement(state);
    assert.equal(
      text,
      "El ganador de la ronda es Tato, con 500 puntos. En segundo lugar, Ledya, con 700 puntos.",
    );
    assert.ok(!text.includes("tercer"), "con 2 jugadores no debe haber tercer lugar");
  });

  it("el ganador de la ronda no se repite como segundo lugar", () => {
    const app = loadApp();
    // Tato ganó la ronda Y lleva el mayor total: el 2º debe ser otro.
    const state = {
      code: "TEST",
      phase: "roundEnd",
      roundWinner: "p1",
      roundPoints: { p1: 800, p2: 700, p3: 100 },
      players: [
        { id: "p1", name: "Tato", score: 2000 },
        { id: "p2", name: "Milly", score: 900 },
        { id: "p3", name: "Ledya", score: 800 },
      ],
    };
    const text = app.__BASTA__.buildRoundEndAnnouncement(state);
    assert.ok(text.startsWith("El ganador de la ronda es Tato, con 800 puntos."));
    assert.ok(text.includes("En segundo lugar, Milly, con 900 puntos."));
    assert.ok(text.includes("En tercer lugar, Ledya, con 800 puntos."));
    assert.equal((text.match(/Tato/g) || []).length, 1, "Tato debe aparecer una sola vez");
  });

  it("sin ganador de ronda no hay anuncio", () => {
    const app = loadApp();
    assert.equal(
      app.__BASTA__.buildRoundEndAnnouncement({ roundWinner: null, players: [] }),
      "",
    );
  });

  it("1 punto se dice en singular", () => {
    const app = loadApp();
    const state = {
      code: "TEST",
      phase: "roundEnd",
      roundWinner: "p1",
      roundPoints: { p1: 1, p2: 0 },
      players: [
        { id: "p1", name: "Tato", score: 1 },
        { id: "p2", name: "Ledya", score: 0 },
      ],
    };
    assert.equal(
      app.__BASTA__.buildRoundEndAnnouncement(state),
      "El ganador de la ronda es Tato, con 1 punto. En segundo lugar, Ledya, con 0 puntos.",
    );
  });
});

describe("texto del anuncio del ganador final (buildGameOverAnnouncement)", () => {
  it("anuncia al ganador con su total y al segundo lugar", () => {
    const app = loadApp();
    const state = {
      code: "TEST",
      phase: "gameOver",
      winner: "p1",
      players: [
        { id: "p1", name: "Tato", score: 1250 },
        { id: "p2", name: "Milly", score: 900 },
        { id: "p3", name: "Ledya", score: 400 },
      ],
    };
    assert.equal(
      app.__BASTA__.buildGameOverAnnouncement(state),
      "¡El ganador del juego es Tato, con 1250 puntos! En segundo lugar, Milly, con 900 puntos.",
    );
  });

  it("sin ganador no hay anuncio", () => {
    const app = loadApp();
    assert.equal(
      app.__BASTA__.buildGameOverAnnouncement({ winner: null, players: [] }),
      "",
    );
  });
});
