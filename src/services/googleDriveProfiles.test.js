import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleDriveApi,
  classifyDriveProfileVersions,
  findProfileArchiveFile,
  getDriveProfileArchiveName,
  GOOGLE_DRIVE_PROFILE_SCOPE,
  normalizeDriveArchiveForHash,
  selectDriveProfileArchiveFile,
  validateDriveProfileArchiveIdentity,
} from "./googleDriveProfiles.js";
import { buildProfileArchive } from "./profileArchives.js";

const jsonResponse = (value, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => value,
});

async function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("Google Drive uses the file-only scope plus account identity for profile separation", () => {
  assert.equal(
    GOOGLE_DRIVE_PROFILE_SCOPE,
    "https://www.googleapis.com/auth/drive.file openid email",
  );
  assert.equal(GOOGLE_DRIVE_PROFILE_SCOPE.includes("drive"), true);
  assert.equal(GOOGLE_DRIVE_PROFILE_SCOPE.includes("drive.readonly"), false);
});

test("Drive archive identity must match both the stable profile ID and username", () => {
  const archive = buildProfileArchive({
    profile: {
      id: "profile-1",
      name: "Jose",
      username: "jose",
      createdAt: 1,
      updatedAt: 2,
      preferences: {},
    },
    playlists: [],
    history: [],
    stats: { summary: null, events: [] },
    ratings: [],
    queue: null,
  });
  assert.equal(validateDriveProfileArchiveIdentity(archive, {
    id: "profile-1",
    username: "jose",
  }).profile.id, "profile-1");
  assert.throws(() => validateDriveProfileArchiveIdentity(archive, {
    id: "profile-2",
    username: "jose",
  }), /ID interno/);
  assert.throws(() => validateDriveProfileArchiveIdentity(archive, {
    id: "profile-1",
    username: "other",
  }), /nombre de usuario/);
});

test("Drive version comparison identifies unchanged, one-sided and concurrent changes", () => {
  assert.equal(classifyDriveProfileVersions({
    localHash: "base",
    remoteHash: "base",
    baseHash: "base",
  }), "same");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local-new",
    remoteHash: "base",
    baseHash: "base",
  }), "upload-local");
  assert.equal(classifyDriveProfileVersions({
    localHash: "base",
    remoteHash: "remote-new",
    baseHash: "base",
  }), "download-remote");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local-new",
    remoteHash: "remote-new",
    baseHash: "base",
  }), "conflict");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local",
    remoteHash: "remote",
    baseHash: "",
  }), "conflict");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local",
    remoteHash: "",
    baseHash: "base",
  }), "remote-missing");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local-imported",
    remoteHash: "drive",
    baseLocalHash: "local-imported",
    baseRemoteHash: "drive",
  }), "same");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local-new",
    remoteHash: "drive",
    baseLocalHash: "local-imported",
    baseRemoteHash: "drive",
  }), "upload-local");
  assert.equal(classifyDriveProfileVersions({
    localHash: "local-imported",
    remoteHash: "drive-new",
    baseLocalHash: "local-imported",
    baseRemoteHash: "drive",
  }), "download-remote");
});

test("concurrent changes are always classified as a conflict, independent of timestamps", () => {
  const baseline = { baseLocalHash: "base-local", baseRemoteHash: "base-drive" };
  assert.equal(classifyDriveProfileVersions({
    ...baseline,
    localHash: "local-new",
    remoteHash: "drive-new",
    localChangedAt: 9999999999999,
    remoteModifiedTime: "2000-01-01T00:00:00.000Z",
  }), "conflict");
  assert.equal(classifyDriveProfileVersions({
    ...baseline,
    localHash: "local-new",
    remoteHash: "drive-new",
    localChangedAt: 0,
    remoteModifiedTime: "2999-01-01T00:00:00.000Z",
  }), "conflict");
});

test("Drive conflict hashes ignore export and save timestamps but preserve profile data", () => {
  const first = JSON.stringify({
    format: "calliope-profile",
    formatVersion: 3,
    exportedAt: "2026-01-01T00:00:00.000Z",
    profile: { id: "profile-1", updatedAt: 1, preferences: { theme: "dark" } },
    queue: { savedAt: 1, queueIds: ["song-1"] },
  });
  const second = JSON.stringify({
    format: "calliope-profile",
    formatVersion: 3,
    exportedAt: "2026-01-02T00:00:00.000Z",
    profile: { id: "profile-1", updatedAt: 2, preferences: { theme: "dark" } },
    queue: { savedAt: 2, queueIds: ["song-1"] },
  });
  assert.equal(normalizeDriveArchiveForHash(first), normalizeDriveArchiveForHash(second));
  assert.notEqual(
    normalizeDriveArchiveForHash(first),
    normalizeDriveArchiveForHash(JSON.stringify({
      format: "calliope-profile",
      formatVersion: 3,
      exportedAt: "2026-01-02T00:00:00.000Z",
      profile: { id: "profile-1", updatedAt: 2, preferences: { theme: "light" } },
      queue: { savedAt: 2, queueIds: ["song-1"] },
    })),
  );
  assert.notEqual(
    normalizeDriveArchiveForHash(first),
    normalizeDriveArchiveForHash(JSON.stringify({
      format: "calliope-profile",
      formatVersion: 3,
      exportedAt: "2026-01-02T00:00:00.000Z",
      profile: { id: "profile-1", updatedAt: 2, preferences: { theme: "dark" } },
      queue: { savedAt: 2, queueIds: ["song-2"] },
    })),
  );
});

test("Drive archive filename uses the normalized unique username", () => {
  assert.equal(getDriveProfileArchiveName({ username: "@JosePerz.00" }), "joseperz.00_profile_data.json");
  assert.throws(() => getDriveProfileArchiveName({ username: "invalid username" }), /nombre de usuario válido/);
});

test("archive selection reuses a single legacy file and rejects ambiguous candidates", () => {
  const legacy = {
    id: "legacy-id",
    name: "profile_data.json",
    mimeType: "application/json",
    parents: ["profile-folder"],
  };
  assert.equal(
    selectDriveProfileArchiveFile([legacy]),
    legacy,
  );
  assert.throws(
    () => selectDriveProfileArchiveFile([
      legacy,
      { ...legacy, id: "new-id", name: "jose_profile_data.json" },
    ]),
    /varios archivos candidatos/,
  );
});

test("missing or trashed linked JSON is ignored and a new file can be created without querying its ID", async () => {
  let getFileCalled = false;
  const api = {
    findChildren: async () => [],
    getFile: async () => {
      getFileCalled = true;
      throw new Error("Should not query the linked file");
    },
  };
  const file = await findProfileArchiveFile(
    api,
    "profile-folder",
    { fileId: "deleted-or-trashed-id", fileName: "old_user_profile_data.json" },
    "new_user_profile_data.json",
  );
  assert.equal(file, null);
  assert.equal(getFileCalled, false);
});

test("one active candidate is reused even when the previous stored file ID is stale", async () => {
  const existing = {
    id: "current-active-file",
    name: "new_user_profile_data.json",
    mimeType: "application/json",
    parents: ["profile-folder"],
  };
  const file = await findProfileArchiveFile(
    { findChildren: async () => [existing] },
    "profile-folder",
    { fileId: "deleted-or-trashed-id" },
    "new_user_profile_data.json",
  );
  assert.equal(file.id, existing.id);
});

test("folder lookup is scoped to the expected parent and reuses a unique folder", async () => {
  const urls = [];
  await withMockFetch(async (url) => {
    urls.push(String(url));
    return jsonResponse({
      files: [{ id: "profile-folder-1", name: "Jose", mimeType: "application/vnd.google-apps.folder", parents: ["profiles-folder"] }],
    });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    const folder = await api.findOrCreateFolder("Jose", "profiles-folder");
    assert.equal(folder.id, "profile-folder-1");
    assert.equal(urls.length, 1);
    const query = decodeURIComponent(new URL(urls[0]).searchParams.get("q"));
    assert.match(query, /'profiles-folder' in parents/);
    assert.match(query, /name = 'Jose'/);
  });
});

test("registered root folder is validated against Drive's root query, not the literal root alias in parents", async () => {
  const rootFolder = {
    id: "calliope-root-id",
    name: "Calliope",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["my-drive-id"],
  };
  await withMockFetch(async (url) => {
    if (String(url).includes("/files/calliope-root-id?")) return jsonResponse(rootFolder);
    return jsonResponse({ files: [rootFolder] });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    const folder = await api.findOrCreateFolder("Calliope", null, "calliope-root-id", true);
    assert.equal(folder.id, "calliope-root-id");
  });
});

test("duplicate sibling folders stop without creating another folder", async () => {
  let postCount = 0;
  await withMockFetch(async (url, options = {}) => {
    if (options.method === "POST") postCount += 1;
    return jsonResponse({
      files: [
        { id: "folder-a", name: "Jose", mimeType: "application/vnd.google-apps.folder", parents: ["profiles-folder"] },
        { id: "folder-b", name: "Jose", mimeType: "application/vnd.google-apps.folder", parents: ["profiles-folder"] },
      ],
    });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    await assert.rejects(api.findOrCreateFolder("Jose", "profiles-folder"), /varias carpetas/);
    assert.equal(postCount, 0);
  });
});

test("missing folder lookup during restore does not create remote folders", async () => {
  let postCount = 0;
  await withMockFetch(async (_url, options = {}) => {
    if (options.method === "POST") postCount += 1;
    return jsonResponse({ files: [] });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    await assert.rejects(
      api.findOrCreateFolder("Calliope", null, null, true, false),
      /No se encontró la carpeta/,
    );
    assert.equal(postCount, 0);
  });
});

test("first-save root creation requires an explicit confirmation if no app-visible root exists", async () => {
  let postCount = 0;
  await withMockFetch(async (_url, options = {}) => {
    if (options.method === "POST") postCount += 1;
    return jsonResponse({ files: [] });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    await assert.rejects(
      api.findOrCreateFolder("Calliope", null, null, true, false, true),
      (error) => error.code === "drive-root-create-confirmation-required",
    );
    assert.equal(postCount, 0);
  });
});

test("legacy files are renamed in place and repeated saves keep updating the same file ID", async () => {
  const calls = [];
  await withMockFetch(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ id: "profile-json-id", name: "profile_data.json", mimeType: "application/json", parents: ["profile-folder"] });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    await api.uploadFile("profile-folder", null, "{\"format\":\"calliope-profile\"}", "profile_data.json");
    await api.uploadFile("profile-folder", "profile-json-id", "{\"format\":\"calliope-profile\",\"formatVersion\":3}", "jose_profile_data.json");
    await api.uploadFile("profile-folder", "profile-json-id", "{\"format\":\"calliope-profile\",\"formatVersion\":3}", "jose_profile_data.json");

    assert.equal(calls.length, 3);
    assert.equal(calls[0].options.method, "POST");
    assert.match(calls[0].url, /\/upload\/drive\/v3\/files\?/);
    assert.match(calls[0].options.body, /"parents":\["profile-folder"\]/);
    assert.equal(calls[1].options.method, "PATCH");
    assert.match(calls[1].url, /\/files\/profile-json-id\?/);
    assert.match(calls[1].options.body, /"formatVersion":3/);
    assert.match(calls[1].options.body, /"name":"jose_profile_data\.json"/);
    assert.equal(calls[2].options.method, "PATCH");
    assert.match(calls[2].url, /\/files\/profile-json-id\?/);
    assert.equal(calls.filter(({ options }) => options.method === "POST").length, 1);
  });
});

test("expired authorization errors are explicit and never include the token", async () => {
  await withMockFetch(async () => jsonResponse({}, 401), async () => {
    const api = createGoogleDriveApi("secret-token");
    await assert.rejects(api.getFile("file-id"), (error) => {
      assert.match(error.message, /caducado o fue revocada/);
      assert.equal(error.message.includes("secret-token"), false);
      return true;
    });
  });
});

test("Drive file updates use the fetched ETag as an If-Match condition", async () => {
  let requestOptions;
  await withMockFetch(async (_url, options = {}) => {
    requestOptions = options;
    return jsonResponse({
      id: "profile-json-id",
      name: "jose_profile_data.json",
      mimeType: "application/json",
      parents: ["profile-folder"],
    });
  }, async () => {
    const api = createGoogleDriveApi("token-for-test");
    await api.uploadFile(
      "profile-folder",
      "profile-json-id",
      "{\"format\":\"calliope-profile\"}",
      "jose_profile_data.json",
      { ifMatch: "\"revision-4\"" },
    );
    assert.equal(requestOptions.headers["If-Match"], "\"revision-4\"");
  });
});

test("Drive conditional update failures are surfaced as concurrent changes", async () => {
  await withMockFetch(async () => jsonResponse({}, 412), async () => {
    const api = createGoogleDriveApi("token-for-test");
    await assert.rejects(
      api.uploadFile("profile-folder", "profile-json-id", "{}", "profile.json", { ifMatch: "etag" }),
      (error) => error.code === "drive-precondition-failed",
    );
  });
});

test("expired authorization invalidates the in-memory credential", async () => {
  let invalidated = false;
  await withMockFetch(async () => jsonResponse({}, 401), async () => {
    const api = createGoogleDriveApi("secret-token", {
      onUnauthorized: () => { invalidated = true; },
    });
    await assert.rejects(api.getFile("file-id"), /caducado o fue revocada/);
    assert.equal(invalidated, true);
  });
});

test("Drive API disabled errors explain the required Google Cloud configuration", async () => {
  await withMockFetch(async () => jsonResponse({
    error: { errors: [{ reason: "accessNotConfigured" }] },
  }, 403), async () => {
    const api = createGoogleDriveApi("secret-token");
    await assert.rejects(api.getFile("file-id"), /Drive API no está habilitada/);
  });
});

test("Drive permission errors are distinguished from quota errors without exposing credentials", async () => {
  await withMockFetch(async () => jsonResponse({
    error: { errors: [{ reason: "insufficientPermissions" }] },
  }, 403), async () => {
    const api = createGoogleDriveApi("secret-token");
    await assert.rejects(api.getFile("file-id"), (error) => {
      assert.match(error.message, /no incluye los permisos necesarios/);
      assert.equal(error.message.includes("secret-token"), false);
      return true;
    });
  });

  await withMockFetch(async () => jsonResponse({
    error: { errors: [{ reason: "dailyLimitExceeded" }] },
  }, 403), async () => {
    const api = createGoogleDriveApi("secret-token");
    await assert.rejects(api.getFile("file-id"), /cuota diaria/);
  });
});
