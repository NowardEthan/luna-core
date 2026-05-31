import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raizPacote = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(raizPacote, ".env") });
