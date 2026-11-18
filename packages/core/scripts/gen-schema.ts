import { writeFileSync, mkdirSync } from "node:fs";
import { flowJsonSchema } from "../src/schema.ts";

const out = new URL("../../../schema/flow-2.1.json", import.meta.url);
mkdirSync(new URL(".", out), { recursive: true });
writeFileSync(out, JSON.stringify(flowJsonSchema(), null, 2) + "\n");
