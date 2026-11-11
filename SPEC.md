# ¡Basta! — Especificación del juego (2–6 jugadores en línea)

Repo: `tato98mx/basta` (público, pendiente de crear). Frontend en GitHub Pages
(`https://tato98mx.github.io/basta/`). Backend: Cloudflare Worker
+ Durable Object (plan gratuito) en `worker/`. Todo gratis.

## 1. Reglas del juego

Basta clásico (también llamado "Stop", "Tutti Frutti" o "Categorías"),
adaptado a 2–6 jugadores por teléfono, en tiempo real.

### Salas y rondas
- Sala con código de **4 letras** (A-Z, sin O/0/I/1 para evitar confusión).
  Uno crea la sala eligiendo el total de rondas: **3, 5, 7 o 10** (selector
  en la pantalla de crear sala). Los demás se unen con el código.
- **De 2 a 6 jugadores.** Al entrar el 2º jugador la sala pasa a fase
  `ready`: el juego **NO arranca** hasta que **TODOS** los jugadores
  presentes opriman **"✅ ¡Listo a jugar!"**. La pantalla muestra quién
  está listo y quién espera. Pueden seguir entrando jugadores (hasta 6)
  durante `lobby` y `ready`; quien entra tarde también debe ponerse listo.
- Gana la partida quien tenga **más puntos al terminar la última ronda**.
  Empate en el total: gana el primer jugador en orden de entrada.

### Ruleta y cuenta atrás
- Cada ronda el servidor elige una **letra al azar (A–Z, sin Ñ)** que **no
  se ha usado en esa partida**. Fase `roulette` (~4 s): el cliente muestra
  el abecedario ciclando rápido y se detiene de golpe en la letra grande.
- Después, fase `countdown` (3 s): cuenta atrás 3-2-1. Luego empieza la
  escritura.

### Escritura y ¡BASTA!
- **9 categorías** (en cualquier orden): Nombre, Apellido, Ciudad o País,
  Animal, Fruta o Verdura, Comida, Profesión o trabajo, Cosa / Objeto,
  Película o Serie.
- **Sin límite de tiempo por ronda.** El primero que llene las 9 casillas
  y oprima **¡BASTA!** cierra la ronda de inmediato y bloquea las
  respuestas de los demás. El botón ¡BASTA! está deshabilitado hasta que
  las 9 casillas tengan algo escrito (aunque esté mal escrito).
- **Gracia de 5 segundos:** si quien cantó ¡BASTA! **no** es el ganador
  de la ronda anterior, ese ganador anterior tiene **5 s de gracia** para
  terminar de escribir (fase `grace`); los demás quedan bloqueados de
  inmediato. Si el ganador anterior es quien cantó ¡BASTA!, o si es la
  primera ronda, se puntúa directo sin gracia. Si se acaban los 5 s, se
  puntúa con lo que cada quien tenga escrito (los huecos valen 0).

### Puntuación (solo el servidor)
- **100 puntos** si la palabra es válida y **única** (nadie más la puso).
- **50 puntos** si la palabra es válida pero **repetida** por otro jugador.
- **0 puntos** si es inválida o está en blanco.
- Cada respuesta juzgada lleva su **motivo en español**: "¡Única! 100 pts",
  "Repetida: 50 pts", "No empieza con R", "No es un animal",
  "No está en el diccionario del juego", "Sin respuesta".

### Juez con diccionario (servidor, autoritativo)
- Una palabra es válida solo si **empieza con la letra de la ronda** Y
  **pertenece a la categoría** según el diccionario del juego
  (`worker/src/dictionary.json`, importado por `worker/src/game.ts`).
- Normalización: minúsculas, sin acentos, sin puntuación, espacios
  colapsados. Se aceptan **typos de 1 letra** (distancia de Levenshtein
  ≤ 1) contra las entradas del diccionario; el typo se resuelve a su
  palabra canónica, así que dos typos de la misma palabra cuentan como
  repetida (50 pts), no como dos únicas.
- Si la palabra existe en **otra** categoría con esa misma letra, el motivo
  es "No es un(a) <categoría>" (p. ej. "mango" como animal → "No es un
  animal"). Si no existe en ninguna, "No está en el diccionario del juego".
- **Cobertura del diccionario:** 2.512 palabras principales + 213 bonus.
  Por categoría: Nombre 359, Apellido 276, Ciudad 363, Animal 247,
  Fruta 195, Comida 219, Profesión 255, Cosa 304, Película 294. Cada
  combinación categoría × letra tiene al menos 1 palabra y cada letra
  difícil (K, Q, U, W, X, Y, Z) tiene al menos 2 por categoría. Las
  letras comunes (A, B, C, D, E, F, G, H, I, J, L, M, N, O, P, R, S, T, V)
  tienen entre 5 y 20 palabras por categoría según la categoría: en
  Nombre y Ciudad son 15–20; en Animal, Fruta o Verdura y Comida algunas
  letras tienen menos (4–9) porque el español tiene pocas palabras para
  esa combinación (p. ej. frutas con I o con O). El diccionario se puede
  ampliar editando `gen_dict.py` y regenerando `dictionary.json`.

### Congelamiento a los 3 minutos y categoría bonus
- Si pasan **3 minutos** en la fase de escritura sin que nadie cante
  ¡BASTA!, la ronda se **congela**: las respuestas principales se
  bloquean, el servidor las califica **de inmediato** y guarda los puntos
  congelados por jugador.
- Aparece una **categoría bonus** que rota por ronda: ronda 1 Superhéroe,
  ronda 2 Deporte, ronda 3 Cantante o Banda, ronda 4 Marca, ronda 5
  Videojuego, ronda 6 Superhéroe otra vez, etc. La palabra bonus **NO
  exige letra**. El primero que escriba una palabra bonus y oprima
  ¡BASTA! cierra la ronda. El bonus vale 100 única / 50 repetida / 0
  inválida y se **suma** a los puntos congelados.

### Fin de ronda y podio
- Al cerrar la ronda se muestra el ganador de la ronda **EN GRANDE** con
  sus puntos, la tabla completa (palabra, puntos y motivo de cada jugador
  en cada categoría, incluido el bonus si lo hubo) y el botón **"➡️
  Continuar"** (en la última ronda: **"🏆 Ver el podio final"**). La
  siguiente ronda (o el podio final) **NO empieza hasta que TODOS los
  jugadores toquen Continuar**: cada uno ve quién ya tocó y quién falta,
  como la puerta de "¡Listo a jugar!". Si alguien no lo toca, la partida
  espera sin límite de tiempo. Empate en puntos de ronda: gana quien
  cantó ¡BASTA!.
- Al terminar la última ronda: **podio** (1º, 2º y 3º con medallas 🥇🥈🥉,
  y el resto en lista) con botón de **revancha**. La revancha **NO pasa
  por "ready"**: arranca directo en la ruleta de la ronda 1, con el
  marcador en cero y las letras reseteadas.

## 2. Arquitectura y protocolo

- Frontend estático en GitHub Pages. Backend: Cloudflare Worker
  (`worker/`) + **un Durable Object (SQLite) por sala**, con WebSocket.
  Plan gratuito: Workers Free incluye Durable Objects con backend SQLite.
  Usar la **WebSocket Hibernation API** para no gastar duración.
- `config.js` en la raíz del frontend: `window.GAME_API_URL` con la URL
  del Worker (placeholder vacío hasta desplegar; el juego muestra un aviso
  claro si falta configurarla).

### Endpoints del Worker
- `POST /api/room` `{ totalRounds?: 3|5|7|10 }` → `{code}` (crea la sala).
- `GET /api/room/:code` → estado actual (solo lectura, para depurar).
- `WebSocket wss://<worker>/room/:code/ws?name=<nombre>`

### Mensajes cliente → servidor
- `{type:"join", name}` — justo después de conectar por WS. Mismo nombre
  = mismo jugador (reconexión).
- `{type:"ready"}` — oprimir "¡Listo a jugar!" (solo en fase `ready`).
- `{type:"answers", answers:{categoria: palabra, ...}}` — borrador de
  respuestas; el cliente lo envía al escribir (debounce 300 ms) para que
  el servidor siempre tenga lo último cuando alguien cante ¡BASTA!.
- `{type:"bonus", answer}` — borrador de la palabra bonus.
- `{type:"basta", answers?, bonusAnswer?}` — cantar ¡BASTA!; puede llevar
  las respuestas finales para no perder ni una letra.
- `{type:"continue"}` — tocar "Continuar" en fin de ronda. El servidor
  marca al jugador como listo-para-continuar y solo avanza a la siguiente
  ronda (o al podio final) cuando **TODOS** los jugadores actuales lo han
  tocado. Sin límite de tiempo.
- `{type:"next"}` — alias de compatibilidad para clientes ?v=2: se trata
  como `"continue"` (marca al jugador, no avanza solo).
- `{type:"rematch"}` — nueva partida en la misma sala (sin ready).
- `{type:"ping"}` — sin efecto; fuerza al servidor a aplicar temporizadores.

### Mensajes servidor → cliente
- `{type:"state", state}` — snapshot completo y autoritativo del estado
  tras cada cambio. **Los clientes solo renderizan este estado; nunca
  calculan puntos ni transiciones.**
- `{type:"error", message}` — sala llena, movimiento no válido, etc.

### Forma del estado (JSON)
```json
{
  "code": "ABCD",
  "phase": "lobby|ready|roulette|countdown|writing|grace|bonus|roundEnd|gameOver",
  "players": [{"id": "p1", "name": "Tato", "score": 0, "ready": true, "continued": false}],
  "totalRounds": 5, "round": 1, "letter": "R", "usedLetters": ["R"],
  "categories": [{"id": "nombre", "label": "Nombre"}],
  "bonusCategory": "superheroe",
  "myAnswers": {"nombre": "Rosa"},
  "myBonus": "Superman",
  "progress": {"p1": 9, "p2": 7},
  "bastaBy": "p1", "gracePlayer": null, "prevRoundWinner": null,
  "roundWinner": "p1", "roundPoints": {"p1": 800},
  "frozenPoints": {"p1": 800},
  "results": {"p1": {"answers": [{"category": "nombre", "word": "Rosa",
    "points": 100, "valid": true, "reason": "¡Única! 100 pts"}],
    "bonus": null, "frozenPoints": 800, "bonusPoints": 0, "roundPoints": 800}},
  "winner": "p1", "podium": ["p1", "p2"],
  "deadline": 1731456000000
}
```
**Seguridad:** el servidor NUNCA envía las respuestas (ni los borradores)
de otros jugadores durante escritura, gracia ni bonus. Cada socket recibe
el estado filtrado para SU jugador: `myAnswers`/`myBonus` son solo los
suyos; `progress` es solo el conteo de casillas llenas por jugador, sin
palabras. En `roundEnd` y `gameOver` sí se revelan todas las respuestas
ya juzgadas (con puntos y motivo).

### Temporizadores (el servidor los hace cumplir)
El servidor guarda la fecha límite de cada fase y avanza con su `tick`
(ruleta 4 s, cuenta 3 s, escritura → congelamiento a los 3 min, gracia
5 s). El cliente muestra el temporizador solo como ayuda visual; el
servidor ignora acciones fuera de plazo. Las alarmas del Durable Object
hacen cumplir los plazos aunque nadie envíe mensajes.

### Reconexión
El cliente reconecta solo con backoff **1 s → 30 s, máx. 12 intentos**.
Al reentrar con el mismo nombre, el servidor reasocia el socket a su
jugador y le manda el estado actual **directo a ese socket**.

## 3. Visual (REQUISITO: llamativo, como show)

- Fondo brillante (morado/rojo/turquesa) con logo **"¡BASTA!"** dorado.
- Ruleta con la letra gigante (150 px), cuenta atrás gigante, botón
  **¡BASTA!** rojo enorme con brillo pulsante.
- Nombre del que cantó ¡BASTA! y del ganador de la ronda **EN GRANDE**;
  podio final con medallas y fuegos artificiales (canvas) + confeti.
- Marcador en vivo siempre visible (puntos y progreso x/9 de cada jugador).
- Móvil primero: botones grandes, formulario que cabe en el teléfono en
  vertical. Fuentes: Google Fonts (Archivo Black / Montserrat) con
  respaldo a fuentes del sistema si no hay conexión.

## 4. Sonido y anuncios de voz (español, como show)

- **Música bajita (2/5)** y **voz/efectos fuertes (5/5)** (Web Audio API,
  sin archivos). Botón flotante de sonido **abajo a la derecha (54 px)**;
  preferencia de silencio en `localStorage` (`basta-muted`).
- **Ducking:** al empezar un anuncio de voz, la música baja
  momentáneamente (a 0.05) y se restaura al terminar el anuncio.
- **Voz:** Web Speech API con `lang: "es-MX"`; se elige una voz en español
  si hay (preferencia es-MX, luego es-ES, luego cualquier es). Si no hay
  voz en español o no hay Web Speech API, el juego sigue con pitidos de
  respaldo. Los anuncios se disparan una sola vez por ronda/fase.
- **Desbloqueo en iOS (¡importante!):** en Safari de iPhone, WebKit
  descarta EN SILENCIO todo `speak()` que no corre dentro de un gesto
  del usuario. Por eso `unlockVoice()` corre en CADA `pointerdown` /
  `touchstart`: hace `resume()` y un `speak()` dentro del gesto, que es
  lo que desbloquea la voz para el resto de la sesión. Sin esto,
  NINGÚN anuncio sonaba (ni la letra, ni el podio).
- **Causa raíz del fallo de voz (?v=3, 2026-11-11):** la partida en la
  que Tato reportó "no sale la voz" (sala HFTY, 06:58–07:01 UTC) empezó
  ~5 minutos después de publicarse ?v=2 (06:52 UTC) en una pestaña de
  Safari abierta desde ~06:31 con ?v=1, sin recarga forzada. GitHub
  Pages sirve index.html con `max-age=600` y sin service worker, así
  que esa pestaña vieja siguió sirviendo ?v=1, que NO tiene unlockVoice
  ni "Probar voz". Por eso no sonó NADA. Además ?v=2 tenía defectos que
  hacían el fallo silencioso e irrecuperable: `unlockVoice()` ponía
  `voiceUnlocked = true` INCONDICIONALMENTE tras `speak()`, sin
  verificar `onstart`; ningún `cancel()`/`resume()` de recuperación si
  la cola se atoraba; y "Probar voz" no daba feedback de éxito/fallo.
- **Diseño ?v=3:** `voiceUnlocked` solo se pone en `true` cuando un
  utterance de desbloqueo dispara `onstart`/`onend` (verificado). Antes
  de eso, los anuncios se quedan en cola y se dicen tras el próximo
  gesto (nunca se intentan sin desbloqueo, así que no se descartan ni
  se pierden). El desbloqueo se intenta silencioso primero ("¡Hola!",
  volumen 0) y, si no arranca en 1.5 s, el próximo gesto lo reintenta
  AUDIBLE. Antes de cada `speak()`: `resume()` + limpieza de cola
  atorada (`cancel()` solo si `speaking` lleva > 2.5 s sin actividad,
  para no descartar el utterance nuevo en Safari antiguo). Watchdog de
  1.5 s sin `onstart`: se limpia la cola atorada y se reencola (hasta
  2 reintentos).
- **Anti-caché:** los assets llevan `?v=5` y la app pide
  `version.json` con anti-caché al arrancar (y al volver a la pestaña);
  si el servidor reporta una versión mayor que `APP_VERSION`, aparece
  un banner "Hay una versión nueva — Actualizar ahora" que recarga la
  página. Así una pestaña vieja nunca juega sin saber que hay versión
  nueva (esto es lo que pasó con ?v=2 en la sala HFTY).
- **Borrador local vs eco del servidor (?v=4, 2026-11-11):** `onState`
  sobrescribía `draft` con `state.myAnswers` a ciegas; como el tecleo
  tarda 300 ms en sincronizarse, un eco desfasado del servidor borraba
  palabras ya escritas en local y el contador no llegaba a 9/9 hasta
  cambiar la palabra (síntoma reportado por Tato en la sala HFTY).
  Ahora `onState` fusiona: lo que en local difiere de lo último enviado
  (`lastSyncedDraft`) es un cambio pendiente y gana; lo demás se toma
  del servidor. Lo mismo para la palabra bonus (`lastSyncedBonus`).
- **Watchdog de voz (?v=5, 2026-11-11):** el watchdog de 1.5 s en
  `speakNow` reencolaba el utterance siempre que no llegaba `onstart`,
  aunque el motor estuviera trabajando: con una voz lenta (onstart
  > 1.5 s, como espeak en Linux o la primera voz tras el desbloqueo en
  iOS) cada anuncio se decía 3 veces, la cola se atascaba y los
  anuncios de las rondas siguientes y el podio no llegaban (verificado
  en vivo en la sala ACQA: ronda 1 sonó, ronda 2 en adelante casi nada,
  y el anuncio del podio nunca se invocó). Ahora el watchdog mira el
  estado del motor (`speaking`/`pending`): si está ocupado, espera y
  vuelve a chequear; solo reencola cuando el motor está en silencio
  (el utterance fue descartado de verdad).
- **Cola de voz con watchdog:** los anuncios se encolan y se dicen de uno
  en uno. Si un utterance se descarta en silencio (no llega `onstart`),
  el watchdog (1.5 s) lo detecta y el texto se reencola hasta 2 veces
  para decirlo tras el próximo desbloqueo por gesto, en vez de perderse.
  Si las voces aún no cargaron (`getVoices()` vacío), se espera a
  `voiceschanged` (con límite de 1.2 s) antes de hablar. Las frases
  largas se parten en oraciones (en iOS los textos de ~15 s se cortan).
- **Botón "🔊 Probar voz" en el lobby:** quita el silencio si estaba
  puesto, desbloquea la voz dentro del tap y dice un ejemplo del anuncio
  de fin de ronda ("El ganador de la ronda es Tato, con 900 puntos…"),
  para probarla sin jugar una ronda entera. Muestra en pantalla si
  funcionó ("✅ Voz funcionando") o si falló ("⚠️ La voz no respondió.
  Toca de nuevo o revisa el interruptor de silencio de tu iPhone y el
  volumen.").
- **Secuencia al arrancar cada ronda:** anuncio de la ronda
  ("¡Ronda 1!") + anuncio de la letra ("¡La letra es R!") + cuenta atrás
  3-2-1 con voz ("Tres", "Dos", "Uno").

## 5. Archivos del repo

```
/index.html, /app.js, /style.css, /config.js   (frontend, GitHub Pages)
/manifest.json, /version.json                  (versión anti-caché ?v=5)
/gen_dict.py                                   (generador del diccionario)
/worker/wrangler.toml                          (Worker "basta" + RoomDO)
/worker/package.json, /worker/tsconfig.json
/worker/src/index.ts                           (Worker + RoomDO)
/worker/src/game.ts                            (lógica pura, testeable)
/worker/src/dictionary.json                    (diccionario del juez)
/worker/tests/logic.test.mjs                   (tests de lógica, node:test)
/worker/tests/e2e-local.mjs                    (2 jugadores vs wrangler dev)
/tests-client/load-app.cjs                     (carga app.js en VM con DOM mínimo)
/tests-client/smoke.test.cjs                   (render + anuncios de voz)
/tests-client/voice.test.cjs                   (voz en iOS: desbloqueo, cola, Probar voz)
/tests-client/ios-speech-stub.cjs              (stub speechSynthesis estilo iOS)
/tests-client/repro-voice-ios.cjs              (partida real vs Worker en vivo + voz iOS)
/.github/workflows/deploy-worker.yml          (despliegue del Worker por push)
/README.md                                     (reglas, cómo jugar, despliegue)
/SPEC.md                                       (esta especificación)
```

## 6. Anuncios de voz al terminar la ronda y la partida

El texto de los anuncios **se construye en el cliente a partir del estado
del servidor; nunca se inventa un nombre ni un punto**. Funciones puras
en `app.js` (expuestas en `window.__BASTA__` para pruebas):

### Fin de ronda — `buildRoundEndAnnouncement(state)`
- El **ganador de la ronda** se anuncia con sus **puntos DE ESA RONDA**
  (`state.roundPoints[state.roundWinner]`).
- El **2º y 3º lugar** se anuncian con su **TOTAL ACUMULADO del marcador**
  (`state.players[].score`), ordenados por total y sin repetir al ganador
  de la ronda.
- Si hay menos de 3 jugadores, se anuncian solo los que haya.

Ejemplo exacto (3 jugadores):
> "El ganador de la ronda es Tato, con 750 puntos. En segundo lugar,
> Milly, con 600 puntos. En tercer lugar, Ledya, con 450 puntos."

Con 2 jugadores:
> "El ganador de la ronda es Tato, con 500 puntos. En segundo lugar,
> Ledya, con 700 puntos."

### Fin de la partida — `buildGameOverAnnouncement(state)`
- El **ganador final** se anuncia con su **total acumulado**
  (`state.players[].score`) y, si hay, el 2º lugar con su total.
- Ejemplo: "¡El ganador del juego es Tato, con 1250 puntos! En segundo
  lugar, Milly, con 900 puntos."
- Su nombre sale **EN GRANDE** entre **fuegos artificiales visuales**
  (animación en canvas: cohetes que suben y estallan en partículas de
  colores, `launchFireworks()` en `app.js`) y **sonido de fuegos
  artificiales** (Web Audio API: estallidos de ruido + graves que caen,
  `playFireworksSound()` en `app.js`), además de confeti y aplausos.

### Verificación
- `tests-client/smoke.test.cjs`: construye el texto del anuncio a partir
  de estados simulados del servidor y verifica nombres, orden y puntos,
  incluido el caso de 2 jugadores (solo se anuncian 2) y el caso en que
  el ganador de la ronda también lleva el mayor total (no se repite).
  También verifica el botón "➡️ Continuar" en fin de ronda (y "🏆 Ver
  el podio final" en la última), el banner de versión nueva (?v=4) y
  la carrera del borrador: un eco desfasado del servidor no borra el
  tecleo local pendiente (3 pruebas: 1 palabra, 9 palabras con ecos
  viejos entre medias, y eco con la palabra ya recibida).
- `tests-client/voice.test.cjs`: voz en iOS con un stub fiel de
  speechSynthesis (cola FIFO, descarte fuera de gesto, voces tardías).
  Tres pruebas nuevas ?v=3 fallan con el código ?v=2 y pasan con ?v=3. Una prueba nueva ?v=5 (onstart lento) falla con el código ?v=4 y pasa con ?v=5: el anuncio se dice una sola vez, no tres.
  desbloqueo silencioso descartado (reintento audible), cola atorada
  por un speak fuera de gesto, y feedback visible de "Probar voz".
  Verificación manual contra ?v=2 en `/tmp/verify_old_voice.cjs`.
- `worker/tests/logic.test.mjs`: 41 tests, incluidos 5 de la puerta de
  Continuar (no avanza con 1 de 2, avanza con los 2, última ronda →
  podio, fuera de roundEnd falla, repetir no sustituye al otro).
- `worker/tests/e2e-local.mjs`: verifica el texto del anuncio con el
  estado REAL del servidor tras cada ronda y al final de la partida, y
  la puerta de Continuar (con solo 1 no avanza; con los 2 sí).
- Verificación en vivo: partida real de 2 jugadores en
  https://tato98mx.github.io/Basta-/ contra el Worker en vivo
  (voz con onstart + puerta Continuar), 2026-11-11.
