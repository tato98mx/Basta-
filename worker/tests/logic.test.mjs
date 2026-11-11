// Tests de la lógica pura de Basta (src/game.ts) con node:test.
// Se ejecutan con `npm test` (node --test). No tocan red ni Cloudflare.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BONUS_ROTATION,
  CATEGORIES,
  CATEGORY_IDS,
  FREEZE_MS,
  GRACE_MS,
  MAX_PLAYERS,
  addPlayer,
  advance,
  canBasta,
  createGame,
  dictionaryStats,
  judgeAnswer,
  judgeBonus,
  levenshtein,
  maybeEnterReady,
  normalizeAnswer,
  pickLetter,
  publicState,
  rematch,
  setContinue,
  setReady,
  startGame,
  submitAnswers,
  submitBasta,
  submitBonusAnswer,
  tick,
} from "../src/game.ts";
import dict from "../src/dictionary.json" with { type: "json" };

/** RNG determinista que devuelve siempre el mismo valor. */
const constRng = (v) => () => v;
/** RNG que devuelve los valores de la lista en orden (y repite el último). */
function seqRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** Palabras del diccionario para una letra: idx 0 o 1 por categoría. */
function wordsFor(letter, idx = 0) {
  const out = {};
  for (const cat of CATEGORY_IDS) {
    const arr = dict.categories[cat][letter.toLowerCase()];
    assert.ok(arr && arr.length > idx, `sin palabra ${idx} para ${cat}/${letter}`);
    out[cat] = arr[Math.min(idx, arr.length - 1)];
  }
  return out;
}

/** Partida nueva en fase de escritura (ruleta + cuenta ya avanzadas). */
function writingGame(now = 1000, rng = constRng(0.5), totalRounds = 3) {
  const s = createGame("ABCD", { totalRounds });
  addPlayer(s, "Tato");
  addPlayer(s, "Ledya");
  maybeEnterReady(s);
  assert.equal(s.phase, "ready");
  assert.equal(setReady(s, "p1", { now, rng }).ok, true);
  assert.equal(s.phase, "ready", "no debe arrancar con solo 1 listo");
  assert.equal(setReady(s, "p2", { now, rng }).ok, true);
  assert.equal(s.phase, "roulette");
  const letter = s.letter;
  assert.ok(letter && /^[A-Z]$/.test(letter), `letra inválida: ${letter}`);
  tick(s, now + 4001, rng);
  assert.equal(s.phase, "countdown");
  tick(s, now + 7002, rng);
  assert.equal(s.phase, "writing");
  return s;
}

/** Llena las respuestas de un jugador (idx 0 o 1 del diccionario). */
function fillPlayer(s, playerId, idx = 0) {
  const words = wordsFor(s.letter, idx);
  assert.equal(submitAnswers(s, playerId, words).ok, true);
  return words;
}

/** Juega una ronda completa: ambos llenan, `bastaBy` canta ¡BASTA! y se
 *  resuelve la gracia si aparece. Devuelve el estado en roundEnd. */
function playRound(s, bastaBy, now = 1000, rng = constRng(0.5)) {
  fillPlayer(s, "p1", 0);
  fillPlayer(s, "p2", 1);
  assert.equal(submitBasta(s, bastaBy, { now }).ok, true, "el ¡BASTA! debería valer");
  if (s.phase === "grace") {
    // El ganador anterior termina con su gracia (o se acaba el tiempo).
    tick(s, now + GRACE_MS + 1, rng);
  }
  assert.equal(s.phase, "roundEnd", `fase inesperada: ${s.phase}`);
  return s;
}

describe("juez con diccionario", () => {
  it("palabra válida exacta: empieza con la letra y es de la categoría", () => {
    assert.deepEqual(judgeAnswer("rata", "animal", "R").valid, true);
    assert.deepEqual(judgeAnswer("Rosa", "nombre", "R").valid, true);
    assert.deepEqual(judgeAnswer("Roma", "ciudad", "R").valid, true);
  });

  it("palabra con la letra equivocada: 'No empieza con R'", () => {
    const j = judgeAnswer("gato", "animal", "R");
    assert.equal(j.valid, false);
    assert.equal(j.reason, "No empieza con R");
  });

  it("palabra de otra categoría: 'No es un animal' (mango es fruta)", () => {
    const j = judgeAnswer("mango", "animal", "M");
    assert.equal(j.valid, false);
    assert.equal(j.reason, "No es un animal");
  });

  it("tolera typos de 1 letra (Levenshtein ≤ 1): 'ratta' vale como 'rata'", () => {
    const j = judgeAnswer("ratta", "animal", "R");
    assert.equal(j.valid, true);
    assert.equal(j.canonical, "rata");
    assert.equal(levenshtein("ratta", "rata"), 1);
  });

  it("palabra inventada que no está en el diccionario", () => {
    const j = judgeAnswer("rimbombante", "animal", "R");
    assert.equal(j.valid, false);
    assert.equal(j.reason, "No está en el diccionario del juego");
  });

  it("normaliza acentos y mayúsculas", () => {
    assert.equal(normalizeAnswer("  RÁBANO!! "), "rabano");
    assert.equal(judgeAnswer("RÁBANO", "fruta", "R").valid, true);
  });

  it("respuesta en blanco es inválida con motivo 'Sin respuesta'", () => {
    const j = judgeAnswer("", "animal", "R");
    assert.equal(j.valid, false);
    assert.equal(j.reason, "Sin respuesta");
  });

  it("el bonus NO exige letra: 'superman' vale en Superhéroe, no en Deporte", () => {
    assert.equal(judgeBonus("superman", "superheroe").valid, true);
    const j = judgeBonus("superman", "deporte");
    assert.equal(j.valid, false);
    assert.equal(j.reason, "No es un deporte");
    assert.equal(judgeBonus("fútbol", "deporte").valid, true);
  });
});

describe("diccionario", () => {
  it("tiene más de 2000 palabras principales y más de 150 bonus", () => {
    const stats = dictionaryStats();
    assert.ok(stats.main >= 2000, `main=${stats.main}`);
    assert.ok(stats.bonus >= 150, `bonus=${stats.bonus}`);
  });

  it("toda categoría tiene al menos 1 palabra por letra (A-Z)", () => {
    for (const cat of CATEGORY_IDS) {
      for (let c = 97; c <= 122; c++) {
        const letter = String.fromCharCode(c);
        const arr = dict.categories[cat][letter];
        assert.ok(arr && arr.length >= 1, `vacía ${cat}/${letter}`);
      }
    }
  });

  it("las letras difíciles (K,Q,U,W,X,Y,Z) tienen al menos 2 por categoría", () => {
    for (const cat of CATEGORY_IDS) {
      for (const letter of ["k", "q", "u", "w", "x", "y", "z"]) {
        assert.ok(
          dict.categories[cat][letter].length >= 2,
          `${cat}/${letter} tiene ${dict.categories[cat][letter].length}`,
        );
      }
    }
  });
});

describe("puntuación 100 / 50 / 0", () => {
  it("palabras válidas distintas valen 100 cada una (9 × 100 = 900)", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    assert.equal(submitBasta(s, "p1", { now: 1000 }).ok, true);
    assert.equal(s.phase, "roundEnd");
    assert.equal(s.roundPoints.p1, 900);
    assert.equal(s.roundPoints.p2, 900);
    assert.equal(s.results.p1.answers[0].reason, "¡Única! 100 pts");
  });

  it("palabra válida repetida vale 50 para cada uno (9 × 50 = 450)", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 0); // ¡las mismas palabras!
    submitBasta(s, "p1", { now: 1000 });
    assert.equal(s.roundPoints.p1, 450);
    assert.equal(s.roundPoints.p2, 450);
    assert.equal(s.results.p1.answers[0].reason, "Repetida: 50 pts");
    assert.equal(s.results.p1.answers[0].points, 50);
  });

  it("inválida o en blanco vale 0, con su motivo en español", () => {
    const s = writingGame();
    const words = wordsFor(s.letter, 0);
    words.animal = "gato"; // letra equivocada (salvo que la letra sea G)
    if (s.letter === "G") words.animal = "zebra";
    words.comida = ""; // en blanco
    words.cosa = "nubarrón"; // empieza con la letra pero es inventada
    submitAnswers(s, "p1", words);
    fillPlayer(s, "p2", 1);
    // p1 tiene un hueco, así que NO puede cantar ¡BASTA!; lo canta p2.
    assert.equal(submitBasta(s, "p1", { now: 1000 }).ok, false);
    assert.equal(submitBasta(s, "p2", { now: 1000 }).ok, true);
    assert.equal(s.phase, "roundEnd");
    const res = s.results.p1.answers;
    const byCat = Object.fromEntries(res.map((a) => [a.category, a]));
    assert.equal(byCat.animal.points, 0);
    assert.ok(byCat.animal.reason.startsWith("No empieza con"));
    assert.equal(byCat.comida.points, 0);
    assert.equal(byCat.comida.reason, "Sin respuesta");
    assert.equal(byCat.cosa.points, 0);
    assert.equal(byCat.cosa.reason, "No está en el diccionario del juego");
    assert.equal(s.roundPoints.p1, 600); // 6 válidas × 100
  });

  it("un typo repetido cuenta como repetida (misma canónica)", () => {
    const s = writingGame();
    // Letra real de la ronda: usar "rata"/"ratta" solo si la letra es R.
    if (s.letter !== "R") {
      // Con otra letra, el mismo principio con dos typos de la misma palabra.
      const w1 = wordsFor(s.letter, 0);
      const w2 = wordsFor(s.letter, 0);
      const cat = "animal";
      w2[cat] = w1[cat] + w1[cat].slice(-1); // duplica la última letra: typo ≤1
      submitAnswers(s, "p1", w1);
      submitAnswers(s, "p2", w2);
    } else {
      const w1 = wordsFor("R", 0);
      const w2 = wordsFor("R", 0);
      w1.animal = "rata";
      w2.animal = "ratta";
      submitAnswers(s, "p1", w1);
      submitAnswers(s, "p2", w2);
    }
    submitBasta(s, "p1", { now: 1000 });
    const a1 = s.results.p1.answers.find((a) => a.category === "animal");
    const a2 = s.results.p2.answers.find((a) => a.category === "animal");
    assert.equal(a1.points, 50);
    assert.equal(a2.points, 50);
    assert.equal(a1.reason, "Repetida: 50 pts");
  });
});

describe("¡BASTA! y bloqueo", () => {
  it("no se puede cantar ¡BASTA! con casillas vacías", () => {
    const s = writingGame();
    const words = wordsFor(s.letter, 0);
    delete words.pelicula; // 8 de 9
    submitAnswers(s, "p1", words);
    assert.equal(canBasta(s, "p1"), false);
    assert.equal(submitBasta(s, "p1", { now: 1000 }).ok, false);
    assert.equal(s.phase, "writing");
  });

  it("con las 9 llenas el botón se habilita y el ¡BASTA! cierra la ronda", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    assert.equal(canBasta(s, "p1"), true);
    fillPlayer(s, "p2", 1);
    assert.equal(submitBasta(s, "p1", { now: 1000 }).ok, true);
    assert.equal(s.phase, "roundEnd");
    assert.equal(s.bastaBy, "p1");
  });

  it("tras el ¡BASTA! los demás quedan bloqueados (no pueden escribir)", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    submitBasta(s, "p1", { now: 1000 });
    assert.equal(submitAnswers(s, "p2", wordsFor(s.letter, 1)).ok, false);
    assert.equal(submitBasta(s, "p2", { now: 1000 }).ok, false);
  });
});

describe("gracia de 5 segundos para el ganador anterior", () => {
  it("si otro canta ¡BASTA!, el ganador anterior tiene 5 s de gracia", () => {
    const s = writingGame();
    // Ronda 1: Tato canta ¡BASTA! y gana (empate 900-900, desempate: basta).
    playRound(s, "p1");
    assert.equal(s.roundWinner, "p1");
    assert.equal(s.prevRoundWinner, "p1");
    assert.equal(advance(s, { now: 2000 }).ok, true);
    assert.equal(s.round, 2);
    tick(s, 2000 + 4001);
    tick(s, 2000 + 7002);
    assert.equal(s.phase, "writing");
    // Ronda 2: Ledya canta ¡BASTA! primero → gracia para Tato.
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    assert.equal(submitBasta(s, "p2", { now: 3000 }).ok, true);
    assert.equal(s.phase, "grace");
    assert.equal(s.gracePlayer, "p1");
    assert.equal(s.deadline, 3000 + GRACE_MS);
    // Ledya queda bloqueada; Tato sí puede seguir escribiendo.
    assert.equal(submitAnswers(s, "p2", wordsFor(s.letter, 1)).ok, false);
    assert.equal(submitAnswers(s, "p1", wordsFor(s.letter, 0)).ok, true);
    // Si se acaba la gracia, se puntúa con lo que haya.
    tick(s, 3000 + GRACE_MS + 1);
    assert.equal(s.phase, "roundEnd");
  });

  it("el ganador anterior puede cerrar antes con su propio ¡BASTA!", () => {
    const s = writingGame();
    playRound(s, "p1");
    advance(s, { now: 2000 });
    tick(s, 2000 + 4001);
    tick(s, 2000 + 7002);
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    submitBasta(s, "p2", { now: 3000 });
    assert.equal(s.phase, "grace");
    assert.equal(submitBasta(s, "p1", { now: 3500 }).ok, true);
    assert.equal(s.phase, "roundEnd");
  });

  it("si el ganador anterior canta ¡BASTA!, NO hay gracia: se puntúa directo", () => {
    const s = writingGame();
    playRound(s, "p1");
    advance(s, { now: 2000 });
    tick(s, 2000 + 4001);
    tick(s, 2000 + 7002);
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    assert.equal(submitBasta(s, "p1", { now: 3000 }).ok, true);
    assert.equal(s.phase, "roundEnd");
  });
});

describe("congelamiento a los 3 minutos y categoría bonus", () => {
  it("a los 3 min se congela: puntos guardados y aparece la categoría bonus", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    assert.equal(s.phase, "writing");
    const changed = tick(s, s.deadline + 1);
    assert.equal(changed, true);
    assert.equal(s.phase, "bonus");
    assert.equal(s.bonusCategory, BONUS_ROTATION[0]); // ronda 1 → Superhéroe
    assert.deepEqual(s.frozenPoints, { p1: 900, p2: 900 });
    // Las respuestas principales ya no se pueden cambiar.
    assert.equal(submitAnswers(s, "p1", wordsFor(s.letter, 0)).ok, false);
  });

  it("el bonus suma 100 único / 50 repetido / 0 inválido a lo congelado", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    tick(s, s.deadline + 1);
    assert.equal(s.bonusCategory, "superheroe");
    submitBonusAnswer(s, "p1", "superman");
    submitBonusAnswer(s, "p2", "batman");
    assert.equal(submitBasta(s, "p1", { bonusAnswer: "superman", now: 5000 }).ok, true);
    assert.equal(s.phase, "roundEnd");
    assert.equal(s.roundPoints.p1, 1000); // 900 + 100
    assert.equal(s.roundPoints.p2, 1000);
    assert.equal(s.results.p1.bonus.points, 100);
    assert.equal(s.results.p1.bonusPoints, 100);
  });

  it("bonus repetido vale 50 y bonus inválido vale 0", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    tick(s, s.deadline + 1);
    submitBonusAnswer(s, "p1", "superman");
    submitBonusAnswer(s, "p2", "superman"); // repetido
    submitBasta(s, "p2", { bonusAnswer: "superman", now: 5000 });
    assert.equal(s.roundPoints.p1, 950);
    assert.equal(s.roundPoints.p2, 950);
    assert.equal(s.results.p1.bonus.reason, "Repetida: 50 pts");

    // Segunda partida: bonus inválido.
    const s2 = writingGame();
    fillPlayer(s2, "p1", 0);
    fillPlayer(s2, "p2", 1);
    tick(s2, s2.deadline + 1);
    submitBonusAnswer(s2, "p1", "superman");
    submitBonusAnswer(s2, "p2", "inventado total");
    submitBasta(s2, "p1", { bonusAnswer: "superman", now: 5000 });
    assert.equal(s2.roundPoints.p1, 1000);
    assert.equal(s2.roundPoints.p2, 900);
    assert.equal(s2.results.p2.bonus.points, 0);
  });

  it("la categoría bonus rota por ronda: 1 superhéroe, 2 deporte, 3 cantante", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    // Ronda 1: congelar y cerrar con bonus.
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    tick(s, s.deadline + 1);
    assert.equal(s.bonusCategory, "superheroe");
    submitBonusAnswer(s, "p1", "superman");
    submitBonusAnswer(s, "p2", "batman");
    submitBasta(s, "p1", { bonusAnswer: "superman", now: 5000 });
    advance(s, { now: 6000 });
    tick(s, 6000 + 4001);
    tick(s, 6000 + 7002);
    // Ronda 2: congelar otra vez.
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    tick(s, s.deadline + 1);
    assert.equal(s.bonusCategory, "deporte");
    submitBonusAnswer(s, "p1", "fútbol");
    submitBonusAnswer(s, "p2", "tenis");
    submitBasta(s, "p1", { bonusAnswer: "fútbol", now: 9000 });
    advance(s, { now: 10000 });
    tick(s, 10000 + 4001);
    tick(s, 10000 + 7002);
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    tick(s, s.deadline + 1);
    assert.equal(s.bonusCategory, "cantante");
  });
});

describe("fase de listos (ready)", () => {
  it("el juego NO arranca hasta que TODOS oprimen ¡Listo a jugar!", () => {
    const s = createGame("ABCD", { totalRounds: 3 });
    addPlayer(s, "Tato");
    assert.equal(s.phase, "lobby");
    addPlayer(s, "Ledya");
    maybeEnterReady(s);
    assert.equal(s.phase, "ready");
    assert.equal(setReady(s, "p1", { now: 1000 }).ok, true);
    assert.equal(s.phase, "ready", "con 1 de 2 listos no arranca");
    assert.equal(setReady(s, "p2", { now: 1000 }).ok, true);
    assert.equal(s.phase, "roulette", "con los 2 listos arranca");
    assert.equal(s.round, 1);
  });

  it("quien entra tarde a la sala en ready también debe ponerse listo", () => {
    const s = createGame("ABCD", { totalRounds: 3 });
    addPlayer(s, "Tato");
    addPlayer(s, "Ledya");
    maybeEnterReady(s);
    addPlayer(s, "Milly");
    assert.equal(s.phase, "ready");
    setReady(s, "p1", { now: 1000 });
    setReady(s, "p2", { now: 1000 });
    assert.equal(s.phase, "ready", "falta Milly por ponerse lista");
    setReady(s, "p3", { now: 1000 });
    assert.equal(s.phase, "roulette");
  });

  it("startGame directo sin listos no arranca", () => {
    const s = createGame("ABCD", { totalRounds: 3 });
    addPlayer(s, "Tato");
    addPlayer(s, "Ledya");
    maybeEnterReady(s);
    assert.equal(startGame(s, { now: 1000 }).ok, false);
    assert.equal(s.phase, "ready");
  });
});

describe("letras sin repetir", () => {
  it("ninguna letra se repite dentro de la misma partida", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    const letters = [s.letter];
    playRound(s, "p1");
    advance(s, { now: 2000 });
    tick(s, 2000 + 4001);
    tick(s, 2000 + 7002);
    letters.push(s.letter);
    playRound(s, "p2", 3000);
    advance(s, { now: 4000 });
    tick(s, 4000 + 4001);
    tick(s, 4000 + 7002);
    letters.push(s.letter);
    assert.equal(new Set(letters).size, 3, `letras repetidas: ${letters}`);
    assert.deepEqual(s.usedLetters, letters);
  });

  it("pickLetter nunca devuelve una letra ya usada", () => {
    const used = ["A", "B", "C"];
    for (let i = 0; i < 20; i++) {
      const l = pickLetter(used, seqRng([0, 0.5, 0.99, 0.1, 0.7]));
      assert.ok(!used.includes(l), `pickLetter devolvió ${l}, ya usada`);
    }
  });
});

describe("fin de partida y revancha", () => {
  it("al terminar las rondas hay podio y ganador por total", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    playRound(s, "p1"); // 900-900
    advance(s, { now: 2000 });
    tick(s, 2000 + 4001); tick(s, 2000 + 7002);
    playRound(s, "p2", 3000); // 900-900, gana p2 el desempate de ronda
    advance(s, { now: 4000 });
    tick(s, 4000 + 4001); tick(s, 4000 + 7002);
    playRound(s, "p1", 5000);
    assert.equal(s.round, 3);
    assert.equal(advance(s, { now: 6000 }).ok, true);
    assert.equal(s.phase, "gameOver");
    assert.equal(s.podium.length, 2);
    assert.equal(s.winner, "p1"); // 2700-2700: gana el primero en orden
    assert.deepEqual(s.players.map((p) => p.score), [2700, 2700]);
  });

  it("la revancha NO pasa por ready: arranca directo en la ruleta", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    playRound(s, "p1");
    advance(s, { now: 2000 });
    tick(s, 2000 + 4001); tick(s, 2000 + 7002);
    playRound(s, "p2", 3000);
    advance(s, { now: 4000 });
    tick(s, 4000 + 4001); tick(s, 4000 + 7002);
    playRound(s, "p1", 5000);
    advance(s, { now: 6000 });
    assert.equal(s.phase, "gameOver");
    assert.equal(rematch(s, { now: 7000 }).ok, true);
    assert.equal(s.phase, "roulette", "la revancha arranca sin fase ready");
    assert.equal(s.round, 1);
    assert.deepEqual(s.players.map((p) => p.score), [0, 0]);
    assert.equal(s.usedLetters.length, 1, "se resetean las letras usadas");
  });

  it("la sala admite hasta 6 jugadores, no más", () => {
    const s = createGame("ABCD");
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      assert.ok(addPlayer(s, `Jugador ${i}`), `jugador ${i} debería entrar`);
    }
    assert.equal(addPlayer(s, "Séptimo"), null);
  });
});

describe("puerta de Continuar entre rondas", () => {
  it("con solo 1 de 2 Continuar, la ronda NO avanza (espera sin límite)", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    playRound(s, "p1");
    assert.equal(s.phase, "roundEnd");
    assert.equal(setContinue(s, "p1", { now: 2000 }).ok, true);
    assert.equal(s.phase, "roundEnd", "con solo Tato, la ronda no debe avanzar");
    assert.equal(s.round, 1);
    // El estado público muestra quién ya tocó y quién falta.
    const pub = publicState(s, "p1");
    assert.deepEqual(pub.players.map((p) => p.continued), [true, false]);
  });

  it("con los 2 Continuar, avanza a la ruleta de la siguiente ronda", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    playRound(s, "p1");
    assert.equal(setContinue(s, "p1", { now: 2000 }).ok, true);
    assert.equal(setContinue(s, "p2", { now: 2000 }).ok, true);
    assert.equal(s.phase, "roulette", "con los 2, avanza a la ruleta");
    assert.equal(s.round, 2);
    // La puerta se resetea para la próxima ronda.
    assert.deepEqual(s.players.map((p) => p.continued), [false, false]);
  });

  it("en la última ronda, los 2 Continuar llevan al podio final", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    const nextRound = (now) => {
      assert.equal(setContinue(s, "p1", { now }).ok, true);
      assert.equal(setContinue(s, "p2", { now }).ok, true);
      if (s.phase === "roulette") {
        tick(s, now + 4001); tick(s, now + 7002);
      }
    };
    playRound(s, "p1");
    nextRound(2000); // → ronda 2
    playRound(s, "p2", 3000);
    nextRound(4000); // → ronda 3
    playRound(s, "p1", 5000);
    assert.equal(s.round, 3);
    assert.equal(setContinue(s, "p1", { now: 6000 }).ok, true);
    assert.equal(s.phase, "roundEnd", "con solo 1, el podio todavía no sale");
    assert.equal(setContinue(s, "p2", { now: 6000 }).ok, true);
    assert.equal(s.phase, "gameOver");
    assert.equal(s.winner, "p1");
    assert.deepEqual(s.players.map((p) => p.score), [2700, 2700]);
  });

  it("Continuar fuera de roundEnd falla", () => {
    const s = writingGame();
    assert.equal(s.phase, "writing");
    assert.equal(setContinue(s, "p1").ok, false);
    assert.equal(setContinue(s, "pX").ok, false, "jugador desconocido");
  });

  it("tocar Continuar dos veces no avanza solo", () => {
    const s = writingGame(1000, constRng(0.5), 3);
    playRound(s, "p1");
    assert.equal(setContinue(s, "p1", { now: 2000 }).ok, true);
    assert.equal(setContinue(s, "p1", { now: 2001 }).ok, true, "repetir no da error");
    assert.equal(s.phase, "roundEnd", "repetir no sustituye al otro jugador");
  });
});

describe("ruleta y cuenta atrás (tick)", () => {
  it("roulette (4 s) → countdown (3 s) → writing", () => {
    const s = createGame("ABCD", { totalRounds: 3 });
    addPlayer(s, "Tato");
    addPlayer(s, "Ledya");
    maybeEnterReady(s);
    setReady(s, "p1", { now: 1000 });
    setReady(s, "p2", { now: 1000 });
    assert.equal(s.phase, "roulette");
    assert.equal(s.deadline, 1000 + 4000);
    assert.equal(tick(s, 1000 + 3999), false);
    assert.equal(tick(s, 1000 + 4001), true);
    assert.equal(s.phase, "countdown");
    assert.equal(s.deadline, 1000 + 4001 + 3000);
    assert.equal(tick(s, 1000 + 7002), true);
    assert.equal(s.phase, "writing");
    assert.equal(s.deadline, 1000 + 7002 + FREEZE_MS);
  });
});

describe("estado público (privacidad)", () => {
  it("durante la escritura nadie ve las respuestas de los demás", () => {
    const s = writingGame();
    fillPlayer(s, "p1", 0);
    fillPlayer(s, "p2", 1);
    const pubP1 = publicState(s, "p1");
    const raw = JSON.stringify(pubP1);
    // La palabra idx1 de p2 en "nombre" no debe aparecer en la vista de p1.
    const p2Word = wordsFor(s.letter, 1).nombre;
    const p1Word = wordsFor(s.letter, 0).nombre;
    assert.ok(!raw.includes(p2Word), `se filtró la respuesta de p2: ${p2Word}`);
    // Mis propias respuestas sí las veo yo.
    assert.equal(pubP1.myAnswers.nombre, p1Word);
    // Pero sí se ve el progreso (conteo, sin palabras).
    assert.equal(pubP1.progress.p1, 9);
    assert.equal(pubP1.progress.p2, 9);
  });

  it("en roundEnd sí se revelan todas las respuestas ya juzgadas", () => {
    const s = writingGame();
    playRound(s, "p1");
    const pub = publicState(s, "p1");
    assert.ok(pub.results, "en roundEnd debe haber resultados");
    assert.equal(pub.results.p1.answers.length, 9);
    assert.equal(pub.results.p2.answers.length, 9);
  });
});
