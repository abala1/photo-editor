# Editor de Fotos

App de escritorio (Tauri + React) para edición de fotos, 100% gratis y offline: sin API keys, sin costos por uso, sin conexión a internet una vez instalada.

## Funciones

- Ajustes: brillo, contraste, saturación
- Recorte interactivo (arrastrar y redimensionar)
- Rotación en incrementos de 90°
- 8 presets de filtros (Vívido, Blanco y Negro, Sepia, Frío, Cálido, Desvanecido, Noir)
- Exportar a PNG, JPEG o WebP con control de calidad
- **IA local (offline, gratis)**:
  - Quitar fondo — modelo U2Netp (ONNX) corriendo en el dispositivo
  - Ampliar imagen 3x — modelo de super-resolución del ONNX Model Zoo, con tiling solapado para evitar artefactos de cuadrícula

Toda la IA corre vía `onnxruntime-web` (WASM) dentro de la propia app — no se envía ninguna imagen a ningún servidor.

## Desarrollo

```bash
npm install
npm run tauri dev
```

## Build de producción

```bash
npm run tauri build
```

El instalador queda en `src-tauri/target/release/bundle/`.

## Notas técnicas

- Los modelos ONNX viven en `public/models/` y se empaquetan con la app.
- El runtime WASM de onnxruntime-web se importa desde `node_modules` (no desde `public/`) porque Vite no permite `import()` dinámico de archivos servidos como estáticos — ver `src/lib/ai/ort-setup.ts`.
- El modelo de super-resolución (`super-resolution-10.onnx`, ONNX Model Zoo) procesa parches fijos de 224×224 → 672×672 (factor 3x). Para imágenes más grandes se usa tiling con solape de 32px y promediado, para disimular las costuras entre bloques.
- Límite actual: imágenes muy grandes pueden tardar (o exceder el límite de bloques) al ampliar con IA — se recomienda recortar antes de ampliar.
