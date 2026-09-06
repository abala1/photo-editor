export interface Adjustments {
  brightness: number; // 0-200, 100 = normal
  contrast: number; // 0-200, 100 = normal
  saturation: number; // 0-200, 100 = normal
  rotation: number; // degrees, 0/90/180/270 plus fine-tune
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  rotation: 0,
};

export interface Preset {
  id: string;
  name: string;
  adjustments: Partial<Adjustments>;
  extraFilter?: string; // extra CSS filter functions (sepia, grayscale, hue-rotate)
  description?: string; // shown as a tooltip; keep honest about "inspired by", not a literal reproduction
}

/**
 * Estilos inspirados en rasgos visuales ampliamente asociados a estos fotógrafos
 * (contraste, tono, blanco y negro vs. color). Son aproximaciones vía filtros CSS,
 * no una reproducción técnica de su cámara, película o proceso de laboratorio.
 */
export const PRESETS: Preset[] = [
  { id: "none", name: "Original", adjustments: {} },
  {
    id: "newton",
    name: "Helmut Newton",
    adjustments: { brightness: 93, contrast: 142, saturation: 100 },
    extraFilter: "grayscale(100%)",
    description: "B&N de alto contraste, sombras duras y densas — inspirado en su estilo de moda/glamour dramático.",
  },
  {
    id: "lachapelle",
    name: "David LaChapelle",
    adjustments: { brightness: 112, contrast: 128, saturation: 185 },
    extraFilter: "saturate(1.15)",
    description: "Color hipersaturado, pop y brillante — inspirado en su estética surrealista y publicitaria.",
  },
  {
    id: "marshall",
    name: "Jim Marshall",
    adjustments: { brightness: 99, contrast: 122, saturation: 100 },
    extraFilter: "grayscale(100%)",
    description: "B&N documental de rock, contraste natural pero marcado — inspirado en sus icónicos retratos de músicos.",
  },
  {
    id: "capa",
    name: "Robert Capa",
    adjustments: { brightness: 90, contrast: 148, saturation: 100 },
    extraFilter: "grayscale(100%) blur(0.35px)",
    description: "B&N crudo, alto contraste y ligera falta de nitidez — inspirado en su fotoperiodismo de guerra.",
  },
  {
    id: "mccullin",
    name: "Don McCullin",
    adjustments: { brightness: 84, contrast: 165, saturation: 100 },
    extraFilter: "grayscale(100%)",
    description: "B&N muy oscuro y contrastado, negros densos — inspirado en su fotografía bélica y de posguerra.",
  },
  {
    id: "avedon",
    name: "Richard Avedon",
    adjustments: { brightness: 116, contrast: 132, saturation: 100 },
    extraFilter: "grayscale(100%)",
    description: "B&N limpio, blancos brillantes y alto contraste — inspirado en sus retratos de estudio sobre fondo blanco.",
  },
  {
    id: "lindbergh",
    name: "Peter Lindbergh",
    adjustments: { brightness: 106, contrast: 92, saturation: 100 },
    extraFilter: "grayscale(100%)",
    description: "B&N suave y natural, poco contraste — inspirado en su estilo crudo y sin retoque de moda.",
  },
  {
    id: "sarahmoon",
    name: "Sarah Moon",
    adjustments: { brightness: 109, contrast: 82, saturation: 55 },
    extraFilter: "sepia(22%) hue-rotate(-8deg)",
    description: "Color desaturado y suave, tono cálido difuso — inspirado en su estética onírica y pictórica.",
  },
  {
    id: "vallhonrat",
    name: "Javier Vallhonrat",
    adjustments: { brightness: 91, contrast: 124, saturation: 68 },
    extraFilter: "hue-rotate(8deg) saturate(0.9)",
    description: "Color desaturado y moody, claroscuro marcado — inspirado en su estética pictórica y de sombras.",
  },
  {
    id: "timwalker",
    name: "Tim Walker",
    adjustments: { brightness: 109, contrast: 100, saturation: 155 },
    extraFilter: "hue-rotate(-5deg)",
    description: "Color saturado, cálido y fantasioso — inspirado en su estética teatral y de cuento de hadas.",
  },
  {
    id: "terborg",
    name: "Richard Terborg",
    adjustments: { brightness: 104, contrast: 132, saturation: 142 },
    extraFilter: "saturate(1.1)",
    description: "Color vívido y gráfico, alto brillo y contraste — inspirado en su estilo editorial pulido y cinematográfico.",
  },
  {
    id: "malka",
    name: "Alix Malka",
    adjustments: { brightness: 115, contrast: 108, saturation: 125 },
    extraFilter: "sepia(15%) hue-rotate(-6deg)",
    description: "Color cálido y luminoso, brillo dorado — inspirado en su estética glamorosa y soleada.",
  },
];

export function buildCssFilter(adj: Adjustments, extraFilter?: string): string {
  const parts = [
    `brightness(${adj.brightness}%)`,
    `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`,
  ];
  if (extraFilter) parts.push(extraFilter);
  return parts.join(" ");
}
