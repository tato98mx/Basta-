// REPRO del juez/diccionario reportado por Tato el 2026-11-11 (ronda 2, letra C):
//  - "calamar" en Animal no fue aceptado (0).
//  - Él escribió "caca" y Ledya "caja" en Cosa y a AMBOS les dio 50 (repetida),
//    aunque son palabras distintas. Causa sospechosa: la tolerancia a typos
//    (Levenshtein ≤ 1) colapsa palabras cortas distintas a la misma canónica
//    ("caca" y "caja" caen a 1 letra de "casa", que sí está en Cosa/C).
// Se ejecuta con `node --test worker/tests/repro-judge.test.mjs` (desde worker/
// con `npm test` no se incluye: correrlo explícito).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  addPlayer,
  maybeEnterReady,
  setReady,
  startGame,
  submitAnswers,
  submitBasta,
  judgeAnswer,
} from "../src/game.ts";

function freshGame() {
  const s = createGame("REPRO", { totalRounds: 3 });
  addPlayer(s, "Tato");
  addPlayer(s, "Ledya");
  maybeEnterReady(s);
  setReady(s, "p1");
  setReady(s, "p2", { now: 1000 });
  return s;
}

function playFullRound(s, letter, p1words, p2words, now = 1000) {
  s.letter = letter;
  s.phase = "writing";
  submitAnswers(s, "p1", p1words);
  submitAnswers(s, "p2", p2words);
  const r = submitBasta(s, "p1", { now });
  assert.equal(r.ok, true, `el ¡BASTA! debe aceptarse: ${r.error || ""}`);
  return s.results;
}

describe("REPRO juez: calamar / caca / caja (letra C)", () => {
  it("calamar en Animal debe ser válido", () => {
    const j = judgeAnswer("calamar", "animal", "C");
    assert.equal(j.valid, true, `calamar debe ser válido: ${j.reason}`);
    assert.equal(j.canonical, "calamar");
  });

  it("caca en Cosa debe ser válido con su propia canónica", () => {
    const j = judgeAnswer("caca", "cosa", "C");
    assert.equal(j.valid, true, `caca debe ser válido: ${j.reason}`);
    assert.equal(j.canonical, "caca", "caca no debe colapsar a otra palabra");
  });

  it("caja en Cosa debe ser válido con su propia canónica", () => {
    const j = judgeAnswer("caja", "cosa", "C");
    assert.equal(j.valid, true, `caja debe ser válido: ${j.reason}`);
    assert.equal(j.canonical, "caja", "caja no debe colapsar a casa");
  });

  it("caca vs caja: dos palabras distintas NO son repetidas (100 y 100)", () => {
    const s = freshGame();
    const words = (cosa) => ({
      nombre: "Carlos", apellido: "Castillo", ciudad: "Cancún", animal: "calamar",
      fruta: "cereza", comida: "ceviche", cosa,
    });
    const results = playFullRound(s, "C", words("caca"), words("caja"));
    const a1 = results.p1.answers.find((a) => a.category === "cosa");
    const a2 = results.p2.answers.find((a) => a.category === "cosa");
    assert.equal(a1.points, 100, `caca debe valer 100, valió ${a1.points} (${a1.reason})`);
    assert.equal(a2.points, 100, `caja debe valer 100, valió ${a2.points} (${a2.reason})`);
  });

  it("casa vs caza: palabras cortas distintas no colapsan por 1 letra", () => {
    const s = freshGame();
    const words = (cosa) => ({
      nombre: "Carlos", apellido: "Castillo", ciudad: "Cancún", animal: "calamar",
      fruta: "cereza", comida: "ceviche", cosa,
    });
    const results = playFullRound(s, "C", words("casa"), words("caza"));
    const a1 = results.p1.answers.find((a) => a.category === "cosa");
    const a2 = results.p2.answers.find((a) => a.category === "cosa");
    assert.equal(a1.points, 100, `casa debe valer 100, valió ${a1.points}`);
    assert.equal(a2.points, 100, `caza debe valer 100, valió ${a2.points}`);
  });

  it("la tolerancia a typos sigue funcionando en palabras LARGAS", () => {
    // "computadora" con 1 letra mal escrita debe seguir valiendo.
    const j = judgeAnswer("computador", "cosa", "C"); // "computadora" sin la a final: distancia 1 por borrado
    assert.equal(j.valid, true, "un typo de 1 letra en palabra larga debe tolerarse");
    assert.equal(j.canonical, "computadora");
  });
});
