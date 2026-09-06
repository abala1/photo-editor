import { Adjustments, PRESETS } from "../lib/filters";

interface Props {
  adjustments: Adjustments;
  onAdjustmentsChange: (a: Adjustments) => void;
  presetId: string;
  onPresetChange: (id: string) => void;
  cropMode: boolean;
  onToggleCropMode: () => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  hasImage: boolean;
  onSharpen: () => void;
  onRemoveBackground: () => void;
  onUpscale: () => void;
  busy: boolean;
  busyMessage: string;
  onReset: () => void;
}

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
          <div className="button-row">
            <button onClick={onApplyCrop}>Aplicar</button>
            <button className="secondary" onClick={onCancelCrop}>
              Cancelar
            </button>
          </div>
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
