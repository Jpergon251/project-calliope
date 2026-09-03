export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173/project-calliope/#/");
  await page.waitForFunction(
    () => Boolean(window.__app__ && window.__app__.router),
    { timeout: 15000 },
  );
  await page.waitForTimeout(400);

  const setupResult = await page.evaluate(async () => {
    const { pinia, router } = window.__app__ || {};
    if (!pinia) return { error: "No pinia found" };
    const store = pinia._s.get("library");

    store.folderHandle = { name: "Music" };
    store.initialized = true;
    store.loading = false;
    store.songs = [
      {
        id: "mock-1",
        title: "Cyberpunk Skyline",
        name: "Cyberpunk Skyline",
        artist: "Neon Wave Orchestra",
        album: "Night City Vibes",
        duration: 215,
        cover:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="%2314b814"/><circle cx="200" cy="200" r="100" fill="%23070a08"/></svg>',
      },
      {
        id: "mock-2",
        title: "Emerald Horizon",
        name: "Emerald Horizon",
        artist: "Synth Master",
        album: "Night City Vibes",
        duration: 180,
      },
      {
        id: "mock-3",
        title: "Digital Sunset",
        name: "Digital Sunset",
        artist: "Waveform Duo",
        album: "Synth Dreams",
        duration: 240,
      },
      {
        id: "mock-4",
        title: "Retro Runner",
        name: "Retro Runner",
        artist: "Arcade Beat",
        album: "Neon City",
        duration: 195,
      },
      {
        id: "mock-5",
        title: "Midnight Drive",
        name: "Midnight Drive",
        artist: "Electro Pulse",
        album: "Overdrive",
        duration: 210,
      },
    ];
    store.playlists = [
      {
        id: "all",
        name: "Todas las canciones",
        songIds: ["mock-1", "mock-2", "mock-3", "mock-4", "mock-5"],
      },
    ];
    store.playingSong = store.songs[0];
    store.isPlaying = true;
    store.currentTime = 45;
    store.duration = 215;

    await router.push({ name: "player" });
    return { ok: true, route: router.currentRoute.value.name };
  });

  await page.waitForTimeout(600);

  const playerMetrics = await page.evaluate(() => {
    const artwork = document.querySelector(".player-page-artwork");
    const visualizer = document.querySelector(".player-page-visualizer");
    const canvas = visualizer?.querySelector("canvas");
    return {
      artwork: artwork
        ? {
            width: artwork.offsetWidth,
            height: artwork.offsetHeight,
            aspectRatio: (artwork.offsetWidth / artwork.offsetHeight).toFixed(
              3,
            ),
            isSquare: Math.abs(artwork.offsetWidth - artwork.offsetHeight) <= 1,
          }
        : null,
      visualizer: visualizer
        ? {
            width: visualizer.offsetWidth,
            height: visualizer.offsetHeight,
            position: window.getComputedStyle(visualizer).position,
            left: window.getComputedStyle(visualizer).left,
            bottom: window.getComputedStyle(visualizer).bottom,
            backgroundColor:
              window.getComputedStyle(visualizer).backgroundColor,
            isFullWidth: visualizer.offsetWidth >= 390,
          }
        : null,
      canvas: canvas
        ? {
            width: canvas.offsetWidth,
            height: canvas.offsetHeight,
          }
        : null,
    };
  });

  await page.screenshot({ path: "mobile-player.png" });

  // Now test playlist page in mobile
  await page.evaluate(async () => {
    const router = window.__router__ || window.__app__?.router;
    if (router) {
      await router.push({ name: "playlist", params: { playlistId: "all" } });
    }
  });

  await page.waitForTimeout(600);

  const playlistMetrics = await page.evaluate(() => {
    const atmosphere = document.querySelector(".playlist-atmosphere");
    const canvas = atmosphere?.querySelector("canvas");
    return {
      atmosphere: atmosphere
        ? {
            width: atmosphere.offsetWidth,
            height: atmosphere.offsetHeight,
            position: window.getComputedStyle(atmosphere).position,
            left: window.getComputedStyle(atmosphere).left,
            bottom: window.getComputedStyle(atmosphere).bottom,
            display: window.getComputedStyle(atmosphere).display,
            zIndex: window.getComputedStyle(atmosphere).zIndex,
            backgroundColor:
              window.getComputedStyle(atmosphere).backgroundColor,
            isFullWidth: atmosphere.offsetWidth >= 390,
            isFixed: window.getComputedStyle(atmosphere).position === "fixed",
          }
        : null,
      canvas: canvas
        ? {
            width: canvas.offsetWidth,
            height: canvas.offsetHeight,
          }
        : null,
    };
  });

  await page.screenshot({ path: "mobile-playlist.png" });

  return { setupResult, playerMetrics, playlistMetrics };
}
