import test from "node:test";
import assert from "node:assert/strict";

import {
  findUsernameOwner,
  inspectProfileIdentity,
  normalizeUsername,
  validateUsername,
} from "./profileIdentity.js";

test("username normalization accepts an optional @ and folds case and surrounding spaces", () => {
  assert.equal(normalizeUsername("  @JosePerz.00  "), "joseperz.00");
  assert.equal(normalizeUsername("Music_user-2"), "music_user-2");
});

test("username validation rejects blank, internal spaces, invalid characters, and invalid boundaries", () => {
  for (const username of ["", "  ", "jose perz", "a@bcd", ".jose", "jose-", "ab", "name!"]) {
    assert.equal(validateUsername(username).valid, false, username);
  }
  assert.equal(validateUsername("jose.00").valid, true);
});

test("username ownership ignores case and @ and can exclude the same profile when editing", () => {
  const profiles = [
    { id: "p1", username: "@JosePerz.00" },
    { id: "p2", username: "other_user" },
  ];
  assert.equal(findUsernameOwner(" joseperz.00 ", profiles)?.id, "p1");
  assert.equal(findUsernameOwner("@JOSEPERZ.00", profiles, "p1"), null);
});

test("profile import identity distinguishes independent ID and username conflicts", () => {
  const profiles = [
    { id: "id-1", username: "one_user" },
    { id: "id-2", username: "two_user" },
  ];
  assert.equal(inspectProfileIdentity({ id: "id-3", username: "three_user" }, profiles).type, "new");
  assert.equal(inspectProfileIdentity({ id: "id-1", username: "one_user" }, profiles).type, "id-match");
  assert.equal(inspectProfileIdentity({ id: "id-3", username: "@TWO_USER" }, profiles).type, "username-match");
  const split = inspectProfileIdentity({ id: "id-1", username: "two_user" }, profiles);
  assert.equal(split.type, "split-identity");
  assert.equal(split.idOwner.id, "id-1");
  assert.equal(split.usernameOwner.id, "id-2");
});

test("duplicate visible names are allowed and legacy archives without usernames remain resolvable", () => {
  const profiles = [
    { id: "id-1", name: "Jose", displayName: "Jose", username: "jose_one" },
    { id: "id-2", name: "Jose", displayName: "Jose", username: "jose_two" },
  ];

  assert.equal(
    inspectProfileIdentity({ id: "id-3", name: "Jose", username: "jose_three" }, profiles).type,
    "new",
  );
  assert.equal(inspectProfileIdentity({ id: "id-1", name: "Jose" }, profiles).type, "id-match");
  assert.equal(inspectProfileIdentity({ id: "id-3", name: "Jose" }, profiles).type, "username-required");
});
