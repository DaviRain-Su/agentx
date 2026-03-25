export function sanitizePath(path: string): string {
  const normalized = String(path ?? "").trim().replace(/\\/g, "/");
  if (!normalized || normalized === "." || normalized === "/") return "";
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error(`Invalid path: ${path}`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}
