import { useCallback, useRef, useState } from "react";
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

export default function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [presetId, setPresetId] = useState("none");
  const [cropMode, setCropMode] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<CropRect | null>(null);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("free");
  const [customRatio, setCustomRatio] = useState<CustomRatio>({ w: 4, h: 3 });
  const [showExport, setShowExport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [originalFileSize, setOriginalFileSize] = useState<number | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveConfirmationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 8;
  const zoomIn = () => setZoom((z) => (z === "fit" ? 1 : Math.min(ZOOM_MAX, z * 1.25)));
  const zoomOut = () => setZoom((z) => (z === "fit" ? 1 : Math.max(ZOOM_MIN, z / 1.25)));
  const zoomToFit = () => setZoom("fit");

  const onCanvasWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || cropMode || !image) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  /** Selecting a preset sets brightness/contrast/saturation to its exact tuned values
   * (falling back to neutral for anything it doesn't specify) so switching between
   * presets is predictable instead of blending with whatever was set before.
   * Rotation is untouched since it's a transform, not part of the color grade. */
  const onPresetChange = (id: string) => {
    const next = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
    setAdjustments((prev) => ({
      ...DEFAULT_ADJUSTMENTS,
      rotation: prev.rotation,
      ...next.adjustments,
    }));
    setPresetId(id);
  };

  /** Snapshots the current image + edit state onto the undo stack before a destructive,
   * pixel-baking operation (crop, remove background, upscale) replaces it. */
  const pushHistory = () => {
    if (!image) return;
    setHistory((h) => [...h, { image, imageSrc, adjustments, presetId }]);
  };

  const onUndo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setImage(last.image);
      setImageSrc(last.imageSrc);
      setAdjustments(last.adjustments);
      setPresetId(last.presetId);
      setCropMode(false);
      setPendingCrop(null);
      setZoom("fit");
      return h.slice(0, -1);
    });
  };

  const handleFileChosen = async (file: File) => {
    setError(null);
    try {
      const img = await loadImageFromFile(file);
      setImage(img);
      setImageSrc(img.src);
      setOriginalFileSize(file.size);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setPresetId("none");
      setPendingCrop(null);
      setCropMode(false);
      setHistory([]);
      setZoom("fit");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onOpenClick = () => fileInputRef.current?.click();

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileChosen(file);
    e.target.value = "";
  };

  const aspectRatioValue = ratioForPreset(aspectPreset, customRatio);

  const onToggleCropMode = () => {
    setAspectPreset("free");
    setPendingCrop(null);
    setCropMode(true);
  };

  const onApplyCrop = () => {
    if (!image || !pendingCrop) {
      setCropMode(false);
      return;
    }
    pushHistory();
    const baked = renderToCanvas(
      image,
      image.naturalWidth,
      image.naturalHeight,
      DEFAULT_ADJUSTMENTS,
      undefined,
      pendingCrop
    );
    canvasToImage(baked).then((newImg) => {
      setImage(newImg);
      setImageSrc(newImg.src);
      setCropMode(false);
      setPendingCrop(null);
      setZoom("fit");
    });
  };

  const onCancelCrop = () => {
    setCropMode(false);
    setPendingCrop(null);
  };

  const onAspectPresetChange = (preset: AspectPreset) => {
    setAspectPreset(preset);
    if (!image) return;
    setPendingCrop(cropForAspect(image.naturalWidth, image.naturalHeight, ratioForPreset(preset, customRatio)));
  };

  const onCustomRatioChange = (next: CustomRatio) => {
    setCustomRatio(next);
    if (!image || aspectPreset !== "custom") return;
    setPendingCrop(cropForAspect(image.naturalWidth, image.naturalHeight, ratioForPreset("custom", next)));
  };

  const onCropPxChange = (dimension: "width" | "height", value: number) => {
    if (!image || !pendingCrop || !Number.isFinite(value)) return;
    setPendingCrop(
      resizeCropToPx(pendingCrop, image.naturalWidth, image.naturalHeight, aspectRatioValue, dimension, value)
    );
  };

  const onReset = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setPresetId("none");
  };

  const runAiOperation = useCallback(
    async (op: (canvas: HTMLCanvasElement) => Promise<HTMLCanvasElement>) => {
      if (!image) return;
      pushHistory();
      setBusy(true);
      setError(null);
      try {
        const baked = renderToCanvas(
          image,
          image.naturalWidth,
          image.naturalHeight,
          adjustments,
          preset.extraFilter,
          null
        );
        const result = await op(baked);
        const newImg = await canvasToImage(result);
        setImage(newImg);
        setImageSrc(newImg.src);
        setAdjustments(DEFAULT_ADJUSTMENTS);
        setPresetId("none");
        setZoom("fit");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        setBusyMessage("");
      }
    },
    [image, imageSrc, adjustments, presetId, preset]
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
    if (!image) return;
    setSaving(true);
    setError(null);
    try {
      let baked = renderToCanvas(
        image,
        image.naturalWidth,
        image.naturalHeight,
        adjustments,
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

      if (webOptimize && originalFileSize) {
        const inKB = originalFileSize / 1024;
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
      <header className="topbar">
        <div className="topbar-title">
          <h1>Photofix</h1>
          <span className="topbar-subtitle">by Abel Alazo</span>
        </div>
        <div className="button-row">
          <button onClick={onOpenClick}>Abrir imagen</button>
          <button disabled={history.length === 0} onClick={onUndo}>
            Deshacer
          </button>
          <button className="primary" disabled={!image} onClick={() => setShowExport(true)}>
            Exportar
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onFileInputChange}
        />
      </header>

      <main className="main">
        <div
          className={zoom !== "fit" && !cropMode ? "canvas-area zoomed" : "canvas-area"}
          onWheel={onCanvasWheel}
        >
          {error && <div className="error-banner">{error}</div>}
          {saveConfirmation && (
            <div className="success-banner">✓ {saveConfirmation}</div>
          )}
          {image ? (
            <PreviewCanvas
              imageSrc={imageSrc}
              naturalWidth={image.naturalWidth}
              naturalHeight={image.naturalHeight}
              adjustments={adjustments}
              extraFilter={preset.extraFilter}
              cropMode={cropMode}
              crop={pendingCrop}
              cropAspectRatio={aspectRatioValue}
              onCropChange={setPendingCrop}
              zoom={zoom}
            />
          ) : (
            <div className="empty-state">
              <p>Abrí una imagen para empezar a editar</p>
              <button onClick={onOpenClick}>Abrir imagen</button>
            </div>
          )}
          {image && !cropMode && (
            <div className="zoom-toolbar">
              <button onClick={zoomOut} title="Alejar (Ctrl/Cmd + scroll)">
                −
              </button>
              <button className="zoom-label" onClick={zoomToFit}>
                {zoom === "fit" ? "Ajustar" : `${Math.round(zoom * 100)}%`}
              </button>
              <button onClick={zoomIn} title="Acercar (Ctrl/Cmd + scroll)">
                +
              </button>
            </div>
          )}
        </div>

        <Sidebar
          adjustments={adjustments}
          onAdjustmentsChange={setAdjustments}
          presetId={presetId}
          onPresetChange={onPresetChange}
          cropMode={cropMode}
          onToggleCropMode={onToggleCropMode}
          onApplyCrop={onApplyCrop}
          onCancelCrop={onCancelCrop}
          aspectPreset={aspectPreset}
          onAspectPresetChange={onAspectPresetChange}
          customRatio={customRatio}
          onCustomRatioChange={onCustomRatioChange}
          pendingCrop={pendingCrop}
          onCropPxChange={onCropPxChange}
          hasImage={!!image}
          onSharpen={onSharpen}
          onRemoveBackground={onRemoveBackground}
          onUpscale={onUpscale}
          busy={busy}
          busyMessage={busyMessage}
          onReset={onReset}
        />
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
