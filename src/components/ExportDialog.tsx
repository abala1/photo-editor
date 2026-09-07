import { useState } from "react";
import { ExportFormat } from "../lib/imageProcessing";

export const WEB_OPTIMIZE_MAX_SIDE = 1200;
const WEB_OPTIMIZE_QUALITY = 85;

interface Props {
  onClose: () => void;
  onExport: (format: ExportFormat, quality: number, webOptimize: boolean) => void;
  saving: boolean;
}

export default function ExportDialog({ onClose, onExport, saving }: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(92);
  const [webOptimize, setWebOptimize] = useState(false);

  const toggleWebOptimize = () => {
    const next = !webOptimize;
    setWebOptimize(next);
    if (next) {
      setFormat("webp");
      setQuality(WEB_OPTIMIZE_QUALITY);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Exportar imagen</h3>

        <button
          className={webOptimize ? "preset active web-optimize" : "preset web-optimize"}
          onClick={toggleWebOptimize}
          style={{ width: "100%", marginBottom: 16 }}
        >
          ⚡ Optimizar para web · WebP {WEB_OPTIMIZE_MAX_SIDE}px
        </button>

        <div className="field">
          <span>Formato</span>
          <div className="button-row">
            {(["png", "jpeg", "webp"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                className={f === format ? "preset active" : "preset"}
                disabled={webOptimize}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {format !== "png" && (
          <label className="slider-row">
            <div className="slider-label">
              <span>Calidad</span>
              <span className="slider-value">{quality}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              disabled={webOptimize}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        )}

        {webOptimize && (
          <p className="busy-message">
            Se reduce el lado más largo a {WEB_OPTIMIZE_MAX_SIDE}px y se exporta en WebP,
            igual que WebPify.
          </p>
        )}

        <div className="button-row" style={{ marginTop: 16 }}>
          <button
            className="primary"
            disabled={saving}
            onClick={() => onExport(format, quality / 100, webOptimize)}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button className="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
