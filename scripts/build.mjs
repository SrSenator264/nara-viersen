import { access } from "node:fs/promises";

await access(new URL("../dist/server/index.js", import.meta.url));
await access(new URL("../dist/client/index.html", import.meta.url));
