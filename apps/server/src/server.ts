import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type ServerOptions as HttpsServerOptions } from "node:https";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { validateComposition, type Composition } from "@herd/composition";
import type {
  ClientRole,
  ClientToServerMessage,
  CreateSessionResponse,
  ServerToClientMessage,
} from "@herd/protocol";
import {
  createAuthRepository,
  sanitizeReturnTo,
  sessionHash,
  tokenHash,
  type AuthSession,
} from "./authStore";
import {
  createClearedSessionCookie,
  createSessionId,
  createSignedSessionCookie,
  isSessionSecretConfigured,
  magicLinkTtlMs,
  readSignedSessionCookie,
  sessionTtlMs,
} from "./authCookies";
import { normalizeOwnerEmail } from "./creatorStore";
import { createCreatorRepository } from "./creatorRepository";
import {
  createPackageDownloadUrl,
  createPackageUploadUrl,
  loadTigrisStorageConfig,
} from "./packageStorage";
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

interface PositioningLabDevice {
  id: string;
  label: string;
  joinedAt: number;
  lastSeenAt: number;
  audio: "unknown" | "ready" | "blocked";
  mic: "unknown" | "granted" | "denied";
  sampleRate: number | null;
}

interface PositioningLabMeasurement {
  deviceId: string;
  label: string;
  scanId: string;
  detected: boolean;
  distanceMeters: number | null;
  arrivalTimeMs: number | null;
  confidence: number;
  snr: number | null;
  peakWidthMs: number | null;
  processingMs: number;
}

interface PositioningLabScan {
  id: string;
  profileId: string;
  createdAt: number;
  startAt: number;
  durationMs: number;
  status: "scheduled" | "running" | "complete" | "stopped";
  measurements: PositioningLabMeasurement[];
}

interface PositioningLabSession {
  name: string;
  devices: Map<string, PositioningLabDevice>;
  latestScan: PositioningLabScan | null;
}

const fixture = loadFixture();
const store = new SessionStore();
const authStore = createAuthRepository();
const creatorStore = createCreatorRepository();
const connectionsByCode = new Map<string, Set<ClientConnection>>();
const positioningLabSessions = new Map<string, PositioningLabSession>();
const defaultDevCertFile = resolve(fileURLToPath(new URL("../../..", import.meta.url)), ".certs/herd-dev.pem");
const defaultDevKeyFile = resolve(fileURLToPath(new URL("../../..", import.meta.url)), ".certs/herd-dev-key.pem");

export function startServer(options: HerdServerOptions = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 8787);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const httpsOptions = loadHttpsOptions();
  const protocol = httpsOptions === null ? "http" : "https";
  const server = httpsOptions === null
    ? createHttpServer(handleRequest)
    : createHttpsServer(httpsOptions, handleRequest);
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
    console.log(`Herd server listening on ${protocol}://${host}:${port}`);
  });

  return { server, wss, store };
}

function loadHttpsOptions(): HttpsServerOptions | null {
  const certFile = process.env.HTTPS_CERT_FILE ?? getDefaultDevCertFile();
  const keyFile = process.env.HTTPS_KEY_FILE ?? getDefaultDevKeyFile();
  if (certFile === undefined && keyFile === undefined) {
    return null;
  }
  if (certFile === undefined || keyFile === undefined) {
    throw new Error("HTTPS_CERT_FILE and HTTPS_KEY_FILE must be set together.");
  }

  return {
    cert: readFileSync(certFile),
    key: readFileSync(keyFile),
  };
}

function getDefaultDevCertFile(): string | undefined {
  return process.env.NODE_ENV !== "production" && existsSync(defaultDevCertFile) ? defaultDevCertFile : undefined;
}

function getDefaultDevKeyFile(): string | undefined {
  return process.env.NODE_ENV !== "production" && existsSync(defaultDevKeyFile) ? defaultDevKeyFile : undefined;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  setCors(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
      writeJson(response, 200, {
        ok: true,
        serverTimeMs: Date.now(),
        activeSessions: store.sessionCount(),
        activeWebSocketRooms: connectionsByCode.size,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      const tigris = loadTigrisStorageConfig();
      const dependencies = {
        authStore: authStore.kind,
        creatorStore: creatorStore.kind,
        postgres: await authStore.healthCheck(),
        tigris: tigris === null ? "not_configured" : "configured",
        resend: process.env.RESEND_API_KEY === undefined ? "dev_console" : "configured",
        sessionSecret: isSessionSecretConfigured() ? "configured" : "development_default",
      };
      writeJson(response, 200, {
        ok: true,
        serverTimeMs: Date.now(),
        dependencies,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/version") {
      writeJson(response, 200, {
        name: "herd-server",
        version: process.env.HERD_VERSION ?? "local",
        revision: process.env.FLY_IMAGE_REF ?? process.env.GIT_COMMIT_SHA ?? "unknown",
        buildTime: process.env.HERD_BUILD_TIME ?? "unknown",
        environment: process.env.NODE_ENV ?? "development",
        schemaVersion: "0.2.0",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/magic-links") {
      const body = await readJsonBody(request);
      const email = parseOwnerEmail(body.email);
      const returnTo = sanitizeReturnTo(typeof body.returnTo === "string" ? body.returnTo : "/authoring");
      const token = randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + magicLinkTtlMs;
      await authStore.createMagicLink({
        email,
        tokenHash: tokenHash(token),
        returnTo,
        expiresAt,
      });
      const verifyUrl = `${getPublicBaseUrl(request)}/api/auth/verify?token=${encodeURIComponent(token)}`;
      await sendMagicLinkEmail(email, verifyUrl);
      writeJson(response, 202, {
        ok: true,
        expiresAt,
        delivery: process.env.RESEND_API_KEY === undefined ? "dev_console" : "email",
        ...(process.env.RESEND_API_KEY === undefined ? { devVerifyUrl: verifyUrl } : {}),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/verify") {
      const token = url.searchParams.get("token");
      if (token === null || token.length === 0) {
        throw new HttpError(400, "token is required.");
      }

      const magicLink = await authStore.consumeMagicLink(tokenHash(token));
      if (magicLink === null) {
        throw new HttpError(400, "Magic link is invalid or expired.");
      }

      const sessionId = createSessionId();
      await authStore.createSession(
        magicLink.email,
        sessionHash(sessionId),
        Date.now() + sessionTtlMs,
      );
      response.setHeader("Set-Cookie", createSignedSessionCookie(sessionId));
      writeRedirect(response, magicLink.returnTo);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      const session = await getAuthenticatedSession(request);
      writeJson(response, 200, {
        authenticated: session !== null,
        user: session === null ? null : { id: session.userId, email: session.email },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const parsed = readSignedSessionCookie(request);
      if (parsed !== null) {
        await authStore.deleteSession(parsed.sessionHash);
      }
      response.setHeader("Set-Cookie", createClearedSessionCookie());
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/fixtures/rehearsal-basic") {
      writeJson(response, 200, fixture);
      return;
    }

    const positioningClockMatch = url.pathname.match(/^\/api\/positioning-lab\/([^/]+)\/clock$/);
    if (request.method === "GET" && positioningClockMatch?.[1] !== undefined) {
      getPositioningLabSession(decodeURIComponent(positioningClockMatch[1]));
      writeJson(response, 200, {
        serverTimeMs: Date.now(),
      });
      return;
    }

    const positioningMatch = url.pathname.match(/^\/api\/positioning-lab\/([^/]+)$/);
    if (request.method === "GET" && positioningMatch?.[1] !== undefined) {
      writeJson(response, 200, serializePositioningLabSession(getPositioningLabSession(decodeURIComponent(positioningMatch[1]))));
      return;
    }

    const positioningDeviceMatch = url.pathname.match(/^\/api\/positioning-lab\/([^/]+)\/devices$/);
    if (request.method === "POST" && positioningDeviceMatch?.[1] !== undefined) {
      const session = getPositioningLabSession(decodeURIComponent(positioningDeviceMatch[1]));
      const body = await readJsonBody(request);
      const device = upsertPositioningLabDevice(session, body);
      writeJson(response, 201, {
        serverTimeMs: Date.now(),
        device,
        session: serializePositioningLabSession(session),
      });
      return;
    }

    const positioningHeartbeatMatch = url.pathname.match(/^\/api\/positioning-lab\/([^/]+)\/devices\/([^/]+)\/heartbeat$/);
    if (request.method === "POST" && positioningHeartbeatMatch?.[1] !== undefined && positioningHeartbeatMatch[2] !== undefined) {
      const session = getPositioningLabSession(decodeURIComponent(positioningHeartbeatMatch[1]));
      const body = await readJsonBody(request);
      const device = session.devices.get(decodeURIComponent(positioningHeartbeatMatch[2]));
      if (device !== undefined) {
        patchPositioningLabDevice(device, body);
        device.lastSeenAt = Date.now();
      }
      writeJson(response, 200, {
        serverTimeMs: Date.now(),
        session: serializePositioningLabSession(session),
      });
      return;
    }

    const positioningScanMatch = url.pathname.match(/^\/api\/positioning-lab\/([^/]+)\/scans$/);
    if (request.method === "POST" && positioningScanMatch?.[1] !== undefined) {
      const session = getPositioningLabSession(decodeURIComponent(positioningScanMatch[1]));
      const body = await readJsonBody(request);
      const scan = createPositioningLabScan(session, body);
      writeJson(response, 201, {
        serverTimeMs: Date.now(),
        scan,
        session: serializePositioningLabSession(session),
      });
      return;
    }

    const positioningMeasurementMatch = url.pathname.match(/^\/api\/positioning-lab\/([^/]+)\/scans\/([^/]+)\/measurements$/);
    if (request.method === "POST" && positioningMeasurementMatch?.[1] !== undefined && positioningMeasurementMatch[2] !== undefined) {
      const session = getPositioningLabSession(decodeURIComponent(positioningMeasurementMatch[1]));
      const scan = session.latestScan;
      if (scan === null || scan.id !== decodeURIComponent(positioningMeasurementMatch[2])) {
        throw new HttpError(404, "Scan not found.");
      }
      const body = await readJsonBody(request);
      recordPositioningLabMeasurement(scan, body);
      writeJson(response, 202, {
        serverTimeMs: Date.now(),
        session: serializePositioningLabSession(session),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/creator/compositions") {
      const ownerEmail = await resolveOwnerEmail(request, url.searchParams.get("ownerEmail"));

      writeJson(response, 200, { compositions: await creatorStore.listCompositions(ownerEmail) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/creator/compositions") {
      const body = await readJsonBody(request);
      const ownerEmail = await resolveOwnerEmail(request, body.ownerEmail);
      const composition = parseRequiredComposition(body.composition);
      const record = await creatorStore.saveComposition({ ownerEmail, composition });
      writeJson(response, 201, { composition: record });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/creator/packages") {
      const ownerEmail = await resolveOwnerEmail(request, url.searchParams.get("ownerEmail"));

      writeJson(response, 200, { packages: await creatorStore.listPackages(ownerEmail) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/creator/packages") {
      const body = await readJsonBody(request);
      const ownerEmail = await resolveOwnerEmail(request, body.ownerEmail);
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

    const packageConfirmMatch = url.pathname.match(/^\/api\/creator\/packages\/([^/]+)\/confirm$/);
    if (request.method === "POST" && packageConfirmMatch?.[1] !== undefined) {
      const body = await readJsonBody(request);
      const ownerEmail = await resolveOwnerEmail(request, body.ownerEmail);
      const record = await creatorStore.confirmPackageUpload({
        ownerEmail,
        packageId: decodeURIComponent(packageConfirmMatch[1]),
        contentType: typeof body.contentType === "string" ? body.contentType : "application/zip",
        sizeBytes: parseNonNegativeInteger(body.sizeBytes, "sizeBytes"),
        sha256: parseSha256(body.sha256),
      });
      writeJson(response, 200, { package: record });
      return;
    }

    const packageDownloadMatch = url.pathname.match(/^\/api\/creator\/packages\/([^/]+)\/download$/);
    if (request.method === "GET" && packageDownloadMatch?.[1] !== undefined) {
      const ownerEmail = await resolveOwnerEmail(request, url.searchParams.get("ownerEmail"));
      const record = await creatorStore.getPackage(ownerEmail, decodeURIComponent(packageDownloadMatch[1]));
      if (record === null) {
        throw new HttpError(404, "Package not found.");
      }
      if (record.status !== "ready") {
        throw new HttpError(409, "Package upload is not confirmed.");
      }

      const tigris = loadTigrisStorageConfig();
      const downloadUrl = tigris === null
        ? null
        : await createPackageDownloadUrl({ config: tigris, objectKey: record.objectKey });
      writeJson(response, 200, {
        package: record,
        download: {
          configured: tigris !== null,
          downloadUrl,
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

    if (request.method === "GET" && await serveStaticApp(url.pathname, response)) {
      return;
    }

    writeJson(response, 404, { error: "Not found." });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    writeJson(response, status, {
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
      case "positioningMeasurements": {
        if (connection.participantId === undefined) return;
        store.recordPositioningMeasurements(connection.code, connection.participantId, message.measurements);
        broadcastSnapshot(connection.code);
        return;
      }
      case "hostOverride": {
        if (connection.role !== "host") return;
        store.recordHostOverride(connection.code, message.override);
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

async function getAuthenticatedSession(request: IncomingMessage): Promise<AuthSession | null> {
  const parsed = readSignedSessionCookie(request);
  if (parsed === null) {
    return null;
  }

  return authStore.getSession(parsed.sessionHash);
}

async function resolveOwnerEmail(request: IncomingMessage, devOwnerEmail: unknown): Promise<string> {
  const session = await getAuthenticatedSession(request);
  if (session !== null) {
    return session.email;
  }

  if (process.env.ALLOW_DEV_OWNER_EMAIL === "true") {
    return parseOwnerEmail(devOwnerEmail);
  }

  throw new HttpError(401, "Sign in is required.");
}

async function sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Herd <auth@herd.local>";

  if (apiKey === undefined || apiKey.length === 0) {
    console.log(`Herd magic link for ${email}: ${verifyUrl}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Sign in to Herd",
      html: `<p>Use this link to sign in to Herd:</p><p><a href="${escapeHtml(verifyUrl)}">Sign in to Herd</a></p><p>This link expires in 15 minutes.</p>`,
      text: `Use this link to sign in to Herd:\n\n${verifyUrl}\n\nThis link expires in 15 minutes.`,
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, `Resend delivery failed: ${response.status}`);
  }
}

function getPublicBaseUrl(request: IncomingMessage): string {
  if (process.env.APP_BASE_URL !== undefined && process.env.APP_BASE_URL.length > 0) {
    return process.env.APP_BASE_URL.replace(/\/+$/, "");
  }

  const proto = request.headers["x-forwarded-proto"] ?? "http";
  const host = request.headers.host ?? "localhost:8787";
  return `${Array.isArray(proto) ? proto[0] : proto}://${host}`;
}

function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${field} must be a non-negative integer.`);
  }
  return value;
}

function parseSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new HttpError(400, "sha256 must be a 64-character hex digest.");
  }
  return value.toLowerCase();
}

function getPositioningLabSession(name: string): PositioningLabSession {
  const normalized = name.trim().length === 0 ? "default" : name.trim().slice(0, 120);
  const existing = positioningLabSessions.get(normalized);
  if (existing !== undefined) {
    updatePositioningScanStatus(existing.latestScan);
    return existing;
  }

  const created: PositioningLabSession = {
    name: normalized,
    devices: new Map(),
    latestScan: null,
  };
  positioningLabSessions.set(normalized, created);
  return created;
}

function upsertPositioningLabDevice(session: PositioningLabSession, body: Record<string, unknown>): PositioningLabDevice {
  const now = Date.now();
  const requestedId = typeof body.deviceId === "string" && body.deviceId.length > 0
    ? body.deviceId.slice(0, 120)
    : `device-${randomUUID()}`;
  const existing = session.devices.get(requestedId);
  const device = existing ?? {
    id: requestedId,
    label: typeof body.label === "string" && body.label.trim().length > 0 ? body.label.trim().slice(0, 80) : "Phone",
    joinedAt: now,
    lastSeenAt: now,
    audio: "unknown" as const,
    mic: "unknown" as const,
    sampleRate: null,
  };
  patchPositioningLabDevice(device, body);
  device.lastSeenAt = now;
  session.devices.set(device.id, device);
  return device;
}

function patchPositioningLabDevice(device: PositioningLabDevice, body: Record<string, unknown>): void {
  if (typeof body.label === "string" && body.label.trim().length > 0) {
    device.label = body.label.trim().slice(0, 80);
  }
  if (body.audio === "ready" || body.audio === "blocked" || body.audio === "unknown") {
    device.audio = body.audio;
  }
  if (body.mic === "granted" || body.mic === "denied" || body.mic === "unknown") {
    device.mic = body.mic;
  }
  if (typeof body.sampleRate === "number" && Number.isFinite(body.sampleRate) && body.sampleRate > 0) {
    device.sampleRate = Math.round(body.sampleRate);
  }
}

function createPositioningLabScan(session: PositioningLabSession, body: Record<string, unknown>): PositioningLabScan {
  const now = Date.now();
  const scan: PositioningLabScan = {
    id: `scan-${now}`,
    profileId: typeof body.profileId === "string" && body.profileId.length > 0 ? body.profileId : "coded-ultrasonic-noise",
    createdAt: now,
    startAt: now + 2400,
    durationMs: 1800,
    status: "scheduled",
    measurements: [],
  };
  session.latestScan = scan;
  return scan;
}

function recordPositioningLabMeasurement(scan: PositioningLabScan, body: Record<string, unknown>): void {
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  if (deviceId.length === 0) {
    throw new HttpError(400, "deviceId is required.");
  }
  const measurement: PositioningLabMeasurement = {
    deviceId,
    label: typeof body.label === "string" ? body.label.slice(0, 80) : deviceId,
    scanId: scan.id,
    detected: body.detected === true,
    distanceMeters: typeof body.distanceMeters === "number" && Number.isFinite(body.distanceMeters) ? body.distanceMeters : null,
    arrivalTimeMs: typeof body.arrivalTimeMs === "number" && Number.isFinite(body.arrivalTimeMs) ? body.arrivalTimeMs : null,
    confidence: typeof body.confidence === "number" && Number.isFinite(body.confidence) ? body.confidence : 0,
    snr: typeof body.snr === "number" && Number.isFinite(body.snr) ? body.snr : null,
    peakWidthMs: typeof body.peakWidthMs === "number" && Number.isFinite(body.peakWidthMs) ? body.peakWidthMs : null,
    processingMs: typeof body.processingMs === "number" && Number.isFinite(body.processingMs) ? body.processingMs : 0,
  };
  scan.measurements = scan.measurements.filter((candidate) => candidate.deviceId !== measurement.deviceId);
  scan.measurements.push(measurement);
  updatePositioningScanStatus(scan);
}

function serializePositioningLabSession(session: PositioningLabSession) {
  updatePositioningScanStatus(session.latestScan);
  return {
    name: session.name,
    serverTimeMs: Date.now(),
    devices: [...session.devices.values()],
    latestScan: session.latestScan,
  };
}

function updatePositioningScanStatus(scan: PositioningLabScan | null): void {
  if (scan === null || scan.status === "complete" || scan.status === "stopped") return;
  const now = Date.now();
  if (now >= scan.startAt + scan.durationMs + 700) {
    scan.status = "complete";
  } else if (now >= scan.startAt) {
    scan.status = "running";
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

function writeRedirect(response: ServerResponse, location: string): void {
  response.writeHead(303, {
    "Location": location,
  });
  response.end();
}

function setCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  response.setHeader("Access-Control-Allow-Origin", typeof origin === "string" ? origin : "*");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function serveStaticApp(pathname: string, response: ServerResponse): Promise<boolean> {
  const staticRoot = process.env.HERD_STATIC_ROOT === undefined
    ? resolve(fileURLToPath(new URL("../../..", import.meta.url)))
    : resolve(process.env.HERD_STATIC_ROOT);
  const mount = resolveStaticMount(pathname);
  if (mount === null) {
    return false;
  }

  const relativePath = pathname === mount.path || pathname === `${mount.path}/`
    ? "index.html"
    : normalize(pathname.slice(mount.path.length).replace(/^\/+/, ""));
  if (relativePath.startsWith("..")) {
    return false;
  }

  const appRoot = resolve(staticRoot, mount.distPath);
  const candidate = resolve(appRoot, relativePath);
  const filePath = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(appRoot, "index.html");

  if (!filePath.startsWith(appRoot) || !existsSync(filePath)) {
    return false;
  }

  response.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  await new Promise<void>((resolveStream, reject) => {
    createReadStream(filePath)
      .on("error", reject)
      .on("end", resolveStream)
      .pipe(response);
  });
  return true;
}

function resolveStaticMount(pathname: string): { path: string; distPath: string } | null {
  if (pathname === "/") {
    return { path: "/", distPath: "apps/host/dist" };
  }

  const mounts = [
    { path: "/authoring", distPath: "apps/authoring/dist" },
    { path: "/host", distPath: "apps/host/dist" },
    { path: "/join", distPath: "apps/participant/dist" },
    { path: "/positioning-lab", distPath: "apps/positioning-lab/dist" },
    { path: "/positioning-device", distPath: "apps/positioning-lab/dist" },
  ];

  return mounts.find((mount) => pathname === mount.path || pathname.startsWith(`${mount.path}/`)) ?? null;
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
