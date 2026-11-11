# ¡Basta! — El juego de palabras en línea (2–6 jugadores)

Juego en línea de **¡Basta!** para jugar **de 2 a 6 jugadores**, cada uno
desde su teléfono, en tiempo real. Lo más parecido posible a un show de
TV: ruleta de letras, cuenta atrás con voz, botón ¡BASTA! gigante,
aplausos, marcador en vivo y podio con fuegos artificiales.

- **Juego (cuando esté publicado):** `https://tato98mx.github.io/basta/`
- **Repositorio:** `https://github.com/tato98mx/basta`
- **Backend:** Cloudflare Worker `basta` + Durable Object (SQLite),
  plan gratuito.

> ⚠️ **Estado:** el código está terminado y verificado en local, pero el
> repositorio aún no existe en GitHub (la app de Muse no tiene permiso para
> crear repositorios) y el Worker aún no está desplegado. Ver
> [Pasos pendientes](#pasos-pendientes) abajo.

## Cómo se juega

1. Uno abre el juego, escribe su nombre, elige cuántas rondas (3, 5, 7
   o 10) y pulsa **Crear sala**. El juego muestra un **código de 4
   letras** (por ejemplo `KLHB`).
2. Los demás abren el juego, escriben su nombre, ponen el código y pulsan
   **Unirse** (hasta 6 jugadores).
3. En cuanto entra el 2º jugador, todos oprimen **"✅ ¡Listo a jugar!"**.
   La partida empieza solo cuando **TODOS** están listos.
4. La ruleta gira y sale la letra. Se anuncian la ronda y la letra con
   voz, suena la cuenta 3-2-1… ¡y a escribir!
5. Llena las 9 categorías (Nombre, Apellido, Ciudad o País, Animal,
   Fruta o Verdura, Comida, Profesión o trabajo, Cosa / Objeto, Película
   o Serie) y oprime **¡BASTA!** antes que nadie.
6. Al terminar, pueden jugar la **revancha** en la misma sala (arranca
   directo, sin ponerse listos otra vez).

También hay un **modo demo** para ver el aspecto sin servidor:
`https://tato98mx.github.io/basta/?demo=1` (9 pantallas de ejemplo para
recorrer, con anuncios de voz).

## Reglas implementadas

- **2 a 6 jugadores** por sala; rondas a elegir: **3, 5, 7 o 10**.
- **Ruleta de letra** al inicio de cada ronda (A–Z sin Ñ, sin repetir
  letra en la misma partida) + cuenta atrás 3-2-1.
- **Sin límite de tiempo** para escribir. El primero con las 9 casillas
  llenas que oprima **¡BASTA!** cierra la ronda y bloquea a los demás.
- **Gracia de 5 segundos:** si quien cantó ¡BASTA! no es el ganador de
  la ronda anterior, ese ganador tiene 5 s para terminar de escribir.
- **Puntos:** 100 si la palabra es válida y única, 50 si es válida y
  repetida, 0 si es inválida o está en blanco. El juez (servidor) exige
  que la palabra empiece con la letra de la ronda y esté en el
  diccionario del juego; tolera typos de 1 letra.
- **Congelamiento:** si pasan 3 minutos escribiendo, la ronda se congela
  (los puntos principales quedan guardados) y aparece una **categoría
  bonus** (Superhéroe, Deporte, Cantante o Banda, Marca o Videojuego,
  rotando por ronda, sin letra). El primero con palabra bonus y ¡BASTA!
  cierra la ronda; el bonus suma 100/50/0 a lo congelado.
- **Fin de ronda:** ganador EN GRANDE con sus puntos, tabla completa con
  palabra, puntos y motivo de cada jugador, y anuncio de voz del ganador
  y del 2º y 3º lugar.
- **Podio final** (🥇🥈🥉) con fuegos artificiales y anuncio de voz del
  ganador del juego.

## Anuncios de voz (español)

Todo emocionante como show, con Web Speech API (`lang: es-MX`) y música
bajita (2/5) que se baja momentáneamente mientras habla la voz (ducking):

- Al arrancar cada ronda: "¡Ronda 1!" + "¡La letra es R!" + cuenta 3-2-1.
- Al terminar cada ronda: "El ganador de la ronda es Tato, con 750
  puntos. En segundo lugar, Milly, con 600 puntos. En tercer lugar,
  Ledya, con 450 puntos." (El ganador con puntos **de esa ronda**; 2º y
  3º con su **total acumulado** del marcador. Si hay 2 jugadores, solo se
  anuncian 2.)
- Al final: "¡El ganador del juego es Tato, con 1250 puntos!" con su
  nombre EN GRANDE entre fuegos artificiales visuales y de sonido.

El texto se construye en el cliente a partir del estado del servidor
(`buildRoundEndAnnouncement` y `buildGameOverAnnouncement` en `app.js`).

## Tecnología (todo gratis)

| Pieza | Servicio | Plan |
|---|---|---|
| Frontend (HTML/CSS/JS) | GitHub Pages | Gratis |
| Multijugador en tiempo real | Cloudflare Workers + Durable Objects (SQLite, WebSockets) | Plan gratuito |
| Despliegue del Worker | GitHub Actions (`cloudflare/wrangler-action`) | Gratis |

El servidor es **autoritativo**: es el único que conoce el diccionario y
los puntos, y nunca envía a un jugador las respuestas de los demás
mientras se escribe, así que nadie puede hacer trampa mirando el tráfico.

## Estructura del proyecto

```
index.html                  Frontend (pantalla del juego)
app.js                      Lógica del cliente (WebSocket, pantallas, voz, demo)
style.css                   Show brillante: ruleta, ¡BASTA! gigante, podio
config.js                   URL del Worker (ver Pasos pendientes)
manifest.json
gen_dict.py                 Generador del diccionario (→ worker/src/dictionary.json)
worker/
  wrangler.toml             Worker "basta" + Durable Object RoomDO
  src/index.ts              Worker: /api/room, WebSocket, Durable Object
  src/game.ts               Lógica pura del juego (testeable sin Cloudflare)
  src/dictionary.json       Diccionario del juez (2.512 palabras + 213 bonus)
  tests/logic.test.mjs      Tests de la lógica (node:test)
  tests/e2e-local.mjs       Partida de 2 jugadores contra wrangler dev --local
tests-client/
  load-app.cjs              Carga app.js en VM con DOM mínimo
  smoke.test.cjs            Render de fases + textos de anuncios de voz
.github/workflows/
  deploy-worker.yml         Despliega el Worker al hacer push a main
SPEC.md                     Especificación completa (reglas, protocolo, voz)
```

## Pasos pendientes

### 1. Crear el repositorio (lo hace Tato)

La app de Muse en GitHub **no tiene permiso para crear repositorios**, así
que este paso es manual:

1. Entra a <https://github.com/new>.
2. **Repository name:** `basta`.
3. **Public** (público).
4. No marques ninguna casilla de README, .gitignore ni licencia (el código
   ya las trae).
5. Pulsa **Create repository**.
6. **Añade el repo a la app de Muse en GitHub** para que Milly pueda subir
   los archivos: en GitHub, foto de perfil → **Settings** →
   **Applications** → **Installed GitHub Apps** → **Muse** → **Configure**
   → **Repository access** → **Only select repositories** → selecciona
   `basta` → **Save**.

Después de esto, Milly sube todos los archivos del proyecto al repo.

### 2. Activar GitHub Pages (lo hace Tato)

En el repositorio: **Settings → Pages → Build and deployment → Source:
Deploy from a branch → Branch: `main`, carpeta `/(root)` → Save**.
El juego quedará en `https://tato98mx.github.io/basta/`.

### 3. Agregar los secrets de Cloudflare (lo hace Tato)

El despliegue del Worker es automático por GitHub Actions, pero necesita
dos secrets en el repositorio
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de API de Cloudflare con permiso **Edit Cloudflare Workers** (se crea en <https://dash.cloudflare.com/profile/api-tokens> → Create Token → plantilla "Edit Cloudflare Workers" o un token personalizado con ese permiso). |
| `CLOUDFLARE_ACCOUNT_ID` | ID de la cuenta de Cloudflare (se ve en el panel de Cloudflare, abajo a la derecha). |

Sin esos dos secrets, el workflow `Deploy Worker` falla. No se guardan
tokens en ningún archivo del repo.

### 4. Conectar el frontend con el Worker (lo hace Milly)

Cuando el Worker esté desplegado, Milly pone su URL en `config.js`:

```js
window.GAME_API_URL = "https://basta.<tu-subdominio>.workers.dev";
```

y hace push. A partir de ahí, crear sala y unirse ya funcionan en vivo.

### 5. Probar entre todos

Abrir el enlace en los teléfonos, crear la sala en uno, unirse con el
código en los demás y jugar una partida completa. Probar también los
anuncios de voz en un teléfono real (la voz es-MX depende del teléfono).

## Verificación realizada (en local, 2026-11-11)

- **Diccionario:** 2.512 palabras principales + 213 bonus; toda
  combinación categoría × letra tiene al menos 1 palabra; letras
  difíciles (K, Q, U, W, X, Y, Z) con al menos 2 por categoría.
- **Tests de lógica:** `cd worker && npm test` (ver resultado exacto en
  el reporte de entrega).
- **Smoke del cliente:** `node --test tests-client/smoke.test.cjs`
  (render de las 9 fases + textos de anuncios de voz, incluido el caso
  de 2 jugadores).
- **Partida completa de 2 jugadores contra el Worker local**
  (`worker/tests/e2e-local.mjs`): lobby → ready → ruleta → cuenta →
  escritura → ¡BASTA! → gracia de 5 s → fin de ronda → podio → revancha
  sin ready → reconexión con el mismo nombre. Anuncios de fin de ronda y
  de ganador final verificados con el estado real del servidor.
- **Pendiente de verificar en vivo** (cuando el repo y el Worker existan):
  que la página publicada cargue, una partida real entre varios teléfonos
  y los anuncios de voz en un teléfono real.
