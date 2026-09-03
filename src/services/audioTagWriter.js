import {
  applyCoverArt,
  applyTags,
  clearPictures,
  clearTags,
  readPictures,
  readFormat,
  readTags
} from 'taglib-wasm/simple';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegPromise;

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

async function remuxMp4ToM4a(fileHandle, directoryHandle) {
  if (!directoryHandle?.getFileHandle) {
    throw new Error('No se puede crear el archivo M4A en esta carpeta.');
  }

  const sourceFile = await fileHandle.getFile();
  const inputName = `input-${crypto.randomUUID()}.mp3`;
  const outputName = sourceFile.name.replace(/\.mp3$/i, '.m4a');
  let outputHandle;
  try {
    await directoryHandle.getFileHandle(outputName);
    throw new Error(`Ya existe un archivo llamado "${outputName}".`);
  } catch (error) {
    if (error.message.startsWith('Ya existe')) throw error;
    outputHandle = await directoryHandle.getFileHandle(outputName, { create: true });
  }
  const ffmpeg = await getFFmpeg();

  await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));
  const exitCode = await ffmpeg.exec([
    '-i', inputName,
    '-map', '0:a:0',
    '-c:a', 'copy',
    '-vn',
    '-movflags', '+faststart',
    'output.m4a'
  ]);
  if (exitCode !== 0) {
    await ffmpeg.deleteFile(inputName);
    throw new Error('FFmpeg no pudo remuxar el audio AAC a M4A.');
  }

  const outputBytes = await ffmpeg.readFile('output.m4a');
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile('output.m4a');

  const writable = await outputHandle.createWritable();
  try {
    await writable.write(outputBytes);
  } finally {
    await writable.close();
  }
  return outputHandle;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function artistsAsTagValue(artists) {
  return Array.isArray(artists)
    ? artists.filter(Boolean).join(', ')
    : artists || '';
}

function getAudioExtension(fileName, isMisnamedMp4 = false) {
  if (isMisnamedMp4) return '.m4a';
  if (!fileName || typeof fileName !== 'string') return '.mp3';

  // Strictly match valid audio extension, explicitly ignoring any trailing whitespace,
  // question marks or query string artifacts (e.g. ".mp3 ?", ".mp3?version=1", ".m4a ?")
  const match = fileName.match(/\.(mp3|m4a|flac|wav|ogg|opus|aac|wma|aiff|alac)(?:\s*\?.*|\s+.*)?$/i);
  if (match) {
    return '.' + match[1].toLowerCase();
  }

  // Fallback for standard 2-5 letter extension
  const fallback = fileName.match(/\.([a-zA-Z0-9]{2,5})(?:[^\w].*)?$/);
  if (fallback) {
    return '.' + fallback[1].toLowerCase();
  }

  return '.mp3';
}

function safeFileName(value) {
  let str = String(value || 'audio').trim();

  // Strip trailing accidental " ?" (space followed by question mark) that can be inherited from corrupt filenames
  str = str.replace(/\s+\?$/, '');

  // Remove dangerous filesystem characters: path separators and control characters
  str = str.replace(/[\\/:*?"<>|]/g, '');

  // Collapse multiple whitespace
  str = str.replace(/\s+/g, ' ').trim();

  // Remove trailing dots, spaces, or accidental trailing question mark artifacts
  str = str.replace(/[. ]+$/, '').replace(/\s+\?$/, '').trim();

  return str || 'audio';
}

async function renameFile(fileHandle, directoryHandle, currentName, title, extension) {
  const cleanExt = getAudioExtension(extension || currentName);
  const nextName = `${safeFileName(title)}${cleanExt}`;
  if (nextName === currentName) return { fileHandle, name: currentName };
  if (!directoryHandle?.getFileHandle || !directoryHandle?.removeEntry) {
    throw new Error('No se puede renombrar el archivo en esta carpeta.');
  }

  let nextHandle;
  try {
    nextHandle = await directoryHandle.getFileHandle(nextName);
    throw new Error(`Ya existe un archivo llamado "${nextName}".`);
  } catch (error) {
    if (error.message.startsWith('Ya existe')) throw error;
    nextHandle = await directoryHandle.getFileHandle(nextName, { create: true });
  }
  const source = await fileHandle.getFile();
  const writable = await nextHandle.createWritable();
  try {
    await writable.write(source);
  } finally {
    await writable.close();
  }
  await directoryHandle.removeEntry(currentName);
  return { fileHandle: nextHandle, name: nextName };
}

async function coverToBytes(cover) {
  const response = await fetch(cover);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la portada (HTTP ${response.status}).`);
  }

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || 'image/jpeg'
  };
}

function firstTagValue(tags, field) {
  const value = tags?.[field];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function tagValues(tags, field) {
  const value = tags?.[field];
  return (Array.isArray(value) ? value : [value])
    .filter(value => value !== undefined && value !== null && value !== '')
    .map(normalizedTagValue);
}

function normalizedTagValue(value) {
  return String(value ?? '').trim();
}

function tagMismatch(actual, expected) {
  if (expected.value === undefined || expected.value === null || expected.value === '') {
    return null;
  }

  const actualValue = Array.isArray(expected.value)
    ? tagValues(actual, expected.field)
    : normalizedTagValue(firstTagValue(actual, expected.field));
  const expectedValue = Array.isArray(expected.value)
    ? expected.value.map(normalizedTagValue)
    : normalizedTagValue(expected.value);
  const matches = Array.isArray(expectedValue)
    ? JSON.stringify(actualValue) === JSON.stringify(expectedValue)
    : actualValue === expectedValue;
  return matches
    ? null
    : { field: expected.field, expected: expectedValue, actual: actualValue };
}

async function verifyContents(contents, expected, hasCover) {
  const savedTags = await readTags(contents);
  const savedPictures = await readPictures(contents);
  const requiredChecks = [
    { field: 'title', value: expected.title },
    { field: 'artist', value: expected.artist },
    { field: 'album', value: expected.album }
  ];
  const optionalChecks = [
    { field: 'albumArtist', value: expected.albumArtist },
    { field: 'genre', value: expected.genre },
    { field: 'year', value: expected.year },
    { field: 'trackNumber', value: expected.trackNumber },
    { field: 'discNumber', value: expected.discNumber },
    { field: 'totalDiscs', value: expected.totalDiscs },
    { field: 'acoustidId', value: expected.acoustidId },
    { field: 'musicbrainzTrackId', value: expected.musicbrainzTrackId }
  ];
  const requiredMismatches = requiredChecks
    .map(check => tagMismatch(savedTags, check))
    .filter(Boolean);
  const optionalMismatches = optionalChecks
    .map(check => tagMismatch(savedTags, check))
    .filter(Boolean);

  if (optionalMismatches.length) {
    console.warn('[Calliope] Diferencias no críticas en tags:', optionalMismatches);
  }
  if (requiredMismatches.length) {
    console.warn('[Calliope] Diferencias críticas detectadas en tags:', requiredMismatches);
    throw new Error('Los tags escritos no coinciden con los valores solicitados.');
  }
  if (hasCover !== (Array.isArray(savedPictures) && savedPictures.length > 0)) {
    throw new Error('La portada no se pudo verificar después de escribirla.');
  }

  return { savedTags, savedPictures };
}

const SUPPORTED_FORMATS = new Set([
  'MP3',
  'MP4',
  'FLAC',
  'OGG',
  'OPUS',
  'WAV',
  'OggFLAC',
  'SPEEX'
]);

export async function writeAudioMetadata(fileHandle, metadata) {
  if (!fileHandle || typeof fileHandle.createWritable !== 'function') {
    throw new Error('Este archivo no tiene permiso de escritura. Vuelve a seleccionar la carpeta.');
  }

  if (typeof fileHandle.requestPermission === 'function') {
    const permission = await fileHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      throw new Error('No se concedió permiso para escribir en el archivo.');
    }
  }


  const originalFile = await fileHandle.getFile();
  const detectedFormat = await readFormat(originalFile);
  const isMisnamedMp4 = detectedFormat === 'MP4' && /\.mp3$/i.test(originalFile.name);
  const targetHandle = isMisnamedMp4
    ? await remuxMp4ToM4a(fileHandle, metadata.directoryHandle)
    : fileHandle;
  const sourceFile = await targetHandle.getFile();
  if (!detectedFormat || !SUPPORTED_FORMATS.has(detectedFormat)) {
    throw new Error('No se pudo detectar un formato de audio compatible.');
  }

  const tags = {
    title: metadata.title || '',
    artist: artistsAsTagValue(metadata.artist),
    albumArtist: artistsAsTagValue(metadata.albumArtist),
    album: metadata.album || '',
    genre: metadata.genre || [],
    year: numberOrUndefined(metadata.year),
    trackNumber: metadata.track
      ? `${metadata.track}${metadata.trackTotal ? `/${metadata.trackTotal}` : ''}`
      : undefined,
    discNumber: numberOrUndefined(metadata.disk),
    totalDiscs: numberOrUndefined(metadata.diskTotal),
    acoustidId: metadata.acoustid || undefined,
    musicbrainzTrackId: metadata.musicBrainzRecordingId || undefined
  };
  const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer());

  let cover = null;
  if (metadata.cover) {
    cover = await coverToBytes(metadata.cover);
  }

  const applyRequestedTags = async source => {
    let contents = await applyTags(source, tags);
    contents = cover
      ? await applyCoverArt(contents, cover.data, cover.mimeType)
      : await clearPictures(contents);
    return contents;
  };

  let contents;
  try {
    contents = await applyRequestedTags(sourceBytes);
    await verifyContents(contents, tags, Boolean(cover));
  } catch (error) {
    console.warn('[Calliope] Tags incompatibles; recreando tags desde cero:', error);
    const cleanFile = await clearTags(sourceBytes);
    contents = await applyRequestedTags(cleanFile);
    await verifyContents(contents, tags, Boolean(cover));
  }

  const writable = await targetHandle.createWritable();
  try {
    await writable.write(contents);
  } finally {
    await writable.close();
  }

  const updatedFile = await targetHandle.getFile();
  const savedTags = await readTags(updatedFile);
  const savedPictures = await readPictures(updatedFile);

  console.groupCollapsed(`[Calliope] Tags escritos: ${updatedFile.name}`);
  console.log({
    detectedFormat,
    sizeBefore: sourceFile.size,
    sizeAfter: updatedFile.size,
    lastModified: new Date(updatedFile.lastModified).toISOString(),
    title: savedTags.title || [],
    artist: savedTags.artist || [],
    albumArtist: savedTags.albumArtist || [],
    album: savedTags.album || [],
    genre: savedTags.genre || [],
    year: savedTags.year,
    track: savedTags.track,
    trackNumber: savedTags.trackNumber,
    discNumber: savedTags.discNumber,
    totalTracks: savedTags.totalTracks,
    totalDiscs: savedTags.totalDiscs,
    acoustidId: savedTags.acoustidId || [],
    musicbrainzTrackId: savedTags.musicbrainzTrackId || [],
    pictures: savedPictures.length
  });
  console.groupEnd();

  let finalHandle = targetHandle;
  let finalName = updatedFile.name;
  if (isMisnamedMp4) {
    if (!metadata.directoryHandle?.removeEntry) {
      throw new Error('No se pudo reemplazar el archivo MP4 con su nombre M4A.');
    }
    await metadata.directoryHandle.removeEntry(originalFile.name);
  }

  const extension = getAudioExtension(originalFile.name, isMisnamedMp4);
  const renamed = await renameFile(
    targetHandle,
    metadata.directoryHandle,
    updatedFile.name,
    tags.title,
    extension
  );
  finalHandle = renamed.fileHandle;
  finalName = renamed.name;
  const finalFile = await finalHandle.getFile();
  Object.defineProperties(finalFile, {
    fileHandle: { value: finalHandle },
    previousName: { value: originalFile.name }
  });

  console.log(`[Calliope] Archivo renombrado: ${originalFile.name} -> ${finalName}`);
  return finalFile;
}