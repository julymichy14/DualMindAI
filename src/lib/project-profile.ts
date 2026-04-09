import type { RepoContext } from "./github-repo";
import type { UploadedFile } from "@/components/FileUploadStep";

export interface ProjectProfile {
  projectName: string;
  projectLabel: string;
  projectType: string;
  projectDescription: string;
  repoLabel: string | null;
  hasRepo: boolean;
  hasCode: boolean;
  hasSpecs: boolean;
}

const DEFAULT_PROJECT_NAME = "Uploaded Project";

function prettifySlug(value: string): string {
  return value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractReadmeTitle(files: UploadedFile[]): string | null {
  const readme = files.find((file) => /readme/i.test(file.name));
  if (!readme) return null;

  const headingMatch = readme.content.match(/^#\s+(.+)$/m);
  return headingMatch?.[1]?.trim() || null;
}

function extractPackageMetadata(files: UploadedFile[]): { name?: string; description?: string } | null {
  const packageFile = files.find((file) => file.name.endsWith("package.json"));
  if (!packageFile) return null;
  return safeJsonParse<{ name?: string; description?: string }>(packageFile.content);
}

function inferProjectType(files: UploadedFile[]): string {
  const names = files.map((file) => file.name.toLowerCase());

  if (names.some((name) => name.endsWith(".tsx") || name.endsWith(".jsx") || name.includes("vite.config"))) {
    return "web application";
  }

  if (names.some((name) => name.includes("api") || name.includes("server") || name.endsWith(".go"))) {
    return "platform";
  }

  return "application";
}

function inferProjectDescription(files: UploadedFile[], projectType: string): string {
  const readme = files.find((file) => /readme/i.test(file.name));
  if (readme) {
    const paragraph = readme.content
      .split("\n\n")
      .map((block) => block.replace(/^#+\s+/gm, "").trim())
      .find((block) => block.length > 30);

    if (paragraph) {
      return paragraph;
    }
  }

  const combined = files
    .slice(0, 8)
    .map((file) => file.content.slice(0, 500))
    .join("\n")
    .toLowerCase();

  if (combined.includes("hair salon")) {
    return "This appears to be a hair salon services application with appointment or service-management workflows.";
  }
  if (combined.includes("booking")) {
    return "This appears to be a booking-oriented product with customer-facing and operational workflows.";
  }
  if (combined.includes("inventory")) {
    return "This appears to be an inventory-focused product with operational and data-management workflows.";
  }

  return `This appears to be a ${projectType} loaded from the uploaded repository and supporting materials.`;
}

export function inferProjectProfile(files: UploadedFile[], repoContext: RepoContext | null): ProjectProfile {
  const packageMeta = extractPackageMetadata(files);
  const readmeTitle = extractReadmeTitle(files);

  const rawName = readmeTitle
    || packageMeta?.name
    || repoContext?.repo
    || DEFAULT_PROJECT_NAME;

  const projectName = prettifySlug(rawName);
  const projectType = inferProjectType(files);

  return {
    projectName,
    projectLabel: projectName,
    projectType,
    projectDescription: packageMeta?.description || inferProjectDescription(files, projectType),
    repoLabel: repoContext ? `${repoContext.owner}/${repoContext.repo}` : null,
    hasRepo: !!repoContext,
    hasCode: files.some((file) => file.type === "code"),
    hasSpecs: files.some((file) => file.type === "spec"),
  };
}
