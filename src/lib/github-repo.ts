export interface RepoContext {
  source: "github";
  url: string;
  owner: string;
  repo: string;
  branch: string;
  loadedFiles: number;
  discoveredFiles: number;
}

export interface ExtractedRepositoryFile {
  name: string;
  content: string;
  type: "code";
}

interface GitHubRepoRef {
  owner: string;
  repo: string;
}

interface GitHubRepoApiResponse {
  default_branch: string;
  private: boolean;
}

interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
}

interface GitHubBlobResponse {
  content?: string;
  encoding?: string;
}

const TEXT_FILE_EXTENSIONS = new Set([
  "c",
  "cpp",
  "cs",
  "css",
  "csv",
  "env",
  "go",
  "graphql",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "md",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

const SKIPPED_PATH_PARTS = [
  ".git/",
  ".github/",
  "dist/",
  "build/",
  "coverage/",
  "node_modules/",
  "vendor/",
  ".next/",
  ".nuxt/",
  "storybook-static/",
];

const PRIORITY_PREFIXES = [
  "src/",
  "app/",
  "components/",
  "pages/",
  "lib/",
  "server/",
  "api/",
  "supabase/",
];

const PRIORITY_FILES = [
  "package.json",
  "README.md",
  "tsconfig.json",
  "vite.config.ts",
  "tailwind.config.ts",
  "next.config.js",
  "nuxt.config.ts",
];

const MAX_FILE_BYTES = 150_000;
const MAX_FILE_COUNT = 36;
const MAX_FILE_CHARS = 12_000;

export function parseGitHubRepositoryUrl(input: string): GitHubRepoRef {
  const cleaned = input.trim().replace(/\.git$/, "");

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new Error("Please enter a valid GitHub repository URL.");
  }

  if (url.hostname !== "github.com") {
    throw new Error("Only public GitHub repository URLs are supported.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("The GitHub URL must look like https://github.com/owner/repository.");
  }

  return {
    owner: parts[0],
    repo: parts[1],
  };
}

function isLikelyTextFile(path: string): boolean {
  const lowerPath = path.toLowerCase();

  if (SKIPPED_PATH_PARTS.some((part) => lowerPath.includes(part))) {
    return false;
  }

  const fileName = lowerPath.split("/").pop() || "";
  if (fileName.startsWith(".")) {
    return fileName === ".env" || fileName === ".env.example";
  }

  if (!fileName.includes(".")) {
    return false;
  }

  const extension = fileName.split(".").pop() || "";
  return TEXT_FILE_EXTENSIONS.has(extension);
}

function priorityScore(path: string): number {
  if (PRIORITY_FILES.some((file) => path.endsWith(file))) {
    return -20;
  }

  const prefixIndex = PRIORITY_PREFIXES.findIndex((prefix) => path.startsWith(prefix));
  if (prefixIndex !== -1) {
    return prefixIndex - 10;
  }

  return 100;
}

function decodeGitHubBlob(content: string): string {
  const normalized = content.replace(/\n/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function truncateContent(text: string): string {
  if (text.length <= MAX_FILE_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_FILE_CHARS)}\n\n/* File truncated for analysis */`;
}

export async function fetchGitHubRepositoryFiles(repoUrl: string): Promise<{
  repoContext: RepoContext;
  files: ExtractedRepositoryFile[];
}> {
  const repoRef = parseGitHubRepositoryUrl(repoUrl);

  const repoResponse = await fetch(`https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}`);
  if (!repoResponse.ok) {
    throw new Error("Could not access that GitHub repository. Make sure the URL is public and correct.");
  }

  const repoMeta = (await repoResponse.json()) as GitHubRepoApiResponse;
  if (repoMeta.private) {
    throw new Error("Private repositories are not supported in Business Analyst mode.");
  }

  const treeResponse = await fetch(
    `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/git/trees/${repoMeta.default_branch}?recursive=1`,
  );
  if (!treeResponse.ok) {
    throw new Error("Could not read the repository tree from GitHub.");
  }

  const treeData = (await treeResponse.json()) as GitHubTreeResponse;

  const candidateFiles = treeData.tree
    .filter((entry) => entry.type === "blob")
    .filter((entry) => !!entry.path && isLikelyTextFile(entry.path))
    .filter((entry) => (entry.size || 0) <= MAX_FILE_BYTES)
    .sort((a, b) => {
      const priorityDelta = priorityScore(a.path) - priorityScore(b.path);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return a.path.localeCompare(b.path);
    });

  const selectedFiles = candidateFiles.slice(0, MAX_FILE_COUNT);

  const extractedFiles = await Promise.all(
    selectedFiles.map(async (entry) => {
      const blobResponse = await fetch(entry.url);
      if (!blobResponse.ok) {
        return null;
      }

      const blobData = (await blobResponse.json()) as GitHubBlobResponse;
      if (blobData.encoding !== "base64" || !blobData.content) {
        return null;
      }

      const decoded = decodeGitHubBlob(blobData.content);
      if (!decoded.trim() || decoded.includes("\u0000")) {
        return null;
      }

      return {
        name: entry.path,
        content: truncateContent(decoded),
        type: "code" as const,
      };
    }),
  );

  const files = extractedFiles.filter((file): file is ExtractedRepositoryFile => file !== null);

  if (files.length === 0) {
    throw new Error("No readable text source files were found in that GitHub repository.");
  }

  return {
    repoContext: {
      source: "github",
      url: `https://github.com/${repoRef.owner}/${repoRef.repo}`,
      owner: repoRef.owner,
      repo: repoRef.repo,
      branch: repoMeta.default_branch,
      loadedFiles: files.length,
      discoveredFiles: candidateFiles.length,
    },
    files,
  };
}
