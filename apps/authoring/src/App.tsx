import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import JSZip from "jszip";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Copy,
  Download,
  FileInput,
  Layers,
  Lock,
  Plus,
  Radio,
  Save,
  Trash2,
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
import { buildCompositionTimeline } from "@herd/runtime";
import {
  clampStepCount,
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
  validateAuthoringComposition,
  type DeviceScope,
  type LockScope,
} from "./model";

const storageKey = "herd.authoring.compositions.v1";
const serverBase = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787";
const hostBase = import.meta.env.VITE_HOST_URL ?? "http://localhost:5173";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const packageInputRef = useRef<HTMLInputElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);

  const activeComposition = compositions.find((composition) => composition.id === activeId) ?? compositions[0];
  const selectedProgram = activeComposition === undefined ? undefined : getProgram(activeComposition, selectedProgramId);
  const selectedVoice = selectedProgram === undefined ? undefined : getVoice(selectedProgram, selectedVoiceId);
  const selectedEvent = selectedVoice === undefined ? undefined : findStepEvent(selectedVoice, selectedStep);
  const validation = activeComposition === undefined
    ? { errors: ["No Composition open."], warnings: [] }
    : validateAuthoringComposition(activeComposition);
  const timeline = activeComposition === undefined ? null : buildCompositionTimeline(activeComposition);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(compositions));
  }, [compositions]);

  useEffect(() => {
    if (activeComposition === undefined) return;
    if (!activeComposition.programs.some((program) => program.id === selectedProgramId)) {
      const fallbackProgram = activeComposition.programs[0];
      if (fallbackProgram !== undefined) {
        setSelectedProgramId(fallbackProgram.id);
        setSelectedVoiceId(fallbackProgram.voices[0]?.id ?? "");
      }
    }
  }, [activeComposition, selectedProgramId]);

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
    setSelectedProgramId(composition.programSequencer.initialProgramId);
    setSelectedVoiceId(composition.programs[0]?.voices[0]?.id ?? "");
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

  async function exportPackage() {
    if (activeComposition === undefined) return;

    const zip = new JSZip();
    const packaged = cloneComposition(activeComposition);
    const embeddedAssets = readEmbeddedAssets(activeComposition);

    for (const asset of packaged.assets) {
      asset.path = normalizePackagePath(asset.path);
      const payload = embeddedAssets[asset.id];
      if (payload === undefined) continue;

      zip.file(asset.path, await dataUrlToArrayBuffer(payload.dataUrl));
    }

    stripEmbeddedAssets(packaged);
    zip.file("composition.json", JSON.stringify(packaged, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${activeComposition.id}.herd.zip`);
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
      if (composition.programs.length <= 1) return;
      composition.programs = composition.programs.filter((program) => program.id !== programId);
      composition.programSequencer.steps = composition.programSequencer.steps.filter((step) => step.programId !== programId);
      if (composition.programSequencer.initialProgramId === programId) {
        composition.programSequencer.initialProgramId = composition.programs[0]!.id;
      }
      const fallback = composition.programs[0]!;
      setSelectedProgramId(fallback.id);
      setSelectedVoiceId(fallback.voices[0]?.id ?? "");
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

  function handleStepClick(step: number) {
    setSelectedStep(step);
    if (selectedProgram === undefined || selectedVoice === undefined) return;

    updateActive((composition) => {
      const voice = getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id);
      const event = ensureStepEvent(voice, step);

      if (layers.instrument) {
        event.instrumentTrigger = {
          enabled: !(event.instrumentTrigger?.enabled ?? false),
          durationMs: event.instrumentTrigger?.durationMs ?? 180,
        };
      }

      if (layers.visualizer) {
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

      if (modulationCapture?.device === scope) {
        const draft = modulators[scope][modulationCapture.modulator];
        if (draft !== undefined) {
          setModulationRoute(voice, {
            device: scope,
            modulator: modulationCapture.modulator + 1,
            source: draft.source,
            amount: draft.amount,
            target: path,
          });
        }
        setModulationCapture(null);
      }
    });
  }

  if (activeComposition === undefined || selectedProgram === undefined || selectedVoice === undefined) {
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
          selectedProgramId={selectedProgram.id}
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
              selectedVoiceId={selectedVoice.id}
              onSelect={setSelectedVoiceId}
              onAdd={addVoice}
              onDelete={deleteVoice}
              onRename={(voiceId, name) => updateActive((composition) => {
                getVoice(getProgram(composition, selectedProgram.id), voiceId).name = name;
              })}
            />
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
          </div>

          <div className="device-stack">
            <PatternEditor
              voice={selectedVoice}
              selectedStep={selectedStep}
              layers={layers}
              selectedEvent={selectedEvent}
              onLayers={setLayers}
              onStep={handleStepClick}
              onPatternChange={(mutator) => updateActive((composition) => {
                mutator(getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id));
              })}
              onEventChange={updateSelectedEvent}
              onArmLock={() => setLockCapture(true)}
              lockCapture={lockCapture}
            />
            <InstrumentEditor
              voice={selectedVoice}
              selectedEvent={selectedEvent}
              lockCapture={lockCapture}
              modulationCapture={modulationCapture}
              modulators={modulators.instrument}
              onModulators={(drafts) => setModulators((current) => ({ ...current, instrument: drafts }))}
              onArmModulation={(modulator) => setModulationCapture({ device: "instrument", modulator })}
              onParameter={(path, value) => updateDeviceParameter("instrument", path, value)}
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
              onArmModulation={(modulator) => setModulationCapture({ device: "visualizer", modulator })}
              onParameter={(path, value) => updateDeviceParameter("visualizer", path, value)}
            />
            <UIDeviceEditor
              voice={selectedVoice}
              programs={activeComposition.programs}
              onChange={(mutator) => updateActive((composition) => {
                mutator(getVoice(getProgram(composition, selectedProgram.id), selectedVoice.id));
              })}
            />
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
              {getModulationRoutes(selectedVoice).length === 0 ? (
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
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onSetInitial,
}: {
  composition: Composition;
  selectedProgramId: string;
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
        <Layers aria-hidden="true" />
        <h2>Program Sequencer</h2>
      </div>
      <div className="program-steps">
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
                <button onClick={() => onDuplicate(program.id)}><Copy size={13} /></button>
                <button onClick={() => onDelete(program.id)}><Trash2 size={13} /></button>
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
  onStep,
  onPatternChange,
  onEventChange,
  onArmLock,
  lockCapture,
}: {
  voice: ProgramVoice;
  selectedStep: number;
  layers: LayersState;
  selectedEvent: StepEvent | undefined;
  onLayers: (layers: LayersState) => void;
  onStep: (step: number) => void;
  onPatternChange: (mutator: (voice: ProgramVoice) => void) => void;
  onEventChange: (mutator: (event: StepEvent, voice: ProgramVoice) => void) => void;
  onArmLock: () => void;
  lockCapture: boolean;
}) {
  const steps = Array.from({ length: voice.pattern.stepCount }, (_, index) => index);
  return (
    <section className="device-panel pattern-device">
      <DeviceHeader title="Pattern" subtitle="Step Sequencer" />
      <div className="pattern-controls">
        <NumberField label="Steps" min={1} max={64} value={voice.pattern.stepCount} onChange={(value) => onPatternChange((draft) => {
          draft.pattern.stepCount = clampStepCount(value);
          draft.pattern.stepEvents = draft.pattern.stepEvents.filter((event) => event.step < draft.pattern.stepCount);
        })} />
        <NumberField label="Tempo" min={20} max={240} value={voice.pattern.tempoBpm} onChange={(value) => onPatternChange((draft) => {
          draft.pattern.tempoBpm = value;
        })} />
        <NumberField label="Repeats" min={1} max={64} value={voice.pattern.repetitions ?? 1} onChange={(value) => onPatternChange((draft) => {
          draft.pattern.repetitions = Math.max(1, Math.round(value));
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
              onClick={() => onStep(step)}
              aria-label={`Step ${step + 1}`}
            >
              <span>{step + 1}</span>
              <small>{hasInstrument ? "I" : ""}{hasVisualizer ? "V" : ""}{hasLocks ? "L" : ""}</small>
            </button>
          );
        })}
      </div>
      <div className="step-editor">
        <div>
          <h3>Selected Step {selectedStep + 1}</h3>
          <p>{selectedEvent === undefined ? "No Step Event yet." : "Edit triggers and locks for this Step Event."}</p>
        </div>
        <button className={lockCapture ? "armed-button" : ""} onClick={onArmLock}><Lock size={14} />Create lock</button>
      </div>
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
        {getStepLocks(selectedEvent).length === 0 ? <p className="muted">No locks on this step.</p> : getStepLocks(selectedEvent).map((lock) => (
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
        <>
          <TextControl label="Pitch" path="pitch" target={voice.instrument.defaults} scope="instrument" {...props} />
          <NumberControl label="Velocity" path="velocity" min={1} max={127} target={voice.instrument.defaults} scope="instrument" {...props} />
          <NumberControl label="Saw" path="oscillator.saw" min={0} max={1} target={voice.instrument.defaults} scope="instrument" boolean {...props} />
          <NumberControl label="Pulse" path="oscillator.pulse" min={0} max={1} target={voice.instrument.defaults} scope="instrument" boolean {...props} />
          <NumberControl label="Sub" path="oscillator.sub" min={0} max={1} target={voice.instrument.defaults} scope="instrument" boolean {...props} />
          <SliderControl label="Noise" path="oscillator.noise" target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="Pulse Width" path="oscillator.pulseWidth" target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="Filter Cutoff" path="filter.cutoff" target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="Resonance" path="filter.resonance" target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="Filter Env" path="filter.envelopeAmount" target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="LFO Rate" path="lfo.rate" target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="LFO Amount" path="lfo.amount" target={voice.instrument.defaults} scope="instrument" {...props} />
          <NumberControl label="Attack" path="envelope.attackMs" min={0} max={2000} target={voice.instrument.defaults} scope="instrument" {...props} />
          <NumberControl label="Decay" path="envelope.decayMs" min={1} max={5000} target={voice.instrument.defaults} scope="instrument" {...props} />
          <SliderControl label="Sustain" path="envelope.sustain" target={voice.instrument.defaults} scope="instrument" {...props} />
          <NumberControl label="Release" path="envelope.releaseMs" min={1} max={5000} target={voice.instrument.defaults} scope="instrument" {...props} />
        </>
      )}
    </DevicePanel>
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
  return (
    <DevicePanel title="Visualizer" subtitle="Color Wash and Cel Defaults" scope="visualizer" {...props}>
      <NumberControl label="Hue" path="hue" min={0} max={360} target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Saturation" path="saturation" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Brightness" path="brightness" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <TextControl label="Shape" path="shape" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <SliderControl label="Intensity" path="intensity" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <NumberControl label="Decay" path="decayMs" min={1} max={5000} target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <TextControl label="Placement" path="placement" target={voice.visualizer.defaults} scope="visualizer" {...props} />
      <TextControl label="Motion" path="motion" target={voice.visualizer.defaults} scope="visualizer" {...props} />
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

interface DeviceEditorProps {
  voice: ProgramVoice;
  selectedEvent: StepEvent | undefined;
  lockCapture: boolean;
  modulationCapture: ModulationCapture | null;
  modulators: ModulatorDraft[];
  onModulators: (drafts: ModulatorDraft[]) => void;
  onArmModulation: (modulator: number) => void;
  onParameter: (path: string, value: ParameterValue) => void;
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
}: DeviceEditorProps & {
  title: string;
  subtitle: string;
  scope: DeviceScope;
  children: ReactNode;
}) {
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
              Target
            </button>
          </div>
        ))}
        <div className="route-list">
          {getModulationRoutes(voice).filter((route) => route.device === scope).map((route) => (
            <span key={`${route.device}:${route.modulator}:${route.target}`}>M{route.modulator} → {route.target}</span>
          ))}
        </div>
      </div>
    </section>
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
      <DeviceHeader title="UI Device" subtitle="Voice-local Prompt" />
      {ui === undefined ? (
        <button onClick={() => onChange((draft) => {
          const createdUi = createVoice().ui;
          if (createdUi !== undefined) {
            draft.ui = createdUi;
          }
        })}>Add UI Device</button>
      ) : (
        <div className="ui-editor">
          <label>
            Prompt
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
                  <option value="">No jump</option>
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
  onParameter,
}: ControlProps) {
  const value = Number(getNestedParameter(target, path) ?? 0);
  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture)}>
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onParameter(path, Number(event.target.value))} />
      <strong>{value.toFixed(2)}</strong>
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
  onParameter,
  min = 0,
  max = 1,
  boolean,
}: ControlProps & { min?: number; max?: number; boolean?: boolean }) {
  const rawValue = getNestedParameter(target, path);
  if (boolean) {
    return (
      <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture)}>
        <span>{label}</span>
        <input type="checkbox" checked={rawValue === true} onChange={(event) => onParameter(path, event.target.checked)} />
      </label>
    );
  }

  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture)}>
      <span>{label}</span>
      <input type="number" min={min} max={max} value={Number(rawValue ?? 0)} onChange={(event) => onParameter(path, Number(event.target.value))} />
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
  onParameter,
}: ControlProps) {
  return (
    <label className={controlClass(scope, path, selectedEvent, lockCapture, modulationCapture)}>
      <span>{label}</span>
      <input value={String(getNestedParameter(target, path) ?? "")} onChange={(event) => onParameter(path, event.target.value)} />
    </label>
  );
}

interface ControlProps extends Pick<DeviceEditorProps, "selectedEvent" | "lockCapture" | "modulationCapture" | "onParameter"> {
  label: string;
  path: string;
  target: ParameterBag;
  scope: LockScope;
}

function controlClass(
  scope: LockScope,
  path: string,
  selectedEvent: StepEvent | undefined,
  lockCapture: boolean,
  modulationCapture: ModulationCapture | null,
): string {
  const locked = getStepLocks(selectedEvent).some((lock) => lock.scope === scope && lock.path === path);
  return [
    "control",
    locked ? "locked" : "",
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
          {validation.errors.map((error) => <p key={error} className="error-text"><AlertTriangle size={14} />{error}</p>)}
          {validation.warnings.map((warning) => <p key={warning} className="warning-text"><AlertTriangle size={14} />{warning}</p>)}
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
    const context = new AudioContext();
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
