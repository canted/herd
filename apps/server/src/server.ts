import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { validateComposition, type Composition } from "@herd/composition";
import type {
  ClientRole,
  ClientToServerMessage,
  CreateSessionResponse,
  ServerToClientMessage,
} from "@herd/protocol";
import { normalizeOwnerEmail } from "./creatorStore";
import { createCreatorRepository } from "./creatorRepository";
import { createPackageUploadUrl, loadTigrisStorageConfig } from "./packageStorage";
import { SessionStore } from "./sessionStore";

export interface HerdServerOptions {
  port?: number;
  host?: string;
}

interface ClientConnection {
  ws: WebSocket;
  code: string;
  role: ClientRole;
  participantId?: string;
}

const fixture = loadFixture();
const store = new SessionStore();
const creatorStore = createCreatorRepository();
const connectionsByCode = new Map<string, Set<ClientConnection>>();

export function startServer(options: HerdServerOptions = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 8787);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const server = createServer(handleRequest);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleSocket(ws, request, url);
    });
  });

  server.listen(port, host, () => {
    console.log(`Herd server listening on http://${host}:${port}`);
  });

  return { server, wss, store };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      writeJson(response, 200, { ok: true, serverTimeMs: Date.now() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      const tigris = loadTigrisStorageConfig();
      writeJson(response, 200, {
        ok: true,
        serverTimeMs: Date.now(),
        dependencies: {
          creatorStore: creatorStore.kind,
          tigris: tigris === null ? "not_configured" : "configured",
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/version") {
      writeJson(response, 200, {
        name: "herd-server",
        version: process.env.HERD_VERSION ?? "local",
        revision: process.env.FLY_IMAGE_REF ?? process.env.GIT_COMMIT_SHA ?? "unknown",
        environment: process.env.NODE_ENV ?? "development",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/fixtures/rehearsal-basic") {
      writeJson(response, 200, fixture);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/creator/compositions") {
      const ownerEmail = parseOwnerEmail(url.searchParams.get("ownerEmail"));

      writeJson(response, 200, { compositions: await creatorStore.listCompositions(ownerEmail) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/creator/compositions") {
      const body = await readJsonBody(request);
      const ownerEmail = parseOwnerEmail(body.ownerEmail);
      const composition = parseRequiredComposition(body.composition);
      const record = await creatorStore.saveComposition({ ownerEmail, composition });
      writeJson(response, 201, { composition: record });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/creator/packages") {
      const ownerEmail = parseOwnerEmail(url.searchParams.get("ownerEmail"));

      writeJson(response, 200, { packages: await creatorStore.listPackages(ownerEmail) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/creator/packages") {
      const body = await readJsonBody(request);
      const ownerEmail = parseOwnerEmail(body.ownerEmail);
      const composition = parseRequiredComposition(body.composition);
      const filename = typeof body.filename === "string" ? body.filename : undefined;
      const contentType = typeof body.contentType === "string" ? body.contentType : "application/zip";
      const record = await creatorStore.createPackage({
        ownerEmail,
        composition,
        ...(filename === undefined ? {} : { filename }),
      });
      const tigris = loadTigrisStorageConfig();
      const uploadUrl = tigris === null
        ? null
        : await createPackageUploadUrl({
          config: tigris,
          objectKey: record.objectKey,
          contentType,
        });

      writeJson(response, 201, {
        package: record,
        upload: {
          objectKey: record.objectKey,
          configured: tigris !== null,
          uploadUrl,
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      const body = await readJsonBody(request);
      const name = typeof body.name === "string" ? body.name : "Herd rehearsal";
      const composition = parseSessionComposition(body.composition);
      const snapshot = store.createSession({
        name,
        fixtureId: composition.id,
        composition,
      });
      const payload: CreateSessionResponse = {
        snapshot,
        hostPath: `/host?code=${snapshot.code}`,
        participantPath: `/join?code=${snapshot.code}`,
      };
      writeJson(response, 201, payload);
      return;
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([A-Z0-9]+)$/);
    if (request.method === "GET" && sessionMatch?.[1] !== undefined) {
      const session = store.getPublicSession(sessionMatch[1]);

      if (session === undefined) {
        writeJson(response, 404, { error: "Session not found." });
        return;
      }

      writeJson(response, 200, session);
      return;
    }

    writeJson(response, 404, { error: "Not found." });
  } catch (error) {
    writeJson(response, error instanceof HttpError ? error.status : 500, {
      error: error instanceof Error ? error.message : "Unknown server error.",
    });
  }
}

function handleSocket(ws: WebSocket, request: IncomingMessage, url: URL): void {
  const role = url.searchParams.get("role") as ClientRole | null;
  const code = url.searchParams.get("code")?.toUpperCase();
  const participantId = url.searchParams.get("participantId") ?? randomUUID();

  if ((role !== "host" && role !== "participant") || code === undefined || store.getSession(code) === undefined) {
    send(ws, { type: "error", message: "Invalid session connection." });
    ws.close(1008);
    return;
  }

  const connection: ClientConnection = {
    ws,
    role,
    code,
    ...(role === "participant" ? { participantId } : {}),
  };
  addConnection(connection);

  if (role === "participant") {
    store.joinParticipant(code, participantId);
  }

  const session = store.getSession(code);
  if (session !== undefined) {
    send(ws, { type: "fixture", composition: session.composition });
  }
  send(ws, { type: "snapshot", snapshot: store.snapshotByCode(code) });
  broadcastSnapshot(code);

  ws.on("message", (raw) => {
    handleClientMessage(connection, raw.toString());
  });

  ws.on("close", () => {
    removeConnection(connection);
    if (connection.role === "participant" && connection.participantId !== undefined) {
      store.markParticipantDisconnected(connection.code, connection.participantId);
      broadcastSnapshot(connection.code);
    }
  });
}

function handleClientMessage(connection: ClientConnection, raw: string): void {
  let message: ClientToServerMessage;

  try {
    message = JSON.parse(raw) as ClientToServerMessage;
  } catch {
    send(connection.ws, { type: "error", message: "Invalid JSON message." });
    return;
  }

  try {
    switch (message.type) {
      case "clockPing": {
        const serverReceivedAt = Date.now();
        send(connection.ws, {
          type: "clockPong",
          id: message.id,
          clientSentAt: message.clientSentAt,
          serverReceivedAt,
          serverSentAt: Date.now(),
        });
        return;
      }
      case "participantReport": {
        if (connection.participantId === undefined) return;
        store.updateParticipantReport(connection.code, connection.participantId, message.report);
        broadcastSnapshot(connection.code);
        return;
      }
      case "participantChoice": {
        if (connection.participantId === undefined) return;
        store.recordChoice(connection.code, connection.participantId, message.promptId, message.choiceId);
        broadcastSnapshot(connection.code);
        return;
      }
      case "hostStart": {
        if (connection.role !== "host") return;
        const snapshot = store.startSession(connection.code, message.leadTimeMs ?? 3000);
        broadcast(connection.code, {
          type: "prepareStart",
          transportStartTimeMs: snapshot.transportStartTimeMs ?? snapshot.serverTimeMs,
          serverTimeMs: snapshot.serverTimeMs,
        });
        broadcast(connection.code, {
          type: "startConfirmed",
          transportStartTimeMs: snapshot.transportStartTimeMs ?? snapshot.serverTimeMs,
          serverTimeMs: Date.now(),
        });
        broadcastSnapshot(connection.code);
        return;
      }
      case "hostStop": {
        if (connection.role !== "host") return;
        store.stopSession(connection.code);
        broadcast(connection.code, { type: "stopped", serverTimeMs: Date.now() });
        broadcastSnapshot(connection.code);
        return;
      }
      case "hostForceHolding": {
        if (connection.role !== "host") return;
        store.forceHolding(connection.code);
        broadcast(connection.code, { type: "holdingForced", serverTimeMs: Date.now() });
        broadcastSnapshot(connection.code);
        return;
      }
    }
  } catch (error) {
    send(connection.ws, {
      type: "error",
      message: error instanceof Error ? error.message : "Message handling failed.",
    });
  }
}

function addConnection(connection: ClientConnection): void {
  const set = connectionsByCode.get(connection.code) ?? new Set<ClientConnection>();
  set.add(connection);
  connectionsByCode.set(connection.code, set);
}

function removeConnection(connection: ClientConnection): void {
  const set = connectionsByCode.get(connection.code);
  set?.delete(connection);
  if (set?.size === 0) {
    connectionsByCode.delete(connection.code);
  }
}

function broadcastSnapshot(code: string): void {
  broadcast(code, { type: "snapshot", snapshot: store.snapshotByCode(code) });
}

function broadcast(code: string, message: ServerToClientMessage): void {
  for (const connection of connectionsByCode.get(code) ?? []) {
    send(connection.ws, message);
  }
}

function send(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function loadFixture(): Composition {
  const path = fileURLToPath(
    new URL("../../../packages/composition/fixtures/rehearsal-basic.json", import.meta.url),
  );
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const result = validateComposition(parsed);

  if (!result.ok) {
    throw new Error(`Fixture validation failed: ${JSON.stringify(result.issues, null, 2)}`);
  }

  return result.value;
}

function parseSessionComposition(input: unknown): Composition {
  if (input === undefined) {
    return fixture;
  }

  const result = validateComposition(input);
  if (!result.ok) {
    throw new Error(`Composition validation failed: ${result.issues[0]?.message ?? "Invalid Composition."}`);
  }

  return result.value;
}

function parseRequiredComposition(input: unknown): Composition {
  if (input === undefined) {
    throw new HttpError(400, "composition is required.");
  }

  const result = validateComposition(input);
  if (!result.ok) {
    throw new HttpError(400, `Composition validation failed: ${result.issues[0]?.message ?? "Invalid Composition."}`);
  }

  return result.value;
}

function parseOwnerEmail(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "ownerEmail is required.");
  }

  try {
    return normalizeOwnerEmail(input);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "A valid owner email is required.");
  }
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function setCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
