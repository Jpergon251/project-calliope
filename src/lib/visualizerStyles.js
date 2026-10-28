export const VISUALIZER_STYLES = [
  { value: "classic", label: "Onda clásica" },
  { value: "bars", label: "Barras clásicas" },
  { value: "dots", label: "Puntos" },
  { value: "rounded-bars", label: "Barras redondeadas" },
];

const VISUALIZER_STYLE_IDS = new Set(
  VISUALIZER_STYLES.map(({ value }) => value),
);

export function normalizeVisualizerStyle(style) {
  return VISUALIZER_STYLE_IDS.has(style) ? style : "classic";
}
