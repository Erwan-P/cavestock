import { readFile } from "node:fs/promises";
import { parseImportFile } from "../src/lib/import-file.ts";

const [path, name] = process.argv.slice(2);
if (!path || !name) {
  process.stderr.write("Usage: node scripts/parse-import.mjs <path> <original-name>\n");
  process.exit(2);
}
try {
  const bytes = await readFile(path);
  const analysis = await parseImportFile(new File([bytes], name));
  process.stdout.write(JSON.stringify(analysis));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
