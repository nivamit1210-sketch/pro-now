import { describe, expect, it } from "vitest";

import { resolveWebDistRoot } from "../src/plugins/web-app.js";

describe("web app distribution root", () => {
  it("resolves the frontend beside the API package from the compiled API directory", () => {
    expect(resolveWebDistRoot(undefined, "/repo/apps/api/dist")).toBe("/repo/apps/web/dist");
  });

  it("reads a relative WEB_DIST_DIR from the repository root, not the working directory", () => {
    // render.yaml sets apps/web/dist while the API starts with apps/api as its working directory.
    expect(resolveWebDistRoot("apps/web/dist", "/repo/apps/api/dist")).toBe("/repo/apps/web/dist");
  });

  it("keeps an absolute WEB_DIST_DIR as given", () => {
    expect(resolveWebDistRoot("/srv/web", "/repo/apps/api/dist")).toBe("/srv/web");
  });
});
