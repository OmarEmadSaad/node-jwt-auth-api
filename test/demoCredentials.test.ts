import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { demoUsers, DEMO_PASSWORD } from "../scripts/data/demoUsers.ts";

const doc = fs.readFileSync(new URL("../docs/DEMO_CREDENTIALS.md", import.meta.url), "utf8");

it("docs/DEMO_CREDENTIALS.md matches the seed data", () => {
  assert.ok(doc.includes(`\`${DEMO_PASSWORD}\``), "the documented password is the seeded one");

  // Rows look like: | 1 | Sarah Mitchell | sarah.mitchell@example.com | manager | +20... |
  const rows = [...doc.matchAll(/^\| \d+ \| (.+?) \| (\S+@\S+) \| (\w+) \| (\S+) \|$/gm)].map(
    ([, name, email, role, phoneNumber]) => ({ name, email, role, phoneNumber }),
  );
  assert.deepEqual(
    rows,
    demoUsers.map(({ firstName, lastName, email, role, phoneNumber }) => ({
      name: `${firstName} ${lastName}`,
      email,
      role,
      phoneNumber,
    })),
  );
});

it("every demo account uses a reserved example.com email", () => {
  for (const user of demoUsers) {
    assert.match(user.email, /@example\.com$/);
  }
});
