import assert from "node:assert/strict";
import test from "node:test";
import {
  COLOR_PALETTES,
  getColorPalette,
  normalizePaletteId,
} from "./colorPalettes.js";

const REQUIRED_THEME_TOKENS = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-tertiary",
  "--surface",
  "--surface-hover",
  "--surface-active",
  "--text-primary",
  "--text-secondary",
  "--accent",
  "--accent-hover",
  "--accent-contrast",
  "--border-color",
  "--border-hover",
];

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test("expone solo los tres temas con sus nombres y colores definidos", () => {
  assert.deepEqual(
    COLOR_PALETTES.map(({ value, label, colors }) => [value, label, colors]),
    [
      [
        "miami-vice",
        "Miami Vice",
        ["#261D2B", "#34253A", "#4A3152", "#F5D5AA", "#B77EA5", "#F5EAF0"],
      ],
      [
        "neon-wave",
        "Neon Wave",
        ["#121212", "#242424", "#1DB954", "#1ED760", "#FFFFFF", "#777777"],
      ],
      [
        "red-music",
        "Red Music",
        ["#030303", "#0F0F0F", "#212121", "#FF0033", "#FFFFFF", "#AAAAAA"],
      ],
    ]
  );
});

test("cada paleta configura las superficies, textos, acentos y bordes", () => {
  for (const palette of COLOR_PALETTES) {
    for (const token of REQUIRED_THEME_TOKENS) {
      assert.ok(palette.tokens[token], `${palette.value} no define ${token}`);
    }
  }
});

test("los textos y etiquetas de accion mantienen contraste legible", () => {
  for (const palette of COLOR_PALETTES) {
    assert.ok(
      contrastRatio(palette.tokens["--text-primary"], palette.tokens["--bg-primary"]) >= 4.5,
      `${palette.label}: contraste de texto insuficiente`
    );
    assert.ok(
      contrastRatio(palette.tokens["--accent-contrast"], palette.tokens["--accent"]) >= 4.5,
      `${palette.label}: contraste de boton insuficiente`
    );
  }
});

test("Miami Vice y Red Music no usan neón; Neon Wave conserva el acento verde sobrio", () => {
  assert.equal(getColorPalette("miami-vice").tokens["--neon-glow"], "none");
  assert.equal(getColorPalette("miami-vice").tokens["--accent"], "#F5D5AA");
  assert.equal(getColorPalette("miami-vice").tokens["--accent-secondary"], "#B77EA5");
  assert.equal(getColorPalette("miami-vice").tokens["--theme-logo-color"], "#FFEAD1");
  assert.equal(getColorPalette("miami-vice").tokens["--visualizer-rgb"], "255, 255, 255");
  assert.equal(getColorPalette("miami-vice").tokens["--visualizer-color"], "#FFFFFF");
  assert.equal(getColorPalette("miami-vice").tokens["--theme-player-background"].includes("#704A73"), true);
  assert.equal(getColorPalette("miami-vice").tokens["--sidebar-bg"], "#191827");
  assert.equal(
    getColorPalette("miami-vice").tokens["--theme-main-background"],
    getColorPalette("miami-vice").tokens["--theme-workspace-background"]
  );
  assert.equal(
    getColorPalette("miami-vice").tokens["--theme-now-playing-background"].includes(
      "rgba(112, 74, 115, 0.28)"
    ),
    true
  );
  assert.equal(getColorPalette("neon-wave").tokens["--accent"], "#1DB954");
  assert.equal(getColorPalette("neon-wave").tokens["--bg-primary"], "#121212");
  assert.equal(getColorPalette("neon-wave").tokens["--text-primary"], "#FFFFFF");
  assert.equal(getColorPalette("neon-wave").tokens["--theme-player-background"], "#000000");
  assert.equal(getColorPalette("neon-wave").tokens["--visualizer-rgb"], "30, 215, 96");
  assert.equal(getColorPalette("neon-wave").tokens["--visualizer-color"], "#1ED760");
  assert.equal(getColorPalette("neon-wave").tokens["--neon-glow"], "none");
  assert.equal(getColorPalette("red-music").tokens["--accent"], "#FF0033");
  assert.equal(getColorPalette("red-music").tokens["--visualizer-rgb"], "255, 0, 51");
  assert.equal(getColorPalette("red-music").tokens["--visualizer-color"], "#FF3355");
  assert.equal(getColorPalette("red-music").tokens["--bg-primary"], "#0F0F0F");
  assert.equal(getColorPalette("red-music").tokens["--sidebar-bg"], "#030303");
  assert.equal(getColorPalette("red-music").tokens["--player-bg"], "#212121");
  assert.equal(getColorPalette("red-music").tokens["--neon-glow"], "none");
  assert.equal(getColorPalette("red-music").tokens["--theme-control-shadow"], "none");
});

test("normaliza preferencias antiguas al tema equivalente", () => {
  assert.equal(normalizePaletteId("neon"), "neon-wave");
  assert.equal(normalizePaletteId("cyan"), "miami-vice");
  assert.equal(normalizePaletteId("magenta"), "miami-vice");
  assert.equal(normalizePaletteId("amber"), "miami-vice");
  assert.equal(normalizePaletteId("rockstar"), "miami-vice");
  assert.equal(normalizePaletteId("spotify"), "neon-wave");
  assert.equal(normalizePaletteId("youtube-music"), "red-music");
  assert.equal(normalizePaletteId("unknown"), "miami-vice");
  assert.equal(getColorPalette("red-music").label, "Red Music");
});
