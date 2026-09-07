import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import PreviewCanvas, { Zoom } from "./components/PreviewCanvas";
import ExportDialog from "./components/ExportDialog";
import { Adjustments, DEFAULT_ADJUSTMENTS, PRESETS } from "./lib/filters";
import {
  CropRect,
  ExportFormat,
  canvasToBlob,
  canvasToImage,
  cropForAspect,
  loadImageFromFile,
  renderToCanvas,
  resizeCanvasToMaxSide,
  resizeCropToPx,
  sharpenCanvas,
} from "./lib/imageProcessing";
import { removeBackground } from "./lib/ai/removeBackground";
import { upscaleImage } from "./lib/ai/upscale";
import { saveImage } from "./lib/saveImage";

interface HistoryEntry {
  image: HTMLImageElement;
  imageSrc: string;
  adjustments: Adjustments;
  presetId: string;
}

export type AspectPreset = "free" | "16:9" | "9:16" | "custom";

export interface CustomRatio {
  w: number;
  h: number;
}

/** One open image and everything about how it's currently being edited —
 * each tab in the tab bar owns one of these, independent of the others. */
interface DocState {
  id: string;
  fileName: string;
  image: HTMLImageElement;
  imageSrc: string;
  adjustments: Adjustments;
  presetId: string;
  history: HistoryEntry[];
  originalFileSize: number | null;
  zoom: Zoom;
  cropMode: boolean;
  pendingCrop: CropRect | null;
  aspectPreset: AspectPreset;
  customRatio: CustomRatio;
}

function ratioForPreset(preset: AspectPreset, custom: CustomRatio): number | null {
  switch (preset) {
    case "free":
      return null;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
    case "custom":
      return custom.w > 0 && custom.h > 0 ? custom.w / custom.h : null;
  }
}

function newDocId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const [docs, setDocs] = useState<DocState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveConfirmationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = docs.find((d) => d.id === activeId) ?? null;

  /** Patches the active document immutably. Accepts either a partial patch or a
   * function of the current doc (for updates that depend on prior values). */
  const updateActive = useCallback(
    (patch: Partial<DocState> | ((d: DocState) => Partial<DocState>)) => {
      setDocs((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const p = typeof patch === "function" ? patch(d) : patch;
          return { ...d, ...p };
        })
      );
    },
    [activeId]
  );

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 8;
  const zoomIn = () =>
    updateActive((d) => ({ zoom: d.zoom === "fit" ? 1 : Math.min(ZOOM_MAX, d.zoom * 1.25) }));
  const zoomOut = () =>
    updateActive((d) => ({ zoom: d.zoom === "fit" ? 1 : Math.max(ZOOM_MIN, d.zoom / 1.25) }));
  const zoomToFit = () => updateActive({ zoom: "fit" });
  const zoomTo100 = () => updateActive({ zoom: 1 });

  const onCanvasWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !active || active.cropMode) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  const preset = PRESETS.find((p) => p.id === active?.presetId) ?? PRESETS[0];

  /** Selecting a preset sets brightness/contrast/saturation to its exact tuned values
   * (falling back to neutral for anything it doesn't specify) so switching between
   * presets is predictable instead of blending with whatever was set before.
   * Rotation is untouched since it's a transform, not part of the color grade. */
  const onPresetChange = (id: string) => {
    const next = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
    updateActive((d) => ({
      adjustments: { ...DEFAULT_ADJUSTMENTS, rotation: d.adjustments.rotation, ...next.adjustments },
      presetId: id,
    }));
  };

  /** Snapshots the active document's image + edit state onto its undo stack before a
   * destructive, pixel-baking operation (crop, remove background, upscale) replaces it. */
  const pushHistory = () => {
    if (!active) return;
    const { image, imageSrc, adjustments, presetId } = active;
    updateActive((d) => ({ history: [...d.history, { image, imageSrc, adjustments, presetId }] }));
  };

  const onUndo = () => {
    if (!active || active.history.length === 0) return;
    const last = active.history[active.history.length - 1];
    updateActive((d) => ({
      image: last.image,
      imageSrc: last.imageSrc,
      adjustments: last.adjustments,
      presetId: last.presetId,
      cropMode: false,
      pendingCrop: null,
      zoom: "fit",
      history: d.history.slice(0, -1),
    }));
  };

  const handleFilesChosen = async (files: FileList | File[]) => {
    setError(null);
    const newDocs: DocState[] = [];
    for (const file of Array.from(files)) {
      try {
        const img = await loadImageFromFile(file);
        newDocs.push({
          id: newDocId(),
          fileName: file.name,
          image: img,
          imageSrc: img.src,
          adjustments: DEFAULT_ADJUSTMENTS,
          presetId: "none",
          history: [],
          originalFileSize: file.size,
          zoom: "fit",
          cropMode: false,
          pendingCrop: null,
          aspectPreset: "free",
          customRatio: { w: 4, h: 3 },
        });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (newDocs.length === 0) return;
    setDocs((prev) => [...prev, ...newDocs]);
    setActiveId(newDocs[newDocs.length - 1].id);
  };

  const onOpenClick = () => fileInputRef.current?.click();

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFilesChosen(e.target.files);
    e.target.value = "";
  };

  /** Closes one tab and discards its unsaved edits (crop in progress, undo history)
   * without touching disk. Falls back to a neighboring tab, or the empty state. */
  const onCloseTab = (id: string) => {
    const doc = docs.find((d) => d.id === id);
    if (doc?.imageSrc.startsWith("blob:")) URL.revokeObjectURL(doc.imageSrc);

    setDocs((prev) => {
      const idx = prev.findIndex((d) => d.id === id);
      const next = prev.filter((d) => d.id !== id);
      if (activeId === id) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActiveId(fallback ? fallback.id : null);
      }
      return next;
    });
    setError(null);
    setSaveConfirmation(null);
  };

  /** Hides the canvas for this tab without discarding it — the tab stays in the
   * bar and clicking it again restores the view, same idea as minimizing a window. */
  const onMinimizeTab = (id: string) => {
    if (activeId !== id) return;
    setActiveId(null);
    setFullscreen(false);
  };

  /** Makes this tab's canvas fill the whole app window, hiding the topbar, tab
   * bar and sidebar. Clicking the same tab's green dot again (or Esc) exits. */
  const onToggleFullscreenTab = (id: string) => {
    if (activeId === id) {
      setFullscreen((f) => !f);
    } else {
      setActiveId(id);
      setFullscreen(true);
    }
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const aspectRatioValue = active ? ratioForPreset(active.aspectPreset, active.customRatio) : null;

  const onToggleCropMode = () => {
    updateActive({ aspectPreset: "free", pendingCrop: null, cropMode: true });
  };

  const onApplyCrop = () => {
    if (!active || !active.pendingCrop) {
      updateActive({ cropMode: false });
      return;
    }
    pushHistory();
    const baked = renderToCanvas(
      active.image,
      active.image.naturalWidth,
      active.image.naturalHeight,
      DEFAULT_ADJUSTMENTS,
      undefined,
      active.pendingCrop
    );
    canvasToImage(baked).then((newImg) => {
      updateActive({
        image: newImg,
        imageSrc: newImg.src,
        cropMode: false,
        pendingCrop: null,
        zoom: "fit",
      });
    });
  };

  const onCancelCrop = () => updateActive({ cropMode: false, pendingCrop: null });

  const onAspectPresetChange = (preset: AspectPreset) => {
    if (!active) return;
    const rect = cropForAspect(active.image.naturalWidth, active.image.naturalHeight, ratioForPreset(preset, active.customRatio));
    updateActive({ aspectPreset: preset, pendingCrop: rect });
  };

  const onCustomRatioChange = (next: CustomRatio) => {
    if (!active) return;
    if (active.aspectPreset !== "custom") {
      updateActive({ customRatio: next });
      return;
    }
    const rect = cropForAspect(active.image.naturalWidth, active.image.naturalHeight, ratioForPreset("custom", next));
    updateActive({ customRatio: next, pendingCrop: rect });
  };

  const onCropPxChange = (dimension: "width" | "height", value: number) => {
    if (!active || !active.pendingCrop || !Number.isFinite(value)) return;
    const rect = resizeCropToPx(
      active.pendingCrop,
      active.image.naturalWidth,
      active.image.naturalHeight,
      aspectRatioValue,
      dimension,
      value
    );
    updateActive({ pendingCrop: rect });
  };

  const onReset = () => updateActive({ adjustments: DEFAULT_ADJUSTMENTS, presetId: "none" });

  const runAiOperation = useCallback(
    async (op: (canvas: HTMLCanvasElement) => Promise<HTMLCanvasElement>) => {
      if (!active) return;
      pushHistory();
      setBusy(true);
      setError(null);
      try {
        const baked = renderToCanvas(
          active.image,
          active.image.naturalWidth,
          active.image.naturalHeight,
          active.adjustments,
          preset.extraFilter,
          null
        );
        const result = await op(baked);
        const newImg = await canvasToImage(result);
        updateActive({
          image: newImg,
          imageSrc: newImg.src,
          adjustments: DEFAULT_ADJUSTMENTS,
          presetId: "none",
          zoom: "fit",
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        setBusyMessage("");
      }
    },
    [active, preset, updateActive]
  );

  const onRemoveBackground = () =>
    runAiOperation((canvas) =>
      removeBackground(canvas, canvas.width, canvas.height, setBusyMessage)
    );

  const onUpscale = () =>
    runAiOperation((canvas) =>
      upscaleImage(canvas, canvas.width, canvas.height, setBusyMessage)
    );

  const onSharpen = () => {
    setBusyMessage("Aplicando nitidez...");
    return runAiOperation((canvas) => Promise.resolve(sharpenCanvas(canvas)));
  };

  const showSaveConfirmation = (message: string) => {
    if (saveConfirmationTimeout.current) clearTimeout(saveConfirmationTimeout.current);
    setSaveConfirmation(message);
    saveConfirmationTimeout.current = setTimeout(() => setSaveConfirmation(null), 5000);
  };

  const onExport = async (format: ExportFormat, quality: number, webOptimize: boolean) => {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      let baked = renderToCanvas(
        active.image,
        active.image.naturalWidth,
        active.image.naturalHeight,
        active.adjustments,
        preset.extraFilter,
        null
      );
      if (webOptimize) {
        baked = resizeCanvasToMaxSide(baked, 1200);
      }
      const blob = await canvasToBlob(baked, format, quality);
      const { path } = await saveImage(blob, format);
      if (path === null) return; // user cancelled the save dialog
      setShowExport(false);

      if (webOptimize && active.originalFileSize) {
        const inKB = active.originalFileSize / 1024;
        const outKB = blob.size / 1024;
        const ahorro = (1 - outKB / inKB) * 100;
        showSaveConfirmation(
          `Imagen guardada: ${path} · ${inKB.toFixed(0)}KB → ${outKB.toFixed(0)}KB (${ahorro.toFixed(0)}% menos)`
        );
      } else {
        showSaveConfirmation(`Imagen guardada: ${path}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app">
      {!fullscreen && (
        <header className="topbar">
          <div className="topbar-title">
            <h1>Photofix</h1>
            <span className="topbar-subtitle">by Abel Alazo</span>
          </div>
          <div className="button-row">
            <button onClick={onOpenClick}>Abrir imagen</button>
            <button disabled={!active} onClick={() => active && onCloseTab(active.id)}>
              Cerrar imagen
            </button>
            <button disabled={!active || active.history.length === 0} onClick={onUndo}>
              Deshacer
            </button>
            <button className="primary" disabled={!active} onClick={() => setShowExport(true)}>
              Exportar
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={onFileInputChange}
          />
        </header>
      )}

      {!fullscreen && docs.length > 0 && (
        <div className="tab-bar">
          {docs.map((d) => (
            <div
              key={d.id}
              className={d.id === activeId ? "tab active" : "tab"}
              onClick={() => setActiveId(d.id)}
              title={d.fileName}
            >
              <span className="tab-dots">
                <button
                  className="tab-dot dot-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(d.id);
                  }}
                  title="Cerrar"
                />
                <button
                  className="tab-dot dot-minimize"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMinimizeTab(d.id);
                  }}
                  title="Minimizar"
                />
                <button
                  className="tab-dot dot-fullscreen"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFullscreenTab(d.id);
                  }}
                  title="Pantalla completa"
                />
              </span>
              <span className="tab-label">{d.fileName}</span>
            </div>
          ))}
        </div>
      )}

      {fullscreen && (
        <button className="fullscreen-exit" onClick={() => setFullscreen(false)} title="Salir de pantalla completa (Esc)">
          ✕ Salir de pantalla completa
        </button>
      )}

      <main className="main">
        <div
          className={active && active.zoom !== "fit" && !active.cropMode ? "canvas-area zoomed" : "canvas-area"}
          onWheel={onCanvasWheel}
        >
          {error && <div className="error-banner">{error}</div>}
          {saveConfirmation && (
            <div className="success-banner">✓ {saveConfirmation}</div>
          )}
          {active ? (
            <PreviewCanvas
              imageSrc={active.imageSrc}
              naturalWidth={active.image.naturalWidth}
              naturalHeight={active.image.naturalHeight}
              adjustments={active.adjustments}
              extraFilter={preset.extraFilter}
              cropMode={active.cropMode}
              crop={active.pendingCrop}
              cropAspectRatio={aspectRatioValue}
              onCropChange={(r) => updateActive({ pendingCrop: r })}
              zoom={active.zoom}
            />
          ) : (
            <div className="empty-state">
              <p>Abrí una imagen para empezar a editar</p>
              <button onClick={onOpenClick}>Abrir imagen</button>
            </div>
          )}
          {active && !active.cropMode && (
            <div className="zoom-toolbar">
              <button onClick={zoomOut} title="Alejar (Ctrl/Cmd + scroll)">
                −
              </button>
              <button
                className="zoom-label"
                onClick={() => (active.zoom === "fit" ? zoomTo100() : zoomToFit())}
                title={active.zoom === "fit" ? "Ver a tamaño real (100%)" : "Ajustar a la ventana"}
              >
                {active.zoom === "fit" ? "Zoom" : `${Math.round(active.zoom * 100)}%`}
              </button>
              <button onClick={zoomIn} title="Acercar (Ctrl/Cmd + scroll)">
                +
              </button>
            </div>
          )}
        </div>

        {!fullscreen && (
          <Sidebar
            adjustments={active?.adjustments ?? DEFAULT_ADJUSTMENTS}
            onAdjustmentsChange={(a) => updateActive({ adjustments: a })}
            presetId={active?.presetId ?? "none"}
            onPresetChange={onPresetChange}
            cropMode={active?.cropMode ?? false}
            onToggleCropMode={onToggleCropMode}
            onApplyCrop={onApplyCrop}
            onCancelCrop={onCancelCrop}
            aspectPreset={active?.aspectPreset ?? "free"}
            onAspectPresetChange={onAspectPresetChange}
            customRatio={active?.customRatio ?? { w: 4, h: 3 }}
            onCustomRatioChange={onCustomRatioChange}
            pendingCrop={active?.pendingCrop ?? null}
            onCropPxChange={onCropPxChange}
            hasImage={!!active}
            onSharpen={onSharpen}
            onRemoveBackground={onRemoveBackground}
            onUpscale={onUpscale}
            busy={busy}
            busyMessage={busyMessage}
            onReset={onReset}
          />
        )}
      </main>

      {showExport && (
        <ExportDialog
          onClose={() => setShowExport(false)}
          onExport={onExport}
          saving={saving}
        />
      )}
    </div>
  );
}
