export function normalizeUrlPath(path: string): string {
  const hadTrailingSlash = path.endsWith("/");
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  const normalized = `/${segments.join("/")}`;
  return hadTrailingSlash && normalized !== "/" ? `${normalized}/` : normalized;
}
