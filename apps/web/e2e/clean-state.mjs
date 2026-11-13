// Empties the folder the test sync server keeps its boards in. Every test
// uses a board of its own, so without this the folder only ever grows.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const folder = fileURLToPath(
  new URL("../../sync/.wrangler/e2e", import.meta.url),
);
rmSync(folder, { recursive: true, force: true });
