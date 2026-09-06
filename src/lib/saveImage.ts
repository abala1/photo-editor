import { isTauri } from "@tauri-apps/api/core";
import { ExportFormat } from "./imageProcessing";

const FORMAT_META: Record<ExportFormat, { extension: string; dialogName: string }> = {
  png: { extension: "png", dialogName: "PNG" },
  jpeg: { extension: "jpg", dialogName: "JPEG" },
  webp: { extension: "webp", dialogName: "WebP" },
};

export interface SaveResult {
  path: string | null; // null when the user cancelled the save dialog
}

/** Saves the exported blob to disk. Inside the packaged Tauri app this opens the native
 * "Save As" dialog and writes the file directly. In a plain browser (used for dev-time
 * verification outside the native shell) it falls back to a `<a download>` click, since
 * Tauri's dialog/fs plugins aren't available there. */
export async function saveImage(blob: Blob, format: ExportFormat): Promise<SaveResult> {
  const { extension, dialogName } = FORMAT_META[format];
  const defaultName = `editada.${extension}`;

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: dialogName, extensions: [extension] }],
    });
    if (!path) return { path: null };

    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(path, bytes);
    return { path };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return { path: defaultName };
}
