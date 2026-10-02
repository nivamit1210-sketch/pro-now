// Copies MediaPipe's browser runtime (the face landmarker's wasm) next to the model in public/face/,
// from the installed @mediapipe/tasks-vision — so the 11 MB binary is not kept in git. See src/identity/faceSense.ts.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const wasmDir = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
const out = new URL("../public/face/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) copyFileSync(join(wasmDir, f), join(out, f));
console.log("face runtime copied to public/face/");
