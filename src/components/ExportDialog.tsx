import { useState } from "react";
import { ExportFormat } from "../lib/imageProcessing";

interface Props {
  onClose: () => void;
  onExport: (format: ExportFormat, quality: number) => void;
  saving: boolean;
}

export default function ExportDialog({ onClose, onExport, saving }: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(92);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Exportar imagen</h3>

        <div className="field">
          <span>Formato</span>
          <div className="button-row">
            {(["png", "jpeg", "webp"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                className={f === format ? "preset active" : "preset"}
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
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        )}

        <div className="button-row" style={{ marginTop: 16 }}>
          <button disabled={saving} onClick={() => onExport(format, quality / 100)}>
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
