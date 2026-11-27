import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Write UTF-8 content atomically via a sibling temp file and rename. */
export function writeFileAtomic(targetPath, content) {
  mkdirSync(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, targetPath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* Temp file may not exist if writeFileSync failed early. */
    }
    throw error;
  }
}
