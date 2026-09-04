import { describe, expect, test } from "bun:test";

import { resolveRelease } from "./resolve-data-release.js";

const files = {
  "api.json": { sha256: "api", size: 1 },
  "models.json": { sha256: "models", size: 1 },
  "catalog.json": { sha256: "catalog", size: 1 },
  "schema.json": { sha256: "schema", size: 1 },
};

describe("automatic data release version", () => {
  test("uses the release floor for a breaking data migration", () => {
    expect(
      resolveRelease(
        { version: "0.1.5", files },
        {
          version: "0.0.0",
          files: { ...files, "api.json": { sha256: "renamed", size: 2 } },
        },
        "0.2.0",
      ),
    ).toEqual({ changed: true, latest: "0.1.5", version: "0.2.0" });
  });

  test("returns to patch releases after reaching the floor", () => {
    expect(
      resolveRelease(
        { version: "0.2.0", files },
        {
          version: "0.0.0",
          files: { ...files, "api.json": { sha256: "updated", size: 2 } },
        },
        "0.2.0",
      ),
    ).toEqual({ changed: true, latest: "0.2.0", version: "0.2.1" });
  });

  test("does not publish unchanged data at the current floor", () => {
    expect(
      resolveRelease(
        { version: "0.2.0", files },
        { version: "0.0.0", files: { ...files } },
        "0.2.0",
      ),
    ).toEqual({ changed: false, latest: "0.2.0", version: "0.2.0" });
  });

  test("publishes an explicitly raised floor", () => {
    expect(
      resolveRelease(
        { version: "0.1.5", files },
        { version: "0.0.0", files: { ...files } },
        "0.2.0",
      ),
    ).toEqual({ changed: true, latest: "0.1.5", version: "0.2.0" });
  });
});
