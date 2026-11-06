import { isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile } from "@tauri-apps/plugin-fs";

const AUDIO_EXTENSIONS = new Set([
  "aac", "aiff", "alac", "ape", "flac", "m4a", "m4b", "mp3", "oga",
  "ogg", "opus", "wav", "wave", "wma",
]);

const MIME_TYPES = {
  aac: "audio/aac",
  aiff: "audio/aiff",
  alac: "audio/mp4",
  ape: "audio/ape",
  flac: "audio/flac",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  wave: "audio/wav",
  wma: "audio/x-ms-wma",
};

function mimeTypeForPath(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  return MIME_TYPES[extension] || "application/octet-stream";
}

export function isTauriEnvironment() {
  return isTauri();
}

export async function selectMusicFolder() {
  if (isTauriEnvironment()) {
    const path = await open({
      directory: true,
      multiple: false,
      title: "Selecciona tu carpeta de música",
    });
    return path ? { type: "tauri", path } : null;
  }

  if (typeof window.showDirectoryPicker === "function") {
    return window.showDirectoryPicker({ mode: "read" });
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.addEventListener("change", () => {
      resolve({ type: "files", files: Array.from(input.files || []) });
      input.remove();
    }, { once: true });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    }, { once: true });
    input.click();
  });
}

export async function listMusicFiles(selection) {
  if (selection?.type === "tauri") {
    const files = [];
    const visit = async (directoryPath) => {
      for (const entry of await readDir(directoryPath)) {
        const path = await join(directoryPath, entry.name);
        if (entry.isDirectory) {
          await visit(path);
          continue;
        }

        const extension = entry.name.split(".").pop()?.toLowerCase();
        if (entry.isFile && AUDIO_EXTENSIONS.has(extension)) {
          files.push({
            name: entry.name,
            path,
            uri: path,
            mimeType: mimeTypeForPath(path),
          });
        }
      }
    };

    await visit(selection.path);
    return files;
  }

  if (selection?.type === "files") {
    return selection.files.map((file) => ({ file }));
  }

  const entries = [];
  for await (const entry of selection.values()) {
    if (entry.kind === "file") entries.push(entry);
  }
  return entries;
}

export async function readMusicFile(fileOrPath) {
  if (typeof fileOrPath === "string" && isTauriEnvironment()) {
    const bytes = await readFile(fileOrPath);
    return new Blob([bytes], { type: mimeTypeForPath(fileOrPath) });
  }

  if (fileOrPath instanceof Blob) return fileOrPath;
  if (fileOrPath?.file instanceof Blob) return fileOrPath.file;
  throw new TypeError("Se esperaba un archivo local o una ruta de Tauri.");
}
