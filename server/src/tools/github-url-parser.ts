export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  type: "repo" | "pull" | "issue";
  number?: number;
}

const UNSUPPORTED_PATHS = [
  "commit",
  "commits",
  "blob",
  "tree",
  "compare",
  "releases",
  "discussions",
];

export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  let path: string;

  if (input.includes("github.com")) {
    try {
      const url = new URL(input.startsWith("http") ? input : `https://${input}`);
      path = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    } catch {
      return null;
    }
  } else if (/^[\w.-]+\/[\w.-]+/.test(input)) {
    path = input.trim().replace(/\/$/, "");
  } else {
    return null;
  }

  const parts = path.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;

  const owner = parts[0];
  const repo = parts[1];

  if (parts.length === 2) {
    return { owner, repo, type: "repo" };
  }

  const subPath = parts[2];

  if (subPath === "pull" && parts[3]) {
    const num = Number(parts[3]);
    if (Number.isInteger(num)) {
      return { owner, repo, type: "pull", number: num };
    }
  }

  if (subPath === "issues" && parts[3]) {
    const num = Number(parts[3]);
    if (Number.isInteger(num)) {
      return { owner, repo, type: "issue", number: num };
    }
  }

  if (UNSUPPORTED_PATHS.includes(subPath ?? "")) {
    return null;
  }

  return null;
}
