import { replaceTextMulti, type MultiEditFile } from "./filesystem.js";
import type { ProjectContext } from "./profile.js";

export function parseUnifiedPatch(patch: string, expectedSha256: Record<string, string>): MultiEditFile[] {
  if (typeof patch !== "string" || Buffer.byteLength(patch) > 4 * 1024 * 1024) throw new Error("Patch exceeds 4 MiB.");
  const lines = patch.split("\n");
  const files: MultiEditFile[] = [];
  let index = 0;
  const headerPath = (line: string) => {
    const path = line.slice(4).split("\t", 1)[0]!.replace(/\r$/u, "");
    if (!path || path.startsWith('"')) throw new Error("Unsupported patch path.");
    return path === "/dev/null" ? path : path.replace(/^[ab]\//u, "");
  };
  while (index < lines.length) {
    if (lines[index] === "" && index === lines.length - 1) break;
    if (/^(?:diff --git |index )/u.test(lines[index]!)) { index++; continue; }
    if (!lines[index]?.startsWith("--- ") || !lines[index + 1]?.startsWith("+++ ")) throw new Error("Expected unified diff file headers; binary and rename patches are unsupported.");
    const oldPath = headerPath(lines[index++]!), path = headerPath(lines[index++]!);
    if (path === "/dev/null" || (oldPath !== "/dev/null" && oldPath !== path)) throw new Error("Deletion and rename patches are unsupported.");
    if (!Object.hasOwn(expectedSha256, path)) throw new Error("Every patch path requires an explicit expectedSha256.");
    const expected = expectedSha256[path]!;
    if ((oldPath === "/dev/null") !== (expected === "absent")) throw new Error("New-file patch requires absent and existing files require a hash.");
    const edits = [];
    let content = "";
    while (lines[index]?.startsWith("@@ ")) {
      const header = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/u.exec(lines[index++]!);
      if (!header) throw new Error("Invalid unified hunk header.");
      const oldParts: string[] = [], newParts: string[] = [];
      let oldCount = 0, newCount = 0, previous = "";
      while (index < lines.length && (oldCount < Number(header[1] ?? 1) || newCount < Number(header[2] ?? 1)
        || lines[index] === "\\ No newline at end of file")) {
        const line = lines[index]!;
        if (!line && index === lines.length - 1) { index++; break; }
        if (line === "\\ No newline at end of file") {
          if (!previous) throw new Error("Unexpected no-newline marker.");
          if (previous !== "+") oldParts[oldParts.length - 1] = oldParts.at(-1)!.slice(0, -1);
          if (previous !== "-") newParts[newParts.length - 1] = newParts.at(-1)!.slice(0, -1);
          previous = ""; index++; continue;
        }
        previous = line[0]!;
        if (![" ", "+", "-"].includes(previous)) throw new Error("Unsupported hunk record.");
        if (previous !== "+") { oldParts.push(line.slice(1) + "\n"); oldCount++; }
        if (previous !== "-") { newParts.push(line.slice(1) + "\n"); newCount++; }
        index++;
        if (oldCount > Number(header[1] ?? 1) || newCount > Number(header[2] ?? 1)) throw new Error("Hunk line counts do not match.");
      }
      if (oldCount !== Number(header[1] ?? 1) || newCount !== Number(header[2] ?? 1)) throw new Error("Hunk line counts do not match.");
      if (oldPath === "/dev/null") {
        if (oldCount) throw new Error("New-file hunks cannot remove text.");
        content += newParts.join("");
      } else {
        const oldText = oldParts.join("");
        if (!oldText) throw new Error("Insertion hunks need unique existing context.");
        edits.push({ oldText, newText: newParts.join(""), expectedCount: 1 });
      }
    }
    if (oldPath !== "/dev/null" && !edits.length) throw new Error("Patch has no hunks.");
    files.push(oldPath === "/dev/null" ? { path, expectedSha256: expected, content } : { path, expectedSha256: expected, edits });
  }
  if (!files.length || files.length > 10 || Object.keys(expectedSha256).length !== files.length) throw new Error("Patch paths and expected hashes must match exactly (1 to 10 files).");
  return files;
}

export async function applyUnifiedPatch(input: { context: ProjectContext; patch: string; expectedSha256: Record<string, string> }) {
  return replaceTextMulti({ context: input.context, files: parseUnifiedPatch(input.patch, input.expectedSha256) });
}
