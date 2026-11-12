# ✅ PUBLICADO: Basta ?v=6 en GitHub Pages (2026-11-11, ~14:37 UTC)

Push: commit `40684f22de6a9fae98ab08f929398e0441cdc8d0` en main (11 archivos, sin config.js).
Pages sirve `version.json` = 6; `app.js` en vivo idéntico al local.
Verificación en vivo (`live-verify-v6.mjs`, sala AACG, 3 rondas S/C/T): 0 fallos —
voz lenta (onstart 2.5 s) cada anuncio UNA vez, "Probar voz" UN solo utterance
audible con Paulina mejorada, botón "Salir" en fin de ronda, puerta Continuar OK,
900–900 por ronda, podio 2700–2700. Pruebas locales 74/74 (cliente 32 + Worker 42).
⚠️ EL WORKER NO SE REDESPLEGÓ: sin autenticación de wrangler en el entorno
(sin token ni secrets en el repo); el workflow "Deploy Worker" del push falló.
El Worker en vivo sigue en 587b9062 con el diccionario VIEJO: ibérico/ilama/utopía
están en el repo pero aún NO puntúan en vivo. Falta: redesplegar el Worker
(token transitorio para `wrangler deploy`, o agregar los secrets al repo) y la
confirmación de Tato con su oído en el iPhone real.

---

# ✅ PUBLICADO: Basta ?v=5 en GitHub Pages (2026-11-11, ~10:05 UTC)

Push hecho y verificado en vivo. NO reintentar el push: el SHA ya está en
main y Pages ya sirve ?v=5. (El cron de las 9:30 quedó sin nada que hacer.)

- Push: commit `ff5a0aeb27dadf0548a25dbc6836177524b27690` en main (7 archivos,
  mensaje exacto del plan). Registro actualizado en
  `~/workspace/basta.muse-github-snapshot-sync.json`.
- Pages sirve `version.json` = 5; `index.html` referencia `app.js?v=5` y
  `style.css?v=5`; el `app.js` en vivo trae el watchdog que espera si el
  motor está ocupado.
- Verificación en vivo (`~/workspace/basta/live-verify-v5.mjs`, sala XUTW,
  3 rondas, letras T/W/E): 0 fallos. Con voz lenta (onstart 2.5 s) cada
  anuncio se dijo UNA sola vez (rondas 1-3 + podio, nada descartado);
  partida completa 900-900 por ronda, podio 2700-2700 (Tato ganador);
  puerta Continuar: con 1 solo jugador NO avanza, con los 2 sí; contador
  9/9 en las 3 rondas; sin errores del servidor.
- Nota: la voz se verificó con el stub iOS fiel contra el app.js exacto
  que sirve Pages, no con el altavoz de un iPhone real. La confirmación
  en el teléfono de Tato sigue pendiente.
- El Worker NO cambió en ?v=5 (sigue 587b9062 con la puerta Continuar).

---

# Pendiente ORIGINAL (ya resuelto, se conserva como registro)

## Qué falta (una sola cosa)
Empujar 7 archivos al repo `tato98mx/Basta-` (rama `main`) con el mensaje
de abajo. El Worker NO cambia en ?v=5 (ya está desplegado con la puerta
Continuar); solo es el cliente.

```text
github push-files --owner tato98mx --repo Basta- --branch main \
  --message "Voz ?v=5: el watchdog ya no triplica anuncios con voz lenta (espera si el motor esta ocupado) + anti-cache ?v=5" \
  --source-dir /home/hatch/workspace/basta \
  --paths-file /tmp/basta-v5-paths.txt
```

Archivos (si /tmp se limpió, recrear el manifiesto NUL-delimitado con):
`app.js`, `index.html`, `version.json`, `SPEC.md`,
`tests-client/smoke.test.cjs`, `tests-client/voice.test.cjs`,
`tests-client/ios-speech-stub.cjs`.

Después del push: actualizar el registro
`~/workspace/basta.muse-github-snapshot-sync.json` con el SHA confirmado
(ver `snapshot-push.md`: añadir la entrada con ese SHA y los 7 paths),
esperar ~10 min a que Pages propague (max-age=600) y correr la
verificación en vivo: `node /tmp/repro/live-verify.cjs` (necesita el proxy
local de reenvío en 127.0.0.1:18080 y PulseAudio con null-sink; ver
`/tmp/repro/fwd-proxy.cjs` y `live-verify.cjs`).

## Estado en vivo ahora (2026-11-11 ~09:30 UTC)
- Pages sirve ?v=4 (commit d6c9b6ed): voz ?v=3 + puerta Continuar +
  arreglo del borrador (contador 9/9). Verificado en vivo en la sala ACQA:
  30/33 checks (los 3 fallos son el bug del watchdog que corrige ?v=5).
- Worker https://basta.ydfz296yrr.workers.dev ya tiene la puerta Continuar
  (desplegado por subagente, verificado en vivo en ACQA).
- Tests locales: 67/67 (voz 8, smoke 18, worker 41).

## ?v=8 (2026-11-11, reporte de Tato tras la ronda 2 con Ledya)
- Bug 1: el borrador local se resucitaba al cambiar de ronda (onState rama 3
  + draft nunca limpiado). Fix: al cambiar de ronda se limpia draft,
  lastSyncedDraft, draftBonus y lastSyncedBonus.
- Bug 2: el botón ¡BASTA! se auto-bloqueaba al tocarlo y nada lo revivía si
  el servidor lo rechazaba. Fix: anti doble-tap de 1.5 s sin auto-bloqueo;
  el handler de errores recalcula los controles.
- Congelamiento: aviso de voz + toast a los 30 s, y anuncio de voz al
  congelar con la categoría bonus.
- 7 categorías (sin Profesión ni Película/Serie). Diccionario 2.010 palabras.
- Juez: fuzzy solo si cambia la longitud o la palabra tiene ≥ 6 letras
  (caca/caja ya no colapsan en casa). + calamar, caca, caja, caza y rellenos.
- Ronda completa = 700 pts. Tests: repro-round2 y repro-judge como
  regresiones permanentes.
