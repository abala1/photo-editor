import { AspectPreset, CustomRatio } from "../App";
import { Adjustments, PRESETS } from "../lib/filters";
import { CropRect } from "../lib/imageProcessing";

interface Props {
  adjustments: Adjustments;
  onAdjustmentsChange: (a: Adjustments) => void;
  presetId: string;
  onPresetChange: (id: string) => void;
  cropMode: boolean;
  onToggleCropMode: () => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  aspectPreset: AspectPreset;
  onAspectPresetChange: (preset: AspectPreset) => void;
  customRatio: CustomRatio;
  onCustomRatioChange: (ratio: CustomRatio) => void;
  pendingCrop: CropRect | null;
  onCropPxChange: (dimension: "width" | "height", value: number) => void;
  hasImage: boolean;
  onSharpen: () => void;
  onRemoveBackground: () => void;
  onUpscale: () => void;
  busy: boolean;
  busyMessage: string;
  onReset: () => void;
}

const ASPECT_PRESETS: { value: AspectPreset; label: string }[] = [
  { value: "free", label: "Libre" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "custom", label: "Fijo" },
];

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider-row">
      <div className="slider-label">
        <span>{label}</span>
        <span className="slider-value">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function Sidebar({
  adjustments,
  onAdjustmentsChange,
  presetId,
  onPresetChange,
  cropMode,
  onToggleCropMode,
  onApplyCrop,
  onCancelCrop,
  aspectPreset,
  onAspectPresetChange,
  customRatio,
  onCustomRatioChange,
  pendingCrop,
  onCropPxChange,
  hasImage,
  onSharpen,
  onRemoveBackground,
  onUpscale,
  busy,
  busyMessage,
  onReset,
}: Props) {
  const set = (key: keyof Adjustments) => (v: number) =>
    onAdjustmentsChange({ ...adjustments, [key]: v });

  const rotate = (delta: number) =>
    onAdjustmentsChange({
      ...adjustments,
      rotation: (((adjustments.rotation + delta) % 360) + 360) % 360,
    });

  return (
    <aside className="sidebar">
      <section>
        <h3>Ajustes</h3>
        <Slider label="Brillo" value={adjustments.brightness} onChange={set("brightness")} />
        <Slider label="Contraste" value={adjustments.contrast} onChange={set("contrast")} />
        <Slider label="Saturación" value={adjustments.saturation} onChange={set("saturation")} />
        <button className="secondary" onClick={onReset} disabled={!hasImage}>
          Restablecer ajustes
        </button>
      </section>

      <section>
        <h3>Rotar</h3>
        <div className="button-row">
          <button disabled={!hasImage} onClick={() => rotate(-90)}>
            ⟲ 90°
          </button>
          <button disabled={!hasImage} onClick={() => rotate(90)}>
            ⟳ 90°
          </button>
        </div>
      </section>

      <section>
        <h3>Recortar</h3>
        {!cropMode ? (
          <button disabled={!hasImage} onClick={onToggleCropMode}>
            Iniciar recorte
          </button>
        ) : (
          <>
            <div className="button-row">
              {ASPECT_PRESETS.map(({ value, label }) => (
                <button
                  key={value}
                  className={value === aspectPreset ? "preset active" : "preset"}
                  onClick={() => onAspectPresetChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {aspectPreset === "custom" && (
              <div className="ratio-inputs">
                <input
                  type="number"
                  min={1}
                  value={customRatio.w}
                  onChange={(e) => onCustomRatioChange({ ...customRatio, w: Number(e.target.value) })}
                  aria-label="Proporción ancho"
                />
                <span>:</span>
                <input
                  type="number"
                  min={1}
                  value={customRatio.h}
                  onChange={(e) => onCustomRatioChange({ ...customRatio, h: Number(e.target.value) })}
                  aria-label="Proporción alto"
                />
              </div>
            )}

            {pendingCrop && (
              <div className="px-inputs">
                <label>
                  <span>Ancho (px)</span>
                  <input
                    type="number"
                    min={1}
                    value={pendingCrop.width}
                    onChange={(e) => onCropPxChange("width", Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Alto (px)</span>
                  <input
                    type="number"
                    min={1}
                    value={pendingCrop.height}
                    onChange={(e) => onCropPxChange("height", Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            <div className="button-row">
              <button onClick={onApplyCrop}>Aplicar</button>
              <button className="secondary" onClick={onCancelCrop}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <h3>Filtros</h3>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={p.id === presetId ? "preset active" : "preset"}
              disabled={!hasImage}
              onClick={() => onPresetChange(p.id)}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Mejorar</h3>
        <button disabled={!hasImage || busy} onClick={onSharpen}>
          Nitidez (Sharpen)
        </button>
      </section>

      <section>
        <h3>IA local (offline, gratis)</h3>
        <button disabled={!hasImage || busy} onClick={onRemoveBackground}>
          Quitar fondo
        </button>
        <button disabled={!hasImage || busy} onClick={onUpscale}>
          Ampliar imagen (3x)
        </button>
        {busy && <p className="busy-message">{busyMessage}</p>}
      </section>
    </aside>
  );
}
