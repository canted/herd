import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Copy,
  Download,
  FileInput,
  Layers,
  Pause,
  Play,
  Plus,
  Radio,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  AssetReference,
  Boundary,
  ChoiceOption,
  Composition,
  ParameterBag,
  ParameterValue,
  Program,
  ProgramCompletion,
  ProgramVoice,
  StepEvent,
} from "@herd/composition";
import { validateComposition } from "@herd/composition";
import {
  applyParameterLocks,
  buildCompositionTimeline,
  buildRuntimeTimeline,
  playPolySh101Event,
} from "@herd/runtime";
import {
  clampStepCount,
  clearModulationRoute,
  clearStepEventLock,
  cloneComposition,
  createBlankComposition,
  createProgram,
  createVoice,
  duplicateComposition,
  ensureStepEvent,
  findStepEvent,
  getModulationRoutes,
  getNestedParameter,
  getProgram,
  getStepLocks,
  getVoice,
  normalizeStepEventList,
  seedCompositions,
  setModulationRoute,
  setNestedParameter,
  setStepEventLock,
  updateModulationRoute,
  validateAuthoringComposition,
  type DeviceScope,
  type LockScope,
  type ModulationRoute,
} from "./model";

const storageKey = "herd.authoring.compositions.v1";
const creatorEmailStorageKey = "herd.authoring.creatorEmail.v1";
const runsOnAuthoringDevServer = isLocalDevPort("5175");
const serverBase = runsOnAuthoringDevServer
  ? import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787"
  : window.location.origin;
const hostBase = runsOnAuthoringDevServer
  ? import.meta.env.VITE_HOST_URL ?? "http://localhost:5173"
  : `${window.location.origin}/host`;

interface WebKitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function isLocalDevPort(port: string): boolean {
  return (
    window.location.port === port &&
    ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(window.location.hostname)
  );
}

function createAudioContext(): AudioContext {
  const AudioContextConstructor = window.AudioContext ?? (window as WebKitAudioWindow).webkitAudioContext;
  if (AudioContextConstructor === undefined) {
    throw new Error("Web Audio is unavailable in this browser.");
  }
  return new AudioContextConstructor();
}

const boundaries: Boundary[] = [
  "immediate",
  "nextStep",
  "nextBeat",
  "nextBar",
  "patternLoopEnd",
  "patternRunEnd",
  "programEnd",
];

interface LayersState {
  instrument: boolean;
  visualizer: boolean;
  locks: boolean;
}

interface ModulatorDraft {
  source: string;
  amount: number;
}

interface ModulationCapture {
  device: DeviceScope;
  modulator: number;
}

type StepToggleMode = "both" | "instrument" | "visualizer";
type PreviewMode = "pattern" | "program";

interface EmbeddedAssetPayload {
  dataUrl: string;
  mimeType: string;
  name: string;
  size: number;
}

interface ImportedAsset {
  asset: AssetReference;
  embeddedPayload?: EmbeddedAssetPayload;
}

interface AuthUser {
  id: string;
  email: string;
}

const defaultModulators: Record<DeviceScope, ModulatorDraft[]> = {
  instrument: [
    { source: "lfo", amount: 0.25 },
    { source: "velocity", amount: 0.2 },
    { source: "choice", amount: 0.35 },
    { source: "random", amount: 0.18 },
  ],
  visualizer: [
    { source: "lfo", amount: 0.35 },
    { source: "step", amount: 0.2 },
    { source: "choice", amount: 0.4 },
    { source: "random", amount: 0.22 },
  ],
};

export function App() {
  const [compositions, setCompositions] = useState<Composition[]>(loadCompositions);
  const [activeId, setActiveId] = useState(compositions[0]?.id ?? "");
  const [selectedProgramId, setSelectedProgramId] = useState(compositions[0]?.programSequencer.initialProgramId ?? "");
  const [selectedVoiceId, setSelectedVoiceId] = useState(compositions[0]?.programs[0]?.voices[0]?.id ?? "");
  const [selectedStep, setSelectedStep] = useState(0);
  const [layers, setLayers] = useState<LayersState>({
    instrument: true,
    visualizer: true,
    locks: true,
  });
  const [lockCapture, setLockCapture] = useState(false);
  const [modulationCapture, setModulationCapture] = useState<ModulationCapture | null>(null);
  const [modulators, setModulators] = useState(defaultModulators);
  const [importError, setImportError] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [creatorEmail, setCreatorEmail] = useState(() => localStorage.getItem(creatorEmailStorageKey) ?? "");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const packageInputRef = useRef<HTMLInputElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<AudioContext | null>(null);
  const previewTimersRef = useRef<number[]>([]);
  const compositionsRef = useRef(compositions);
  const activeIdRef = useRef(activeId);
  const selectedProgramIdRef = useRef(selectedProgramId);
  const selectedVoiceIdRef = useRef(selectedVoiceId);

  const activeComposition = compositions.find((composition) => composition.id === activeId) ?? compositions[0];
  const selectedProgram = activeComposition?.programs.find((program) => program.id === selectedProgramId)
    ?? activeComposition?.programs[0];
  const selectedVoice = selectedProgram?.voices.find((voice) => voice.id === selectedVoiceId)
    ?? selectedProgram?.voices[0];
  const selectedEvent = selectedVoice === undefined ? undefined : findStepEvent(selectedVoice, selectedStep);
  const validation = activeComposition === undefined
    ? { errors: ["No Composition open."], warnings: [] }
    : validateAuthoringComposition(activeComposition);
  const timeline = activeComposition === undefined ? null : buildCompositionTimeline(activeComposition);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(compositions));
  }, [compositions]);

  useEffect(() => {
    compositionsRef.current = compositions;
    activeIdRef.current = activeId;
    selectedProgramIdRef.current = selectedProgram?.id ?? selectedProgramId;
    selectedVoiceIdRef.current = selectedVoice?.id ?? selectedVoiceId;
  });

  useEffect(() => {
    localStorage.setItem(creatorEmailStorageKey, creatorEmail);
  }, [creatorEmail]);

  useEffect(() => {
    void refreshAuthSession();
  }, []);

  useEffect(() => () => stopPreview(), []);

  useEffect(() => {
    if (activeComposition === undefined) return;
    if (!activeComposition.programs.some((program) => program.id === selectedProgramId)) {
      const fallbackProgram = activeComposition.programs[0];
      if (fallbackProgram !== undefined) {
        setSelectedProgramId(fallbackProgram.id);
        setSelectedVoiceId(fallbackProgram.voices[0]?.id ?? "");
      } else {
        setSelectedProgramId("");
        setSelectedVoiceId("");
      }
    }
  }, [activeComposition, selectedProgramId]);

  useEffect(() => {
    if (selectedProgram === undefined) return;
    if (!selectedProgram.voices.some((voice) => voice.id === selectedVoiceId)) {
      setSelectedVoiceId(selectedProgram.voices[0]?.id ?? "");
    }
  }, [selectedProgram, selectedVoiceId]);

  function updateActive(mutator: (composition: Composition) => void) {
    setCompositions((current) =>
      current.map((composition) => {
        if (composition.id !== activeId) return composition;
        const next = cloneComposition(composition);
        mutator(next);
        return next;
      }),
    );
  }

  function createComposition() {
    const composition = createBlankComposition();
    setCompositions((current) => [...current, composition]);
    setActiveId(composition.id);
    setSelectedProgramId("");
    setSelectedVoiceId("");
    setSelectedStep(0);
  }

  function duplicateActive() {
    if (activeComposition === undefined) return;
    const duplicate = duplicateComposition(activeComposition);
    setCompositions((current) => [...current, duplicate]);
    setActiveId(duplicate.id);
    setSelectedProgramId(duplicate.programSequencer.initialProgramId);
    setSelectedVoiceId(duplicate.programs[0]?.voices[0]?.id ?? "");
  }

  function renameActive(name: string) {
    updateActive((composition) => {
      composition.name = name;
    });
  }

  async function importComposition(file: File) {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = validateComposition(parsed);
      if (!result.ok) {
        setImportError(result.issues[0]?.message ?? "Invalid Composition.");
        return;
      }
      setCompositions((current) => [...current, result.value]);
      setActiveId(result.value.id);
      setSelectedProgramId(result.value.programSequencer.initialProgramId);
      setSelectedVoiceId(result.value.programs[0]?.voices[0]?.id ?? "");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    }
  }

  async function importPackage(file: File) {
    setImportError(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const compositionFile = zip.file("composition.json");

      if (compositionFile === null) {
        setImportError("Package is missing composition.json.");
        return;
      }

      const parsed = JSON.parse(await compositionFile.async("text")) as unknown;
      const result = validateComposition(parsed);
      if (!result.ok) {
        setImportError(result.issues[0]?.message ?? "Invalid Composition package.");
        return;
      }

      const composition = cloneComposition(result.value);
      const embeddedAssets = ensureEmbeddedAssets(composition);

      for (const asset of composition.assets) {
        const assetFile = zip.file(normalizePackagePath(asset.path));
        if (assetFile === null) continue;

        const bytes = await assetFile.async("uint8array");
        const mimeType = guessMimeType(asset);
        const assetBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(assetBuffer).set(bytes);
        embeddedAssets[asset.id] = {
          dataUrl: await blobToDataUrl(new Blob([assetBuffer], { type: mimeType })),
          mimeType,
          name: asset.path.split("/").pop() ?? asset.id,
          size: bytes.byteLength,
        };
      }

      setCompositions((current) => [...current, composition]);
      setActiveId(composition.id);
      setSelectedProgramId(composition.programSequencer.initialProgramId);
      setSelectedVoiceId(composition.programs[0]?.voices[0]?.id ?? "");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Package import failed.");
    }
  }

  async function importAssets(files: FileList) {
    const imports = await Promise.all([...files].map(createAssetFromFile));
    updateActive((composition) => {
      const embeddedAssets = ensureEmbeddedAssets(composition);
      for (const { asset, embeddedPayload } of imports) {
        composition.assets = composition.assets.filter((candidate) => candidate.id !== asset.id);
        composition.assets.push(asset);
        if (embeddedPayload !== undefined) {
          embeddedAssets[asset.id] = embeddedPayload;
        }
      }
    });
  }

  function exportActive() {
    if (activeComposition === undefined) return;
    const blob = new Blob([JSON.stringify(activeComposition, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${activeComposition.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function refreshAuthSession() {
    const response = await fetch(`${serverBase}/api/auth/session`, {
      credentials: "include",
    });
    if (!response.ok) {
      setAuthUser(null);
      return;
    }

    const payload = (await response.json()) as {
      authenticated: boolean;
      user: AuthUser | null;
    };
    setAuthUser(payload.authenticated ? payload.user : null);
  }

  async function requestMagicLink() {
    setAuthStatus(null);
    const response = await fetch(`${serverBase}/api/auth/magic-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: creatorEmail,
        returnTo: "/authoring",
      }),
    });

    if (!response.ok) {
      setAuthStatus(`Sign-in link failed: ${response.status}`);
      return;
    }

    const payload = (await response.json()) as {
      delivery: string;
      devVerifyUrl?: string;
    };
    setAuthStatus(
      payload.devVerifyUrl === undefined
        ? "Magic link sent."
        : `Dev magic link: ${payload.devVerifyUrl}`,
    );
  }

  async function logout() {
    await fetch(`${serverBase}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setAuthUser(null);
    setAuthStatus("Signed out.");
  }

  async function exportPackage() {
    if (activeComposition === undefined) return;

    downloadBlob(await buildPackageBlob(activeComposition), `${activeComposition.id}.herd.zip`);
  }

  async function saveActiveToServer() {
    if (activeComposition === undefined) return;
    setServerStatus(null);

    const response = await fetch(`${serverBase}/api/creator/compositions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        composition: activeComposition,
      }),
    });

    if (!response.ok) {
      setServerStatus(`Save failed: ${response.status}`);
      return;
    }

    setServerStatus("Composition saved.");
  }

  async function uploadPackageToServer() {
    if (activeComposition === undefined) return;
    setServerStatus(null);

    const blob = await buildPackageBlob(activeComposition);
    const filename = `${activeComposition.id}.herd.zip`;
    const response = await fetch(`${serverBase}/api/creator/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        composition: activeComposition,
        filename,
        contentType: "application/zip",
      }),
    });

    if (!response.ok) {
      setServerStatus(`Package failed: ${response.status}`);
      return;
    }

    const payload = (await response.json()) as {
      package: {
        id: string;
      };
      upload: {
        configured: boolean;
        uploadUrl: string | null;
      };
    };

    if (payload.upload.uploadUrl === null) {
      setServerStatus("Package record created. Tigris is not configured.");
      return;
    }

    const uploadResponse = await fetch(payload.upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: blob,
    });

    if (!uploadResponse.ok) {
      setServerStatus(`Upload failed: ${uploadResponse.status}`);
      return;
    }

    const confirmResponse = await fetch(`${serverBase}/api/creator/packages/${encodeURIComponent(payload.package.id)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        contentType: "application/zip",
        sizeBytes: blob.size,
        sha256: await sha256Blob(blob),
      }),
    });

    setServerStatus(confirmResponse.ok ? "Package uploaded and confirmed." : `Confirm failed: ${confirmResponse.status}`);
  }

  async function buildPackageBlob(composition: Composition): Promise<Blob> {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const packaged = cloneComposition(composition);
    const embeddedAssets = readEmbeddedAssets(composition);

    for (const asset of packaged.assets) {
      asset.path = normalizePackagePath(asset.path);
      const payload = embeddedAssets[asset.id];
      if (payload === undefined) continue;

      zip.file(asset.path, await dataUrlToArrayBuffer(payload.dataUrl));
    }

    stripEmbeddedAssets(packaged);
    zip.file("composition.json", JSON.stringify(packaged, null, 2));

    return zip.generateAsync({ type: "blob" });
  }

  async function openRehearsalFromActive() {
    if (activeComposition === undefined) return;
    setLaunchError(null);
    const response = await fetch(`${serverBase}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: activeComposition.name,
        composition: activeComposition,
      }),
    });

    if (!response.ok) {
      setLaunchError(`Could not open rehearsal: ${response.status}`);
      return;
    }

    const payload = (await response.json()) as { snapshot: { code: string } };
    window.open(`${hostBase}/?code=${encodeURIComponent(payload.snapshot.code)}`, "_blank", "noopener,noreferrer");
  }

  function addProgram() {
    updateActive((composition) => {
      const program = createProgram();
      composition.programs.push(program);
      composition.programSequencer.steps.push({ programId: program.id });
      if (composition.programSequencer.initialProgramId.length === 0 || composition.programs.length === 1) {
        composition.programSequencer.initialProgramId = program.id;
      }
      setSelectedProgramId(program.id);
      setSelectedVoiceId(program.voices[0]?.id ?? "");
    });
  }

  function duplicateProgram(programId: string) {
    updateActive((composition) => {
      const original = getProgram(composition, programId);
      const duplicate = cloneComposition({
        ...composition,
        programs: [original],
      }).programs[0]!;
      duplicate.id = `program-${Math.random().toString(36).slice(2, 9)}`;
      duplicate.name = `${original.name} Copy`;
      composition.programs.push(duplicate);
      composition.programSequencer.steps.push({ programId: duplicate.id });
      setSelectedProgramId(duplicate.id);
      setSelectedVoiceId(duplicate.voices[0]?.id ?? "");
    });
  }

  function deleteProgram(programId: string) {
    updateActive((composition) => {
      composition.programs = composition.programs.filter((program) => program.id !== programId);
      composition.programSequencer.steps = composition.programSequencer.steps.filter((step) => step.programId !== programId);
      const fallback = composition.programs[0];
      if (composition.programSequencer.initialProgramId === programId || fallback === undefined) {
        composition.programSequencer.initialProgramId = fallback?.id ?? "";
      }
      setSelectedProgramId(fallback?.id ?? "");
      setSelectedVoiceId(fallback?.voices[0]?.id ?? "");
    });
  }

  function moveProgram(programId: string, direction: -1 | 1) {
    updateActive((composition) => {
      const index = composition.programSequencer.steps.findIndex((step) => step.programId === programId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= composition.programSequencer.steps.length) return;
      const [step] = composition.programSequencer.steps.splice(index, 1);
      if (step !== undefined) {
        composition.programSequencer.steps.splice(nextIndex, 0, step);
      }
    });
  }

  function addVoice() {
    if (selectedProgram === undefined) return;
    updateActive((composition) => {
      const program = getProgram(composition, selectedProgram.id);
      const voice = createVoice();
      program.voices.push(voice);
      setSelectedVoiceId(voice.id);
    });
  }

  function deleteVoice(voiceId: string) {
    if (selectedProgram === undefined) return;
    updateActive((composition) => {
      const program = getProgram(composition, selectedProgram.id);
      if (program.voices.length <= 1) return;
      program.voices = program.voices.filter((voice) => voice.id !== voiceId);
      setSelectedVoiceId(program.voices[0]?.id ?? "");
    });
  }

  function handleStepHover(step: number) {
    setSelectedStep(step);
  }

  function handleStepClick(step: number, mode: StepToggleMode) {
    setSelectedStep(step);
    if (selectedProgram === undefined || selectedVoice === undefined) return;

    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      const event = ensureStepEvent(voice, step);

      if (mode === "both") {
        const hasAnyTrigger = event.instrumentTrigger?.enabled === true || event.visualizerTrigger?.enabled === true;
        event.instrumentTrigger = {
          enabled: !hasAnyTrigger,
          durationMs: event.instrumentTrigger?.durationMs ?? 180,
        };
        event.visualizerTrigger = {
          enabled: !hasAnyTrigger,
          durationMs: event.visualizerTrigger?.durationMs ?? 240,
        };
      }

      if (mode === "instrument") {
        event.instrumentTrigger = {
          enabled: !(event.instrumentTrigger?.enabled ?? false),
          durationMs: event.instrumentTrigger?.durationMs ?? 180,
        };
      }

      if (mode === "visualizer") {
        event.visualizerTrigger = {
          enabled: !(event.visualizerTrigger?.enabled ?? false),
          durationMs: event.visualizerTrigger?.durationMs ?? 240,
        };
      }

      normalizeStepEventList(voice);
    });
  }

  function updateSelectedEvent(mutator: (event: StepEvent, voice: ProgramVoice) => void) {
    if (selectedProgram === undefined || selectedVoice === undefined) return;
    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      const event = ensureStepEvent(voice, selectedStep);
      mutator(event, voice);
      normalizeStepEventList(voice);
    });
  }

  function updateDeviceParameter(scope: DeviceScope, path: string, value: ParameterValue) {
    if (selectedProgram === undefined || selectedVoice === undefined) return;
    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      const target = scope === "instrument" ? voice.instrument.defaults : voice.visualizer.defaults;
      setNestedParameter(target, path, value);

      if (lockCapture) {
        const event = ensureStepEvent(voice, selectedStep);
        setStepEventLock(event, scope, path, value);
        setLockCapture(false);
      }
    });
  }

  function toggleModulationCapture(scope: DeviceScope, modulator: number) {
    setModulationCapture((current) =>
      current?.device === scope && current.modulator === modulator ? null : { device: scope, modulator },
    );
  }

  function captureModulationTarget(scope: DeviceScope, path: string, amount: number, range?: { min: number; max: number }) {
    if (selectedProgram === undefined || selectedVoice === undefined || modulationCapture?.device !== scope) return;
    const draft = modulators[scope][modulationCapture.modulator];
    if (draft === undefined) return;

    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      setModulationRoute(voice, {
        device: scope,
        modulator: modulationCapture.modulator + 1,
        source: draft.source,
        amount,
        target: path,
        enabled: true,
        ...(range === undefined ? {} : { range }),
      });
    });
    setModulationCapture(null);
  }

  function playPreviewPattern() {
    if (getPreviewSelectedVoice() === undefined) return;
    stopPreview();
    const context = createAudioContext();
    previewAudioRef.current = context;
    void context.resume();
    setPreviewMode("pattern");
    const previewState = {
      nextStep: 0,
      nextStepTime: context.currentTime + 0.06,
    };
    const scheduleTick = () => {
      if (previewAudioRef.current !== context) return;
      const voice = getPreviewSelectedVoice();
      if (voice === undefined) {
        stopPreview();
        return;
      }

      const lookAheadSeconds = 0.12;
      const minimumStart = context.currentTime + 0.03;
      const stepCount = Math.max(1, voice.pattern.stepCount);
      if (previewState.nextStep >= stepCount) {
        previewState.nextStep = 0;
      }
      if (previewState.nextStepTime < minimumStart) {
        previewState.nextStepTime = minimumStart;
      }

      while (previewState.nextStepTime <= context.currentTime + lookAheadSeconds) {
        schedulePatternStep(context, voice, previewState.nextStep, previewState.nextStepTime);
        previewState.nextStep = (previewState.nextStep + 1) % stepCount;
        previewState.nextStepTime += getPatternStepMs(voice) / 1000;
      }

      const timer = window.setTimeout(scheduleTick, 25);
      previewTimersRef.current = [timer];
    };
    scheduleTick();
  }

  function playPreviewProgram() {
    const previewComposition = getPreviewComposition();
    const previewProgramId = selectedProgramIdRef.current;
    if (previewComposition === undefined || previewProgramId.length === 0) return;
    stopPreview();
    const context = createAudioContext();
    previewAudioRef.current = context;
    void context.resume();
    setPreviewMode("program");

    const events = buildRuntimeTimeline(previewComposition, {
      programId: previewProgramId,
    }).filter((event) => event.type === "instrument");
    const now = context.currentTime + 0.08;
    let lastEventMs = 0;

    for (const event of events) {
      lastEventMs = Math.max(lastEventMs, event.timeMs + (event.durationMs ?? 180));
      if (event.instrumentType === "polySh101") {
        playPolySh101Event(context, now + event.timeMs / 1000, event.parameters, event.durationMs);
      }
    }

    const doneTimer = window.setTimeout(() => {
      if (previewAudioRef.current === context) {
        stopPreview();
      }
    }, Math.max(500, lastEventMs + 300));
    previewTimersRef.current.push(doneTimer);
  }

  function stopPreview() {
    for (const timer of previewTimersRef.current) {
      window.clearTimeout(timer);
    }
    previewTimersRef.current = [];
    const context = previewAudioRef.current;
    previewAudioRef.current = null;
    setPreviewMode(null);
    if (context !== null && context.state !== "closed") {
      void context.close();
    }
  }

  function getPreviewComposition(): Composition | undefined {
    return compositionsRef.current.find((composition) => composition.id === activeIdRef.current)
      ?? compositionsRef.current[0];
  }

  function getPreviewSelectedVoice(): ProgramVoice | undefined {
    const composition = getPreviewComposition();
    const program = composition?.programs.find((candidate) => candidate.id === selectedProgramIdRef.current)
      ?? composition?.programs[0];
    return program?.voices.find((candidate) => candidate.id === selectedVoiceIdRef.current)
      ?? program?.voices[0];
  }

  function patchModulationRoute(route: ModulationRoute, patch: Partial<ModulationRoute>) {
    if (selectedProgram === undefined || selectedVoice === undefined) return;
    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      updateModulationRoute(voice, route, patch);
    });
  }

  function removeModulationRoute(route: ModulationRoute) {
    if (selectedProgram === undefined || selectedVoice === undefined) return;
    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      clearModulationRoute(voice, route);
    });
  }

  if (activeComposition === undefined) {
    return (
      <main className="empty-shell">
        <button className="primary-button" onClick={createComposition}>Create Composition</button>
      </main>
    );
  }

  return (
    <main className="authoring-shell">
      <aside className="browser-panel">
        <div className="brand-row">
          <Boxes aria-hidden="true" />
          <span>Herd Author</span>
        </div>
        <div className="browser-actions">
          <button className="primary-button" onClick={createComposition}><Plus size={16} />New</button>
          <button onClick={duplicateActive}><Copy size={16} />Duplicate</button>
          <button onClick={() => packageInputRef.current?.click()}><FileInput size={16} />Import Package</button>
          <button onClick={() => void exportPackage()}><Download size={16} />Export Package</button>
          <button onClick={() => fileInputRef.current?.click()}><FileInput size={16} />Import JSON</button>
          <button onClick={exportActive}><Download size={16} />Export JSON</button>
        </div>
        <input
          ref={packageInputRef}
          className="hidden-input"
          type="file"
          accept=".herd.zip,application/zip"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) void importPackage(file);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) void importComposition(file);
            event.currentTarget.value = "";
          }}
        />
        {importError !== null && <p className="error-text">{importError}</p>}
        <div className="composition-list">
          {compositions.map((composition) => {
            const summary = validateAuthoringComposition(composition);
            return (
              <button
                key={composition.id}
                className={composition.id === activeId ? "composition-item active" : "composition-item"}
                onClick={() => {
                  setActiveId(composition.id);
                  setSelectedProgramId(composition.programSequencer.initialProgramId);
                  setSelectedVoiceId(composition.programs[0]?.voices[0]?.id ?? "");
                }}
              >
                <strong>{composition.name}</strong>
                <span>{composition.programs.length} Programs · {summary.errors.length} Errors · {summary.warnings.length} Warnings</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <input
              className="composition-name"
              value={activeComposition.name}
              onChange={(event) => renameActive(event.target.value)}
              aria-label="Composition name"
            />
            <p>{activeComposition.id}</p>
          </div>
          <div className="topbar-actions">
            <StatusBadge errors={validation.errors.length} warnings={validation.warnings.length} />
            <button onClick={exportActive}><Save size={16} />Save JSON</button>
            <button onClick={() => void openRehearsalFromActive()}><Radio size={16} />Open rehearsal</button>
          </div>
        </header>
        {launchError !== null && <p className="error-text">{launchError}</p>}

        <ProgramSequencer
          composition={activeComposition}
          selectedProgramId={selectedProgram?.id ?? selectedProgramId}
          previewing={previewMode === "program"}
          canPreview={selectedProgram !== undefined}
          onPlayPreview={playPreviewProgram}
          onStopPreview={stopPreview}
          onSelect={(programId) => {
            const program = getProgram(activeComposition, programId);
            setSelectedProgramId(programId);
            setSelectedVoiceId(program.voices[0]?.id ?? "");
          }}
          onAdd={addProgram}
          onDuplicate={duplicateProgram}
          onDelete={deleteProgram}
          onMove={moveProgram}
          onSetInitial={(programId) => updateActive((composition) => {
            composition.programSequencer.initialProgramId = programId;
          })}
        />

        <section className="editor-grid">
          <div className="left-column">
            {selectedProgram === undefined ? (
              <section className="panel empty-program-panel">
                <h2>No Program</h2>
                <p className="muted">Create a Program when you are ready to add Voices, patterns, and devices.</p>
                <button className="primary-button" onClick={addProgram}><Plus size={14} />Add Program</button>
              </section>
            ) : (
              <>
                <ProgramEditor
                  program={selectedProgram}
                  boundary={activeComposition.programSequencer.transitionPolicy.defaultBoundary}
                  onRename={(name) => updateActive((composition) => {
                    getProgram(composition, selectedProgram.id).name = name;
                  })}
                  onBoundary={(boundary) => updateActive((composition) => {
                    composition.programSequencer.transitionPolicy.defaultBoundary = boundary;
                  })}
                  onCompletion={(completion) => updateActive((composition) => {
                    getProgram(composition, selectedProgram.id).completion = completion;
                  })}
                />
                <VoiceSelector
                  program={selectedProgram}
                  selectedVoiceId={selectedVoice?.id ?? selectedVoiceId}
                  onSelect={setSelectedVoiceId}
                  onAdd={addVoice}
                  onDelete={deleteVoice}
                  onRename={(voiceId, name) => updateActive((composition) => {
                    getVoice(getProgram(composition, selectedProgram.id), voiceId).name = name;
                  })}
                />
              </>
            )}
            <ValidationPanel validation={validation} />
            <AssetManager
              assets={activeComposition.assets}
              inputRef={assetInputRef}
              onImport={(files) => void importAssets(files)}
              onRemove={(assetId) => updateActive((composition) => {
                composition.assets = composition.assets.filter((asset) => asset.id !== assetId);
                delete ensureEmbeddedAssets(composition)[assetId];
              })}
            />
            <CreatorPersistencePanel
              creatorEmail={creatorEmail}
              authUser={authUser}
              authStatus={authStatus}
              status={serverStatus}
              onCreatorEmail={setCreatorEmail}
              onMagicLink={() => void requestMagicLink()}
              onRefreshSession={() => void refreshAuthSession()}
              onLogout={() => void logout()}
              onSave={() => void saveActiveToServer()}
              onPackage={() => void uploadPackageToServer()}
            />
          </div>

          <div className="device-stack">
            {selectedProgram === undefined || selectedVoice === undefined ? (
              <section className="device-panel empty-program-panel">
                <DeviceHeader title="No Voice Selected" subtitle="Create a Program to begin authoring." />
              </section>
            ) : (
              <>
                <PatternEditor
                  voice={selectedVoice}
                  selectedStep={selectedStep}
                  layers={layers}
                  selectedEvent={selectedEvent}
                  onLayers={setLayers}
                  onStepHover={handleStepHover}
                  onStepToggle={handleStepClick}
                  onPatternChange={(mutator) => updateActive((composition) => {
                    mutator(getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id));
                  })}
                  onEventChange={updateSelectedEvent}
                  lockCapture={lockCapture}
                  previewPlaying={previewMode === "pattern"}
                  onPlayPreview={playPreviewPattern}
                  onStopPreview={stopPreview}
                />
                <InstrumentEditor
                  voice={selectedVoice}
                  selectedEvent={selectedEvent}
                  lockCapture={lockCapture}
                  modulationCapture={modulationCapture}
                  modulators={modulators.instrument}
                  onModulators={(drafts) => setModulators((current) => ({ ...current, instrument: drafts }))}
                  onArmModulation={(modulator) => toggleModulationCapture("instrument", modulator)}
                  onModulationTarget={(path, amount, range) => captureModulationTarget("instrument", path, amount, range)}
                  onParameter={(path, value) => updateDeviceParameter("instrument", path, value)}
                  onRoutePatch={patchModulationRoute}
                  onRouteDelete={removeModulationRoute}
                  assets={activeComposition.assets}
                  onInstrumentType={(type) => updateActive((composition) => {
                    getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id).instrument.type = type;
                  })}
                  onSamplerZones={(zones) => updateActive((composition) => {
                    getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id).instrument.defaults.zones = zones as unknown as ParameterValue;
                  })}
                />
                <VisualizerEditor
                  voice={selectedVoice}
                  selectedEvent={selectedEvent}
                  lockCapture={lockCapture}
                  modulationCapture={modulationCapture}
                  modulators={modulators.visualizer}
                  onModulators={(drafts) => setModulators((current) => ({ ...current, visualizer: drafts }))}
                  onArmModulation={(modulator) => toggleModulationCapture("visualizer", modulator)}
                  onModulationTarget={(path, amount, range) => captureModulationTarget("visualizer", path, amount, range)}
                  onParameter={(path, value) => updateDeviceParameter("visualizer", path, value)}
                  onRoutePatch={patchModulationRoute}
                  onRouteDelete={removeModulationRoute}
                />
                <UIDeviceEditor
                  voice={selectedVoice}
                  programs={activeComposition.programs}
                  onChange={(mutator) => updateActive((composition) => {
                    mutator(getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id));
                  })}
                />
              </>
            )}
          </div>

          <aside className="preview-panel">
            <h2>Performance Preview</h2>
            <p>{timeline?.events.length ?? 0} scheduled runtime events</p>
            <div className="timeline-list">
              {timeline?.segments.map((segment) => (
                <div key={`${segment.programId}:${segment.startTimeMs}`} className="timeline-row">
                  <strong>{getProgram(activeComposition, segment.programId).name}</strong>
                  <span>{Math.round(segment.startTimeMs)}ms · {Math.round(segment.durationMs)}ms</span>
                </div>
              ))}
            </div>
            <h3>Modulation Routes</h3>
            <div className="timeline-list">
              {selectedVoice === undefined || getModulationRoutes(selectedVoice).length === 0 ? (
                <p className="muted">No modulation routes captured.</p>
              ) : (
                getModulationRoutes(selectedVoice).map((route) => (
                  <div key={`${route.device}:${route.modulator}:${route.target}`} className="timeline-row">
                    <strong>M{route.modulator} {route.source}</strong>
                    <span>{route.device}.{route.target} · {route.amount}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

function ProgramSequencer({
  composition,
  selectedProgramId,
  previewing,
  canPreview,
  onPlayPreview,
  onStopPreview,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onSetInitial,
}: {
  composition: Composition;
  selectedProgramId: string;
  previewing: boolean;
  canPreview: boolean;
  onPlayPreview: () => void;
  onStopPreview: () => void;
  onSelect: (programId: string) => void;
  onAdd: () => void;
  onDuplicate: (programId: string) => void;
  onDelete: (programId: string) => void;
  onMove: (programId: string, direction: -1 | 1) => void;
  onSetInitial: (programId: string) => void;
}) {
  return (
    <section className="sequencer-bar" aria-label="Program Sequencer">
      <div className="section-title">
        <div className="section-title-copy">
          <Layers aria-hidden="true" />
          <h2>Program Sequencer</h2>
        </div>
        <button
          className={previewing ? "armed-button" : "primary-button"}
          disabled={!canPreview}
          onClick={previewing ? onStopPreview : onPlayPreview}
        >
          {previewing ? <Pause size={14} /> : <Play size={14} />}
          {previewing ? "Stop" : "Play"}
        </button>
      </div>
      <div className="program-steps">
        {composition.programSequencer.steps.length === 0 && (
          <div className="program-empty-card">
            <strong>No Programs yet</strong>
            <span>New Compositions start empty.</span>
          </div>
        )}
        {composition.programSequencer.steps.map((step, index) => {
          const program = getProgram(composition, step.programId);
          const selected = program.id === selectedProgramId;
          const initial = program.id === composition.programSequencer.initialProgramId;
          return (
            <div key={program.id} className={selected ? "program-step selected" : "program-step"}>
              <button className="program-main" onClick={() => onSelect(program.id)}>
                <span>{index + 1}</span>
                <strong>{program.name}</strong>
                <small>{initial ? "initial" : completionLabel(program.completion)}</small>
              </button>
              <div className="mini-actions">
                <button onClick={() => onMove(program.id, -1)} aria-label="Move Program earlier">↑</button>
                <button onClick={() => onMove(program.id, 1)} aria-label="Move Program later">↓</button>
                <button onClick={() => onSetInitial(program.id)}>Initial</button>
                <button onClick={() => onDuplicate(program.id)} aria-label={`Duplicate ${program.name}`}><Copy size={13} /></button>
                <button onClick={() => onDelete(program.id)} aria-label={`Delete ${program.name}`}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
        <button className="add-program" onClick={onAdd}><Plus size={16} />Add Program</button>
      </div>
    </section>
  );
}

function ProgramEditor({
  program,
  boundary,
  onRename,
  onBoundary,
  onCompletion,
}: {
  program: Program;
  boundary: Boundary;
  onRename: (name: string) => void;
  onBoundary: (boundary: Boundary) => void;
  onCompletion: (completion: ProgramCompletion) => void;
}) {
  const sourceVoiceId = program.voices[0]?.id ?? "";
  const patternCompletion =
    program.completion.type === "patternRepetitions" ? program.completion : null;
  return (
    <section className="panel">
      <h2>Program</h2>
      <label>
        Name
        <input value={program.name} onChange={(event) => onRename(event.target.value)} />
      </label>
      <label>
        Default boundary
        <select value={boundary} onChange={(event) => onBoundary(event.target.value as Boundary)}>
          {boundaries.map((candidate) => <option key={candidate}>{candidate}</option>)}
        </select>
      </label>
      <label>
        Completion
        <select
          value={program.completion.type}
          onChange={(event) => {
            const type = event.target.value as ProgramCompletion["type"];
            if (type === "patternRepetitions") {
              onCompletion({
                type,
                sourceVoiceId,
                repetitions: 4,
                onComplete: { type: "advance" },
              });
            } else if (type === "uiChoice") {
              onCompletion({ type, sourceVoiceId });
            } else {
              onCompletion({ type });
            }
          }}
        >
          <option value="patternRepetitions">Pattern repetitions</option>
          <option value="uiChoice">UI choice</option>
          <option value="hostAction">Host action</option>
          <option value="forever">Forever</option>
        </select>
      </label>
      {patternCompletion !== null && (
        <label>
          Repetitions
          <input
            type="number"
            min={1}
            max={64}
            value={patternCompletion.repetitions}
            onChange={(event) => onCompletion({
              type: "patternRepetitions",
              sourceVoiceId: patternCompletion.sourceVoiceId,
              repetitions: Math.max(1, Number(event.target.value)),
              onComplete: patternCompletion.onComplete,
            })}
          />
        </label>
      )}
    </section>
  );
}

function VoiceSelector({
  program,
  selectedVoiceId,
  onSelect,
  onAdd,
  onDelete,
  onRename,
}: {
  program: Program;
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  onAdd: () => void;
  onDelete: (voiceId: string) => void;
  onRename: (voiceId: string, name: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Voices</h2>
        <button onClick={onAdd}><Plus size={14} />Add</button>
      </div>
      <div className="voice-list">
        {program.voices.map((voice) => (
          <div key={voice.id} className={voice.id === selectedVoiceId ? "voice-row active" : "voice-row"}>
            <button onClick={() => onSelect(voice.id)}>{voice.name}</button>
            <input value={voice.name} onChange={(event) => onRename(voice.id, event.target.value)} aria-label="Voice name" />
            <button onClick={() => onDelete(voice.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PatternEditor({
  voice,
  selectedStep,
  layers,
  selectedEvent,
  onLayers,
  onStepHover,
  onStepToggle,
  onPatternChange,
  onEventChange,
  lockCapture,
  previewPlaying,
  onPlayPreview,
  onStopPreview,
}: {
  voice: ProgramVoice;
  selectedStep: number;
  layers: LayersState;
  selectedEvent: StepEvent | undefined;
  onLayers: (layers: LayersState) => void;
  onStepHover: (step: number) => void;
  onStepToggle: (step: number, mode: StepToggleMode) => void;
  onPatternChange: (mutator: (voice: ProgramVoice) => void) => void;
  onEventChange: (mutator: (event: StepEvent, voice: ProgramVoice) => void) => void;
  lockCapture: boolean;
  previewPlaying: boolean;
  onPlayPreview: () => void;
  onStopPreview: () => void;
}) {
  const steps = Array.from({ length: voice.pattern.stepCount }, (_, index) => index);
  const selectedLocks = getStepLocks(selectedEvent);
  return (
    <section className="device-panel pattern-device">
      <div className="device-header">
        <div>
          <h2>Pattern</h2>
          <p>Step Sequencer</p>
        </div>
        <button className={previewPlaying ? "armed-button" : "primary-button"} onClick={previewPlaying ? onStopPreview : onPlayPreview}>
          {previewPlaying ? <Pause size={14} /> : <Play size={14} />}
          {previewPlaying ? "Stop" : "Play"}
        </button>
      </div>
      <div className="pattern-controls">
        <NumberField label="Steps" min={1} max={64} value={voice.pattern.stepCount} onChange={(value) => onPatternChange((draft) => {
          draft.pattern.stepCount = clampStepCount(value);
          draft.pattern.stepEvents = draft.pattern.stepEvents.filter((event) => event.step < draft.pattern.stepCount);
        })} />
        <RangeField label="Tempo" min={20} max={240} step={1} value={voice.pattern.tempoBpm} suffix=" BPM" onChange={(value) => onPatternChange((draft) => {
          draft.pattern.tempoBpm = Math.round(value);
        })} />
      </div>
      <div className="layer-toggles">
        <Toggle label="Instrument Trigs" checked={layers.instrument} onChange={(checked) => onLayers({ ...layers, instrument: checked })} />
        <Toggle label="Visualizer Trigs" checked={layers.visualizer} onChange={(checked) => onLayers({ ...layers, visualizer: checked })} />
        <Toggle label="Parameter Locks" checked={layers.locks} onChange={(checked) => onLayers({ ...layers, locks: checked })} />
      </div>
      <div className="step-grid" style={{ "--step-count": Math.min(16, voice.pattern.stepCount) } as CSSProperties}>
        {steps.map((step) => {
          const event = findStepEvent(voice, step);
          const hasInstrument = event?.instrumentTrigger?.enabled === true;
          const hasVisualizer = event?.visualizerTrigger?.enabled === true;
          const hasLocks = getStepLocks(event).length > 0;
          return (
            <button
              key={step}
              className={[
                "step-cell",
                step === selectedStep ? "selected" : "",
                hasInstrument ? "has-instrument" : "",
                hasVisualizer ? "has-visualizer" : "",
                hasLocks ? "has-locks" : "",
              ].join(" ")}
              onMouseEnter={() => onStepHover(step)}
              onFocus={() => onStepHover(step)}
              onClick={(event) => {
                const mode: StepToggleMode = event.metaKey
                  ? "instrument"
                  : event.altKey
                    ? "visualizer"
                    : "both";
                onStepToggle(step, mode);
              }}
              aria-label={`Step ${step + 1}: click toggles both triggers, Command-click toggles instrument, Option-click toggles visualizer`}
            >
              <span>{step + 1}</span>
              <small aria-hidden="true">
                <i className={hasInstrument ? "active" : ""} />
                <i className={hasVisualizer ? "active" : ""} />
                <i className={hasLocks ? "active" : ""} />
              </small>
            </button>
          );
        })}
      </div>
      <div className="step-editor">
        <div>
          <h3>Selected Step {selectedStep + 1}</h3>
          <p>{selectedEvent === undefined ? "No Step Event yet." : "Edit triggers and locks for this Step Event."}</p>
        </div>
      </div>
      <StepNoteEditor
        selectedEvent={selectedEvent}
        onEventChange={onEventChange}
      />
      <div className="trigger-grid">
        <Toggle
          label="Instrument Trigger"
          checked={selectedEvent?.instrumentTrigger?.enabled === true}
          onChange={(checked) => onEventChange((event) => {
            event.instrumentTrigger = { enabled: checked, durationMs: event.instrumentTrigger?.durationMs ?? 180 };
          })}
        />
        <Toggle
          label="Visualizer Trigger"
          checked={selectedEvent?.visualizerTrigger?.enabled === true}
          onChange={(checked) => onEventChange((event) => {
            event.visualizerTrigger = { enabled: checked, durationMs: event.visualizerTrigger?.durationMs ?? 240 };
          })}
        />
      </div>
      <div className="lock-list">
        {selectedLocks.length === 0 ? <p className="muted">No locks on this step.</p> : selectedLocks.map((lock) => (
          <div key={`${lock.scope}:${lock.path}`} className="lock-row">
            <span>{lock.scope}.{lock.path}</span>
            <strong>{String(lock.value)}</strong>
            <button onClick={() => onEventChange((event) => clearStepEventLock(event, lock.scope, lock.path))}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function StepNoteEditor({
  selectedEvent,
  onEventChange,
}: {
  selectedEvent: StepEvent | undefined;
  onEventChange: (mutator: (event: StepEvent, voice: ProgramVoice) => void) => void;
}) {
  const activePitches = getLockedPitchSet(selectedEvent);
  const velocity = Number(getNestedParameter(selectedEvent?.parameterLocks?.instrument ?? {}, "velocity") ?? 84);
  const durationMs = selectedEvent?.instrumentTrigger?.durationMs ?? 180;

  function togglePitch(pitch: string) {
    onEventChange((event) => {
      const next = new Set(getLockedPitchSet(event));
      if (next.has(pitch)) {
        next.delete(pitch);
      } else {
        next.add(pitch);
      }
      const pitches = [...next].sort((a, b) => pitchToMidiNumber(a) - pitchToMidiNumber(b));
      if (pitches.length === 0) {
        clearStepEventLock(event, "instrument", "pitches");
      } else {
        setStepEventLock(event, "instrument", "pitches", pitches);
      }
    });
  }

  return (
    <div className="step-note-editor">
      <div className="pitch-grid" aria-label="Selected step pitch locks">
        {pitchGridNotes.map((pitch) => {
          const active = activePitches.has(pitch);
          const noteName = pitch.replace(/-?\d+$/, "");
          return (
            <button
              key={pitch}
              className={[
                "pitch-cell",
                blackNoteNames.has(noteName) ? "black-key" : "white-key",
                active ? "active" : "",
              ].join(" ")}
              onClick={() => togglePitch(pitch)}
              aria-pressed={active}
              aria-label={`${pitch} ${active ? "active" : "inactive"}`}
            >
              <span aria-hidden="true" />
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="step-note-sliders">
        <RangeField label="Velocity" min={1} max={127} step={1} value={velocity} onChange={(value) => onEventChange((event) => {
          setStepEventLock(event, "instrument", "velocity", Math.round(value));
        })} />
        <RangeField label="Duration" min={20} max={2000} step={10} value={durationMs} suffix=" ms" onChange={(value) => onEventChange((event) => {
          event.instrumentTrigger = {
            enabled: event.instrumentTrigger?.enabled ?? true,
            durationMs: Math.round(value),
          };
        })} />
      </div>
    </div>
  );
}

interface SamplerZone {
  id: string;
  assetId: string;
  pitchLow: string;
  pitchHigh: string;
  velocityLow: number;
  velocityHigh: number;
  rootKey: string;
  gainDb: number;
  startMs: number;
  endMs: number;
  loop: boolean;
}

const sh101Waveforms = [
  { value: "triangle", label: "Triangle" },
  { value: "square", label: "Square" },
  { value: "random", label: "Random" },
  { value: "noise", label: "Noise" },
];

const sh101Ranges = [
  { value: "16", label: "16'" },
  { value: "8", label: "8'" },
  { value: "4", label: "4'" },
  { value: "2", label: "2'" },
];

const pulseWidthSources = [
  { value: "lfo", label: "LFO" },
  { value: "manual", label: "Manual" },
  { value: "envelope", label: "ENV" },
];

const subOscModes = [
  { value: "oneOctSquare", label: "1 Oct Square" },
  { value: "twoOctSquare", label: "2 Oct Square" },
  { value: "twoOctPulse", label: "2 Oct Pulse" },
];

const vcaModes = [
  { value: "envelope", label: "ENV" },
  { value: "gate", label: "Gate" },
];

const envelopeGateModes = [
  { value: "gateTrigger", label: "Gate + Trig" },
  { value: "gate", label: "Gate" },
  { value: "lfo", label: "LFO" },
];

const portamentoModes = [
  { value: "auto", label: "Auto" },
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

const transposeModes = [
  { value: "low", label: "L" },
  { value: "middle", label: "M" },
  { value: "high", label: "H" },
];

const pitchGridNotes = Array.from({ length: 72 }, (_, index) => midiToPitch(24 + index));
const blackNoteNames = new Set(["C#", "D#", "F#", "G#", "A#"]);

const visualizerShapes = [
  { value: "wash", label: "Wash" },
  { value: "ring", label: "Ring" },
  { value: "bar", label: "Bar" },
  { value: "pulse", label: "Pulse" },
  { value: "spark", label: "Spark" },
];

const visualizerPlacements = [
  { value: "center", label: "Center" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "full", label: "Full" },
];

const visualizerMotions = [
  { value: "pulse", label: "Pulse" },
  { value: "drift", label: "Drift" },
  { value: "strobe", label: "Strobe" },
  { value: "bloom", label: "Bloom" },
  { value: "still", label: "Still" },
];

function InstrumentEditor(props: DeviceEditorProps & {
  assets: AssetReference[];
  onInstrumentType: (type: "sampler" | "polySh101") => void;
  onSamplerZones: (zones: SamplerZone[]) => void;
}) {
  const { voice, assets, onInstrumentType, onSamplerZones } = props;
  const samplerZones = getSamplerZones(voice.instrument.defaults);
  return (
    <DevicePanel
      title="Instrument"
      subtitle={voice.instrument.type === "sampler" ? "Sampler Zones" : "Polyphonic SH-101-style Synth"}
      scope="instrument"
      {...props}
    >
      <label className="control">
        <span>Instrument Type</span>
        <select value={voice.instrument.type} onChange={(event) => onInstrumentType(event.target.value as "sampler" | "polySh101")}>
          <option value="polySh101">Poly SH-101</option>
          <option value="sampler">Sampler</option>
        </select>
      </label>
      {voice.instrument.type === "sampler" ? (
        <SamplerZoneEditor
          zones={samplerZones}
          assets={assets}
          onChange={onSamplerZones}
        />
      ) : (
        <div className="sh101-panel">
          <SynthBlock title="Tune">
            <VerticalSliderControl label="Tune" path="tune" min={-12} max={12} step={1} target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="Modulator">
            <VerticalSliderControl label="LFO/CLK Rate" path="lfo.rate" target={voice.instrument.defaults} scope="instrument" {...props} />
            <SelectControl label="Wave Form" path="lfo.waveform" options={sh101Waveforms} target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="VCO">
            <VerticalSliderControl label="MOD" path="oscillator.modulationAmount" target={voice.instrument.defaults} scope="instrument" {...props} />
            <SelectControl label="Range" path="oscillator.range" options={sh101Ranges} target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Pulse Width" path="oscillator.pulseWidth" target={voice.instrument.defaults} scope="instrument" {...props} />
            <SelectControl label="PW Source" path="oscillator.pulseWidthSource" options={pulseWidthSources} target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="Source Mixer">
            <VerticalSliderControl label="Pulse" path="oscillator.pulseLevel" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Saw" path="oscillator.sawLevel" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Sub Osc" path="oscillator.subLevel" target={voice.instrument.defaults} scope="instrument" {...props} />
            <SelectControl label="Sub Mode" path="oscillator.subMode" options={subOscModes} target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Noise" path="oscillator.noise" target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="VCF">
            <VerticalSliderControl label="Freq" path="filter.cutoff" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Res" path="filter.resonance" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Env" path="filter.envelopeAmount" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Mod" path="filter.modulationAmount" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Kybd" path="filter.keyboardTracking" target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="VCA">
            <SelectControl label="Mode" path="vca.mode" options={vcaModes} target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="ENV">
            <SelectControl label="Trig" path="envelope.gateMode" options={envelopeGateModes} target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="A" path="envelope.attackMs" min={0} max={2000} step={5} suffix="ms" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="D" path="envelope.decayMs" min={1} max={5000} step={5} suffix="ms" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="S" path="envelope.sustain" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="R" path="envelope.releaseMs" min={1} max={5000} step={5} suffix="ms" target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
          <SynthBlock title="Performance">
            <TextControl label="Root" path="pitch" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Volume" path="gain" target={voice.instrument.defaults} scope="instrument" {...props} />
            <VerticalSliderControl label="Portamento" path="glide" target={voice.instrument.defaults} scope="instrument" {...props} />
            <SelectControl label="Portamento" path="portamentoMode" options={portamentoModes} target={voice.instrument.defaults} scope="instrument" {...props} />
            <SelectControl label="Transpose" path="transpose" options={transposeModes} target={voice.instrument.defaults} scope="instrument" {...props} />
          </SynthBlock>
        </div>
      )}
    </DevicePanel>
  );
}

function SynthBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="synth-block">
      <h3>{title}</h3>
      <div className="synth-controls">{children}</div>
    </section>
  );
}

function SamplerZoneEditor({
  zones,
  assets,
  onChange,
}: {
  zones: SamplerZone[];
  assets: AssetReference[];
  onChange: (zones: SamplerZone[]) => void;
}) {
  function updateZone(index: number, patch: Partial<SamplerZone>) {
    const next = [...zones];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="sampler-zone-editor">
      <div className="zone-header">
        <h3>Sample Zones</h3>
        <button onClick={() => onChange([...zones, createSamplerZone(assets[0]?.id ?? "")])}><Plus size={14} />Add zone</button>
      </div>
      {assets.length === 0 && <p className="warning-text"><AlertTriangle size={14} />Import audio assets before assigning sampler zones.</p>}
      {zones.length === 0 ? (
        <p className="muted">No zones yet.</p>
      ) : zones.map((zone, index) => (
        <div key={zone.id} className="zone-card">
          <label>
            Asset
            <select value={zone.assetId} onChange={(event) => updateZone(index, { assetId: event.target.value })}>
              <option value="">No asset</option>
              {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.path}</option>)}
            </select>
          </label>
          <label>
            Pitch low
            <input value={zone.pitchLow} onChange={(event) => updateZone(index, { pitchLow: event.target.value })} />
          </label>
          <label>
            Pitch high
            <input value={zone.pitchHigh} onChange={(event) => updateZone(index, { pitchHigh: event.target.value })} />
          </label>
          <label>
            Velocity low
            <input type="number" min={1} max={127} value={zone.velocityLow} onChange={(event) => updateZone(index, { velocityLow: Number(event.target.value) })} />
          </label>
          <label>
            Velocity high
            <input type="number" min={1} max={127} value={zone.velocityHigh} onChange={(event) => updateZone(index, { velocityHigh: Number(event.target.value) })} />
          </label>
          <label>
            Root key
            <input value={zone.rootKey} onChange={(event) => updateZone(index, { rootKey: event.target.value })} />
          </label>
          <label>
            Gain dB
            <input type="number" value={zone.gainDb} onChange={(event) => updateZone(index, { gainDb: Number(event.target.value) })} />
          </label>
          <label>
            Start ms
            <input type="number" min={0} value={zone.startMs} onChange={(event) => updateZone(index, { startMs: Number(event.target.value) })} />
          </label>
          <label>
            End ms
            <input type="number" min={0} value={zone.endMs} onChange={(event) => updateZone(index, { endMs: Number(event.target.value) })} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={zone.loop} onChange={(event) => updateZone(index, { loop: event.target.checked })} />
            <span>Loop</span>
          </label>
          <button onClick={() => onChange(zones.filter((_, candidateIndex) => candidateIndex !== index))}><Trash2 size={14} />Remove</button>
        </div>
      ))}
    </div>
  );
}

function VisualizerEditor(props: DeviceEditorProps) {
  const { voice } = props;
  const hue = Number(getNestedParameter(voice.visualizer.defaults, "hue") ?? 0);
  const saturation = Number(getNestedParameter(voice.visualizer.defaults, "saturation") ?? 0);
  const brightness = Number(getNestedParameter(voice.visualizer.defaults, "brightness") ?? 0);
  const shape = String(getNestedParameter(voice.visualizer.defaults, "shape") ?? "wash");
  const previewStyle = {
    "--preview-hue": `${hue}`,
    "--preview-saturation": `${Math.round(saturation * 100)}%`,
    "--preview-brightness": `${Math.round(brightness * 100)}%`,
  } as CSSProperties;
  return (
    <DevicePanel title="Visualizer" subtitle="Color Wash and Cel Defaults" scope="visualizer" {...props}>
      <div className="visual-preview-card" style={previewStyle}>
        <div className={`visual-shape-preview ${shape}`} aria-hidden="true" />
        <span>{visualizerShapes.find((option) => option.value === shape)?.label ?? shape}</span>
      </div>
      <SliderControl label="Hue" path="hue" min={0} max={360} step={1} target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Saturation" path="saturation" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Brightness" path="brightness" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SelectControl label="Shape" path="shape" options={visualizerShapes} target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Intensity" path="intensity" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Decay" path="decayMs" min={1} max={5000} step={5} suffix="ms" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SelectControl label="Placement" path="placement" options={visualizerPlacements} target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SelectControl label="Motion" path="motion" options={visualizerMotions} target={voice.visualizer.defaults} scope="visualizer" {...props} />
    </DevicePanel>
  );
}

function AssetManager({
  assets,
  inputRef,
  onImport,
  onRemove,
}: {
  assets: AssetReference[];
  inputRef: RefObject<HTMLInputElement | null>;
  onImport: (files: FileList) => void;
  onRemove: (assetId: string) => void;
}) {
  return (
    <section className="panel asset-manager">
      <div className="panel-heading">
        <h2>Assets</h2>
        <button onClick={() => inputRef.current?.click()}><Plus size={14} />Import</button>
      </div>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        multiple
        accept="audio/*,image/*"
        onChange={(event) => {
          if (event.currentTarget.files !== null) onImport(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {assets.length === 0 ? (
        <p className="muted">No media assets referenced.</p>
      ) : (
        <div className="asset-list">
          {assets.map((asset) => (
            <div key={asset.id} className="asset-row">
              <div>
                <strong>{asset.path}</strong>
                <span>{asset.type} · {asset.durationMs === undefined ? "duration unknown" : `${Math.round(asset.durationMs)}ms`}</span>
              </div>
              <button onClick={() => onRemove(asset.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CreatorPersistencePanel({
  creatorEmail,
  authUser,
  authStatus,
  status,
  onCreatorEmail,
  onMagicLink,
  onRefreshSession,
  onLogout,
  onSave,
  onPackage,
}: {
  creatorEmail: string;
  authUser: AuthUser | null;
  authStatus: string | null;
  status: string | null;
  onCreatorEmail: (email: string) => void;
  onMagicLink: () => void;
  onRefreshSession: () => void;
  onLogout: () => void;
  onSave: () => void;
  onPackage: () => void;
}) {
  return (
    <section className="panel creator-panel">
      <div className="panel-heading">
        <h2>Account</h2>
      </div>
      {authUser === null ? (
        <>
          <label>
            Email
            <input value={creatorEmail} onChange={(event) => onCreatorEmail(event.target.value)} />
          </label>
          <div className="creator-actions">
            <button onClick={onMagicLink}><Radio size={14} />Send magic link</button>
            <button onClick={onRefreshSession}>Refresh session</button>
          </div>
        </>
      ) : (
        <>
          <p className="server-status">Signed in as {authUser.email}</p>
          <button onClick={onLogout}>Sign out</button>
        </>
      )}
      {authStatus !== null && <p className="server-status">{authStatus}</p>}
      <div className="creator-actions">
        <button onClick={onSave} disabled={authUser === null}><Save size={14} />Save</button>
        <button onClick={onPackage} disabled={authUser === null}><Upload size={14} />Package</button>
      </div>
      {status !== null && <p className="server-status">{status}</p>}
    </section>
  );
}

interface DeviceEditorProps {
  voice: ProgramVoice;
  selectedEvent: StepEvent | undefined;
  lockCapture: boolean;
  modulationCapture: ModulationCapture | null;
  modulators: ModulatorDraft[];
  onModulators: (drafts: ModulatorDraft[]) => void;
  onArmModulation: (modulator: number) => void;
  onModulationTarget: (path: string, amount: number, range?: { min: number; max: number }) => void;
  onParameter: (path: string, value: ParameterValue) => void;
  onRoutePatch: (route: ModulationRoute, patch: Partial<ModulationRoute>) => void;
  onRouteDelete: (route: ModulationRoute) => void;
}

function DevicePanel({
  title,
  subtitle,
  scope,
  voice,
  children,
  modulators,
  onModulators,
  onArmModulation,
  modulationCapture,
  onRoutePatch,
  onRouteDelete,
}: DeviceEditorProps & {
  title: string;
  subtitle: string;
  scope: DeviceScope;
  children: ReactNode;
}) {
  const routes = getModulationRoutes(voice).filter((route) => route.device === scope);
  const targetDefaults = scope === "instrument" ? voice.instrument.defaults : voice.visualizer.defaults;

  return (
    <section className="device-panel">
      <DeviceHeader title={title} subtitle={subtitle} />
      <div className="control-grid">{children}</div>
      <div className="modulator-section">
        <h3>Modulators</h3>
        {modulators.map((modulator, index) => (
          <div key={index} className="modulator-row">
            <strong>M{index + 1}</strong>
            <select
              value={modulator.source}
              onChange={(event) => {
                const drafts = [...modulators];
                drafts[index] = { ...modulator, source: event.target.value };
                onModulators(drafts);
              }}
            >
              <option value="lfo">LFO</option>
              <option value="velocity">Velocity</option>
              <option value="step">Step</option>
              <option value="choice">Choice</option>
              <option value="random">Random</option>
            </select>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={modulator.amount}
              onChange={(event) => {
                const drafts = [...modulators];
                drafts[index] = { ...modulator, amount: Number(event.target.value) };
                onModulators(drafts);
              }}
            />
            <button
              className={modulationCapture?.device === scope && modulationCapture.modulator === index ? "armed-button" : ""}
              onClick={() => onArmModulation(index)}
            >
              {modulationCapture?.device === scope && modulationCapture.modulator === index ? "Cancel" : "Target"}
            </button>
          </div>
        ))}
        <ModulationRouteList
          routes={routes}
          defaults={targetDefaults}
          onPatch={onRoutePatch}
          onDelete={onRouteDelete}
        />
      </div>
    </section>
  );
}

function ModulationRouteList({
  routes,
  defaults,
  onPatch,
  onDelete,
}: {
  routes: ModulationRoute[];
  defaults: ParameterBag;
  onPatch: (route: ModulationRoute, patch: Partial<ModulationRoute>) => void;
  onDelete: (route: ModulationRoute) => void;
}) {
  if (routes.length === 0) {
    return <p className="muted route-empty">No modulation targets captured.</p>;
  }

  return (
    <div className="route-list">
      {routes.map((route) => {
        const invalid = getNestedParameter(defaults, route.target) === undefined;
        const range = route.range ?? { min: 0, max: 1 };
        return (
          <div
            key={`${route.device}:${route.modulator}:${route.target}`}
            className={invalid ? "route-row invalid" : "route-row"}
          >
            <label className="toggle">
              <input
                type="checkbox"
                checked={route.enabled !== false}
                onChange={(event) => onPatch(route, { enabled: event.target.checked })}
              />
              <span>M{route.modulator}</span>
            </label>
            <label>
              Source
              <select value={route.source} onChange={(event) => onPatch(route, { source: event.target.value })}>
                <option value="lfo">LFO</option>
                <option value="velocity">Velocity</option>
                <option value="step">Step</option>
                <option value="choice">Choice</option>
                <option value="random">Random</option>
              </select>
            </label>
            <div className="route-target">
              <strong>{route.target}</strong>
              {invalid && <span>Invalid target</span>}
            </div>
            <label>
              Amount
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={route.amount}
                onChange={(event) => onPatch(route, { amount: Number(event.target.value) })}
              />
            </label>
            <label>
              Min
              <input
                type="number"
                value={range.min}
                onChange={(event) => onPatch(route, { range: { ...range, min: Number(event.target.value) } })}
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={range.max}
                onChange={(event) => onPatch(route, { range: { ...range, max: Number(event.target.value) } })}
              />
            </label>
            <button onClick={() => onDelete(route)}><Trash2 size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

function UIDeviceEditor({
  voice,
  programs,
  onChange,
}: {
  voice: ProgramVoice;
  programs: Program[];
  onChange: (mutator: (voice: ProgramVoice) => void) => void;
}) {
  const ui = voice.ui;
  return (
    <section className="device-panel">
      <DeviceHeader title="Audience Prompt" subtitle="Optional choice prompt shown during this Voice" />
      {ui === undefined ? (
        <button onClick={() => onChange((draft) => {
          const createdUi = createVoice().ui;
          draft.ui = createdUi ?? createChoicePromptDevice();
        })}>Add Choice Prompt</button>
      ) : (
        <div className="ui-editor">
          <label>
            Display text
            <input value={ui.prompt.text} onChange={(event) => onChange((draft) => {
              if (draft.ui !== undefined) draft.ui.prompt.text = event.target.value;
            })} />
          </label>
          <label>
            Apply boundary
            <select value={ui.prompt.applyBoundary} onChange={(event) => onChange((draft) => {
              if (draft.ui !== undefined) draft.ui.prompt.applyBoundary = event.target.value as Boundary;
            })}>
              {boundaries.map((boundary) => <option key={boundary}>{boundary}</option>)}
            </select>
          </label>
          <div className="choice-editor">
            {ui.prompt.choices.map((choice, index) => (
              <div key={choice.id} className="choice-edit-row">
                <input value={choice.label} onChange={(event) => onChange((draft) => {
                  if (draft.ui !== undefined) draft.ui.prompt.choices[index]!.label = event.target.value;
                })} />
                <select value={choice.targetProgramId ?? ""} onChange={(event) => onChange((draft) => {
                  if (draft.ui === undefined) return;
                  const target = event.target.value;
                  const nextChoice: ChoiceOption = {
                    ...draft.ui.prompt.choices[index]!,
                    ...(target.length === 0 ? {} : { targetProgramId: target }),
                  };
                  if (target.length === 0) {
                    delete nextChoice.targetProgramId;
                  }
                  draft.ui.prompt.choices[index] = nextChoice;
                })}>
                  <option value="">Stay in flow</option>
                  {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
                </select>
                <button onClick={() => onChange((draft) => {
                  if (draft.ui !== undefined) draft.ui.prompt.choices.splice(index, 1);
                })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => onChange((draft) => {
            draft.ui?.prompt.choices.push({
              id: `choice-${Math.random().toString(36).slice(2, 8)}`,
              label: "New choice",
            });
          })}><Plus size={14} />Add choice</button>
        </div>
      )}
    </section>
  );
}

function createChoicePromptDevice() {
  return {
    id: `ui-${Math.random().toString(36).slice(2, 8)}`,
    type: "choicePrompt" as const,
    prompt: {
      id: `prompt-${Math.random().toString(36).slice(2, 8)}`,
      text: "Choose",
      applyBoundary: "patternLoopEnd" as Boundary,
      choices: [
        { id: `choice-${Math.random().toString(36).slice(2, 8)}`, label: "A" },
        { id: `choice-${Math.random().toString(36).slice(2, 8)}`, label: "B" },
      ],
    },
  };
}

function DeviceHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="device-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function SliderControl({
  label,
  path,
  target,
  scope,
  selectedEvent,
  lockCapture,
  modulationCapture,
  modulators,
  voice,
  onParameter,
  onModulationTarget,
  min = 0,
  max = 1,
  step = 0.01,
  suffix = "",
}: ControlProps & { min?: number; max?: number; step?: number; suffix?: string }) {
  const value = Number(getNestedParameter(target, path) ?? 0);
  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture, voice)}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onParameter(path, Number(event.target.value))} />
      <strong>{formatControlValue(value, suffix)}</strong>
      <ModTargetOverlay
        scope={scope}
        path={path}
        range={{ min, max }}
        modulationCapture={modulationCapture}
        modulators={modulators}
        onModulationTarget={onModulationTarget}
      />
    </label>
  );
}

function VerticalSliderControl({
  label,
  path,
  target,
  scope,
  selectedEvent,
  lockCapture,
  modulationCapture,
  modulators,
  voice,
  onParameter,
  onModulationTarget,
  min = 0,
  max = 1,
  step = 0.01,
  suffix = "",
}: ControlProps & { min?: number; max?: number; step?: number; suffix?: string }) {
  const value = Number(getNestedParameter(target, path) ?? 0);
  return (
    <label className={`${controlClass(scope, path, selectedEvent, lockCapture, modulationCapture, voice)} vertical-control`}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onParameter(path, Number(event.target.value))} />
      <strong>{formatControlValue(value, suffix)}</strong>
      <ModTargetOverlay
        scope={scope}
        path={path}
        range={{ min, max }}
        modulationCapture={modulationCapture}
        modulators={modulators}
        onModulationTarget={onModulationTarget}
      />
    </label>
  );
}

function NumberControl({
  label,
  path,
  target,
  scope,
  selectedEvent,
  lockCapture,
  modulationCapture,
  modulators,
  voice,
  onParameter,
  onModulationTarget,
  min = 0,
  max = 1,
  boolean,
}: ControlProps & { min?: number; max?: number; boolean?: boolean }) {
  const rawValue = getNestedParameter(target, path);
  if (boolean) {
    return (
      <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture, voice)}>
        <span>{label}</span>
        <input type="checkbox" checked={rawValue === true} onChange={(event) => onParameter(path, event.target.checked)} />
        <ModTargetOverlay
          scope={scope}
          path={path}
          modulationCapture={modulationCapture}
          modulators={modulators}
          onModulationTarget={onModulationTarget}
        />
      </label>
    );
  }

  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture, voice)}>
      <span>{label}</span>
      <input type="number" min={min} max={max} value={Number(rawValue ?? 0)} onChange={(event) => onParameter(path, Number(event.target.value))} />
      <ModTargetOverlay
        scope={scope}
        path={path}
        range={{ min, max }}
        modulationCapture={modulationCapture}
        modulators={modulators}
        onModulationTarget={onModulationTarget}
      />
    </label>
  );
}

function TextControl({
  label,
  path,
  target,
  scope,
  selectedEvent,
  lockCapture,
  modulationCapture,
  modulators,
  voice,
  onParameter,
  onModulationTarget,
}: ControlProps) {
  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture, voice)}>
      <span>{label}</span>
      <input value={String(getNestedParameter(target, path) ?? "")} onChange={(event) => onParameter(path, event.target.value)} />
      <ModTargetOverlay
        scope={scope}
        path={path}
        modulationCapture={modulationCapture}
        modulators={modulators}
        onModulationTarget={onModulationTarget}
      />
    </label>
  );
}

function SelectControl({
  label,
  path,
  target,
  scope,
  selectedEvent,
  lockCapture,
  modulationCapture,
  modulators,
  voice,
  onParameter,
  onModulationTarget,
  options,
}: ControlProps & { options: Array<{ value: string; label: string }> }) {
  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture, voice)}>
      <span>{label}</span>
      <select value={String(getNestedParameter(target, path) ?? options[0]?.value ?? "")} onChange={(event) => onParameter(path, event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ModTargetOverlay
        scope={scope}
        path={path}
        modulationCapture={modulationCapture}
        modulators={modulators}
        onModulationTarget={onModulationTarget}
      />
    </label>
  );
}

interface ControlProps extends Pick<DeviceEditorProps, "voice" | "selectedEvent" | "lockCapture" | "modulationCapture" | "modulators" | "onParameter" | "onModulationTarget"> {
  label: string;
  path: string;
  target: ParameterBag;
  scope: LockScope;
}

function ModTargetOverlay({
  scope,
  path,
  modulationCapture,
  modulators,
  onModulationTarget,
  range,
}: {
  scope: LockScope;
  path: string;
  modulationCapture: ModulationCapture | null;
  modulators: ModulatorDraft[];
  onModulationTarget: (path: string, amount: number, range?: { min: number; max: number }) => void;
  range?: { min: number; max: number };
}) {
  if (modulationCapture?.device !== scope) {
    return null;
  }

  const amount = modulators[modulationCapture.modulator]?.amount ?? 0.25;
  return (
    <div className="mod-target-overlay">
      <span>M{modulationCapture.modulator + 1}</span>
      <input
        aria-label={`Set modulation amount for ${path}`}
        type="range"
        min={-1}
        max={1}
        step={0.01}
        defaultValue={amount}
        onChange={(event) => onModulationTarget(path, Number(event.target.value), range)}
      />
      <button type="button" onClick={() => onModulationTarget(path, amount, range)}>Set</button>
    </div>
  );
}

function formatControlValue(value: number, suffix: string): string {
  if (suffix.length > 0) {
    return `${Math.round(value)}${suffix}`;
  }
  return value.toFixed(2);
}

function controlClass(
  scope: LockScope,
  path: string,
  selectedEvent: StepEvent | undefined,
  lockCapture: boolean,
  modulationCapture: ModulationCapture | null,
  voice: ProgramVoice,
): string {
  const locked = getStepLocks(selectedEvent).some((lock) => lock.scope === scope && lock.path === path);
  const modulated = getModulationRoutes(voice).some((route) => route.device === scope && route.target === path && route.enabled !== false);
  return [
    "control",
    locked ? "locked" : "",
    modulated ? "modulated" : "",
    lockCapture ? "capture-ready" : "",
    modulationCapture?.device === scope ? "mod-target-ready" : "",
  ].join(" ");
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field range-field">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{Math.round(value)}{suffix}</strong>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ValidationPanel({ validation }: { validation: { errors: string[]; warnings: string[] } }) {
  return (
    <section className="panel validation-panel">
      <h2>Validation</h2>
      {validation.errors.length === 0 && validation.warnings.length === 0 ? (
        <p className="ok-line"><CheckCircle2 size={16} />Package valid</p>
      ) : (
        <>
          {validation.errors.map((error, index) => <p key={`error:${index}:${error}`} className="error-text"><AlertTriangle size={14} />{error}</p>)}
          {validation.warnings.map((warning, index) => <p key={`warning:${index}:${warning}`} className="warning-text"><AlertTriangle size={14} />{warning}</p>)}
        </>
      )}
    </section>
  );
}

function StatusBadge({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors > 0) return <span className="status-badge error">{errors} errors</span>;
  if (warnings > 0) return <span className="status-badge warning">{warnings} warnings</span>;
  return <span className="status-badge ok">valid</span>;
}

function schedulePatternStep(context: AudioContext, voice: ProgramVoice, step: number, startAt: number): void {
  const stepEvent = findStepEvent(voice, step);
  if (stepEvent?.instrumentTrigger?.enabled !== true || voice.instrument.type !== "polySh101") return;
  const parameters = applyParameterLocks(voice.instrument.defaults, stepEvent.parameterLocks?.instrument);
  playPolySh101Event(context, startAt, parameters, stepEvent.instrumentTrigger.durationMs);
}

function getPatternStepMs(voice: ProgramVoice): number {
  return (60_000 / voice.pattern.tempoBpm) * voice.pattern.stepDurationBeats;
}

function pitchToMidiNumber(pitch: string): number {
  const match = pitch.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (match === null) return 48;
  const semitones: Record<string, number> = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };
  const [, note = "C", octaveText = "3"] = match;
  return (Number(octaveText) + 1) * 12 + (semitones[note] ?? 0);
}

function midiToPitch(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[midi % 12] ?? "C";
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function getLockedPitchSet(event: StepEvent | undefined): Set<string> {
  const pitches = event?.parameterLocks?.instrument?.pitches;
  if (!Array.isArray(pitches)) {
    return new Set();
  }
  return new Set(pitches.filter((value): value is string => typeof value === "string"));
}

function completionLabel(completion: ProgramCompletion): string {
  if (completion.type === "patternRepetitions") return `${completion.repetitions} loops`;
  if (completion.type === "uiChoice") return "UI choice";
  if (completion.type === "hostAction") return "Host action";
  return "Forever";
}

function loadCompositions(): Composition[] {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) return seedCompositions();

  try {
    const parsed = JSON.parse(stored) as Composition[];
    return parsed.length > 0 ? parsed : seedCompositions();
  } catch {
    return seedCompositions();
  }
}

async function createAssetFromFile(file: File): Promise<ImportedAsset> {
  const durationMs = file.type.startsWith("audio/") ? await readAudioDurationMs(file) : undefined;
  const asset: AssetReference = {
    id: `asset-${file.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    type: file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "other",
    path: `assets/${file.name}`,
    hash: `local-${file.size}-${file.lastModified}`,
  };

  if (durationMs !== undefined) {
    asset.durationMs = durationMs;
  }

  return {
    asset,
    embeddedPayload: {
      dataUrl: await fileToDataUrl(file),
      mimeType: file.type || "application/octet-stream",
      name: file.name,
      size: file.size,
    },
  };
}

async function readAudioDurationMs(file: File): Promise<number | undefined> {
  try {
    const context = createAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    await context.close();
    return decoded.duration * 1000;
  } catch {
    return undefined;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read media file."));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read media file.")));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read package asset."));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Could not read package asset.")));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  return response.arrayBuffer();
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function ensureEmbeddedAssets(composition: Composition): Record<string, EmbeddedAssetPayload> {
  composition.metadata ??= {};

  if (!isRecord(composition.metadata.embeddedAssets)) {
    composition.metadata.embeddedAssets = {};
  }

  return composition.metadata.embeddedAssets as Record<string, EmbeddedAssetPayload>;
}

function readEmbeddedAssets(composition: Composition): Record<string, EmbeddedAssetPayload> {
  if (!isRecord(composition.metadata?.embeddedAssets)) {
    return {};
  }

  return composition.metadata.embeddedAssets as Record<string, EmbeddedAssetPayload>;
}

function stripEmbeddedAssets(composition: Composition): void {
  if (!isRecord(composition.metadata)) return;
  delete composition.metadata.embeddedAssets;
}

function normalizePackagePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.length === 0 || normalized.split("/").includes("..")) {
    return "assets/unnamed";
  }
  return normalized;
}

function guessMimeType(asset: AssetReference): string {
  if (asset.type === "audio") {
    if (asset.path.endsWith(".mp3")) return "audio/mpeg";
    if (asset.path.endsWith(".ogg")) return "audio/ogg";
    if (asset.path.endsWith(".m4a")) return "audio/mp4";
    return "audio/wav";
  }

  if (asset.type === "image") {
    if (asset.path.endsWith(".jpg") || asset.path.endsWith(".jpeg")) return "image/jpeg";
    if (asset.path.endsWith(".webp")) return "image/webp";
    return "image/png";
  }

  return "application/octet-stream";
}

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSamplerZones(defaults: ParameterBag): SamplerZone[] {
  return Array.isArray(defaults.zones) ? (defaults.zones as unknown as SamplerZone[]) : [];
}

function createSamplerZone(assetId: string): SamplerZone {
  return {
    id: `zone-${Math.random().toString(36).slice(2, 9)}`,
    assetId,
    pitchLow: "C1",
    pitchHigh: "C6",
    velocityLow: 1,
    velocityHigh: 127,
    rootKey: "C3",
    gainDb: 0,
    startMs: 0,
    endMs: 0,
    loop: false,
  };
}
