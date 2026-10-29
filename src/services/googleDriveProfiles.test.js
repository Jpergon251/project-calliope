import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleDriveApi,
  getDriveProfileArchiveName,
  GOOGLE_DRIVE_PROFILE_SCOPE,
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
    selectDriveProfileArchiveFile([legacy], null, "profile-folder", ["jose_profile_data.json", "profile_data.json"]),
    legacy,
  );
  assert.throws(
    () => selectDriveProfileArchiveFile([
      legacy,
      { ...legacy, id: "new-id", name: "jose_profile_data.json" },
    ], null, "profile-folder", ["jose_profile_data.json", "profile_data.json"]),
    /varios archivos candidatos/,
  );
});

test("a registered file can be renamed in place only within its profile folder", () => {
  const oldUserFile = {
    id: "registered-file",
    name: "old_user_profile_data.json",
    mimeType: "application/json",
    parents: ["profile-folder"],
  };
  assert.equal(
    selectDriveProfileArchiveFile([], oldUserFile, "profile-folder", ["old_user_profile_data.json", "new_user_profile_data.json", "profile_data.json"]),
    oldUserFile,
  );
  assert.throws(
    () => selectDriveProfileArchiveFile([], { ...oldUserFile, parents: ["other-folder"] }, "profile-folder", ["old_user_profile_data.json"]),
    /movido o cambió de nombre/,
  );
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
