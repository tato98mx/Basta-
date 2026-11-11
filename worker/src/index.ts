/**
 * Basta — Cloudflare Worker + Durable Object (plan gratuito).
 *
 * - POST /api/room            → crea una sala y devuelve su código.
 * - GET  /api/room/:code      → estado actual (solo lectura, para depurar).
 * - WS   /room/:code/ws       → juego en tiempo real (de 2 a 6 jugadores).
 *
 * Un Durable Object (SQLite) por sala guarda el estado, aplica las acciones
 * y emite {type:"state"} tras cada cambio. Usa la WebSocket Hibernation API.
 * El servidor es autoritativo y nunca envía las respuestas de un jugador a
 * los demás mientras se escribe (ver publicState en game.ts).
 */

import { DurableObject } from "cloudflare:workers";
import {
  addPlayer,
  createGame,
  maybeEnterReady,
  advance,
  publicState,
  rematch,
  setReady,
  submitAnswers,
  submitBasta,
  submitBonusAnswer,
  tick,
  type ActionResult,
  type GameState,
} from "./game.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Crear sala: POST /api/room { totalRounds?: 3|5|7|10 } → { code }
    if (request.method === "POST" && url.pathname === "/api/room") {
      let totalRounds = 5;
      try {
        const body = (await request.json()) as { totalRounds?: unknown };
        if (typeof body.totalRounds === "number") totalRounds = body.totalRounds;
      } catch {
        // Cuerpo vacío o inválido: se crea la sala con 5 rondas.
      }
      const code = generateRoomCode();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      const res = await stub.fetch(
        new Request("http://room/__init__", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, totalRounds }),
        }),
      );
      if (!res.ok) return json({ error: "No se pudo crear la sala." }, 500);
      return json({ code });
    }

    // Estado actual: GET /api/room/:code
    const roomMatch = url.pathname.match(/^\/api\/room\/([A-Z]{4})$/);
    if (request.method === "GET" && roomMatch) {
      const stub = env.ROOM.get(env.ROOM.idFromName(roomMatch[1]));
      const res = await stub.fetch(new Request("http://room/__state__"));
      if (res.status === 404) return json({ error: "Sala no encontrada." }, 404);
      return json(await res.json());
    }

    // WebSocket: /room/:code/ws?name=<nombre>
    const wsMatch = url.pathname.match(/^\/room\/([A-Z]{4})\/ws$/);
    if (wsMatch) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return json({ error: "Se esperaba una conexión WebSocket." }, 426);
      }
      const stub = env.ROOM.get(env.ROOM.idFromName(wsMatch[1]));
      return stub.fetch(request);
    }

    return json({ error: "Ruta no encontrada." }, 404);
  },
};

// ---------------------------------------------------------------------------
// Durable Object: una sala (SQLite + WebSocket Hibernation API)
// ---------------------------------------------------------------------------

export class RoomDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
  }

  // --- Persistencia ---

  private load(): GameState | null {
    const rows = this.sql
      .exec("SELECT value FROM kv WHERE key = 'state'")
      .toArray() as { value: string }[];
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value) as GameState;
    } catch {
      return null;
    }
  }

  private save(state: GameState): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO kv (key, value) VALUES ('state', ?)",
      JSON.stringify(state),
    );
  }

  /** Programa la alarma para la fecha límite actual (si la hay). */
  private async scheduleAlarm(state: GameState): Promise<void> {
    if (state.deadline === null) return;
    const delay = Math.max(0, state.deadline - Date.now());
    await this.ctx.storage.setAlarm(Date.now() + delay + 250);
  }

  /** Envía el estado público a todos los sockets conectados. Cada socket
   *  recibe el estado filtrado para SU jugador (sus propias respuestas sí,
   *  las de los demás no: ver publicState en game.ts). */
  private broadcast(state: GameState): void {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
      this.send(ws, {
        type: "state",
        state: publicState(state, attachment?.playerId),
      });
    }
  }

  private send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Socket cerrado; nada que hacer.
    }
  }

  // --- HTTP interno (desde el Worker) ---

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Inicializar la sala (la crea el POST /api/room).
    if (request.method === "POST" && url.pathname === "/__init__") {
      const existing = this.load();
      if (existing) return json({ code: existing.code });
      const body = (await request.json()) as {
        code: string;
        totalRounds?: number;
      };
      const state = createGame(body.code, { totalRounds: body.totalRounds });
      this.save(state);
      return json({ code: state.code });
    }

    // Estado actual (solo lectura).
    if (request.method === "GET" && url.pathname === "/__state__") {
      const state = this.load();
      if (!state) return json({ error: "Sala no encontrada." }, 404);
      if (tick(state, Date.now())) {
        this.save(state);
        await this.scheduleAlarm(state);
        this.broadcast(state);
      }
      return json(publicState(state));
    }

    // WebSocket: el upgrade llega aquí reenviado por el Worker.
    if (url.pathname === "/ws" || url.pathname.endsWith("/ws")) {
      let state = this.load();
      if (!state) {
        // La sala se crea al primer WS si nadie llamó a POST /api/room.
        const code = new URL(request.url).pathname.split("/")[2] ?? "AAAA";
        state = createGame(code);
        this.save(state);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "Ruta no encontrada." }, 404);
  }

  // --- Alarma: hace cumplir los temporizadores ---

  async alarm(): Promise<void> {
    const state = this.load();
    if (!state) return;
    if (tick(state, Date.now())) {
      this.save(state);
      await this.scheduleAlarm(state);
      this.broadcast(state);
    } else if (state.deadline !== null) {
      await this.scheduleAlarm(state);
    }
  }

  // --- WebSocket (Hibernation API) ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const state = this.load();
    if (!state) {
      this.send(ws, { type: "error", message: "Sala no encontrada." });
      return;
    }

    let data: { type?: string; [key: string]: unknown };
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      this.send(ws, { type: "error", message: "Mensaje inválido." });
      return;
    }

    // Primero: aplicar temporizadores vencidos antes de procesar el mensaje.
    let changed = tick(state, Date.now());
    const now = Date.now();

    // Jugador asociado a este socket (si ya hizo join).
    const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
    const playerId = attachment?.playerId;

    const apply = (result: ActionResult): void => {
      if (!result.ok) {
        this.send(ws, { type: "error", message: result.error ?? "Movimiento no válido." });
      } else {
        changed = true;
      }
    };

    switch (data.type) {
      case "join": {
        const name = typeof data.name === "string" ? data.name.trim() : "";
        if (!name) {
          this.send(ws, { type: "error", message: "Falta el nombre del jugador." });
          break;
        }
        // Reconexión: mismo nombre, mismo jugador. Se le manda el estado
        // actual DIRECTO a este socket (si no, se queda sin pantalla).
        const existing = state.players.find((p) => p.name === name);
        if (existing) {
          ws.serializeAttachment({ playerId: existing.id });
          this.send(ws, { type: "state", state: publicState(state, existing.id) });
          break;
        }
        if (state.phase !== "lobby" && state.phase !== "ready") {
          this.send(ws, { type: "error", message: "La partida ya empezó." });
          break;
        }
        const id = addPlayer(state, name);
        if (!id) {
          this.send(ws, { type: "error", message: "La sala ya tiene 6 jugadores." });
          break;
        }
        ws.serializeAttachment({ playerId: id });
        changed = true;
        maybeEnterReady(state);
        break;
      }
      case "ready": {
        if (!playerId) break;
        apply(setReady(state, playerId, { now }));
        break;
      }
      case "answers": {
        if (!playerId) break;
        apply(submitAnswers(state, playerId, data.answers));
        break;
      }
      case "bonus": {
        if (!playerId) break;
        apply(submitBonusAnswer(state, playerId, data.answer));
        break;
      }
      case "basta": {
        if (!playerId) break;
        apply(
          submitBasta(state, playerId, {
            answers: data.answers,
            bonusAnswer: data.bonusAnswer,
            now,
          }),
        );
        break;
      }
      case "next": {
        apply(advance(state, { now }));
        break;
      }
      case "rematch": {
        apply(rematch(state, { now }));
        break;
      }
      case "ping": {
        // Sin efecto: solo fuerza el tick de arriba y el broadcast si algo
        // cambió (útil para que el cliente mantenga el reloj al día).
        break;
      }
      default: {
        this.send(ws, { type: "error", message: "Mensaje desconocido." });
      }
    }

    if (changed) {
      this.save(state);
      await this.scheduleAlarm(state);
      this.broadcast(state);
    }
  }

  webSocketClose(): void {
    // El jugador puede reconectar con el mismo nombre (join lo reasocia).
    // El estado de la partida se conserva en SQLite.
  }

  webSocketError(): void {
    // Sin acción especial: el socket se cierra y el jugador puede reconectar.
  }
}
