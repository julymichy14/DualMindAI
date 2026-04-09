import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import dualMindLogo from "@/assets/dualmind-logo.png";
import { fetchGitHubRepositoryFiles, type RepoContext } from "@/lib/github-repo";

export interface UploadedFile {
  name: string;
  content: string;
  type: "code" | "spec";
  source?: "upload" | "repo" | "pasted";
}

const UPLOADS_STORAGE_KEY = "dualmind_uploads";
const REPO_STORAGE_KEY = "dualmind_repo_context";

// Store uploaded files in sessionStorage so they survive navigation
export function getUploadedFiles(): UploadedFile[] {
  try {
    const raw = sessionStorage.getItem(UPLOADS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function setUploadedFiles(files: UploadedFile[]) {
  sessionStorage.setItem(UPLOADS_STORAGE_KEY, JSON.stringify(files));
}

export function appendUploadedFiles(files: UploadedFile[]) {
  const existing = getUploadedFiles();
  setUploadedFiles([...existing, ...files]);
}

function mergeUploadedFiles(existing: UploadedFile[], incoming: UploadedFile[]) {
  const merged = new Map<string, UploadedFile>();

  for (const file of [...existing, ...incoming]) {
    merged.set(`${file.type}:${file.name}`, file);
  }

  return Array.from(merged.values());
}

export function getRepositoryContext(): RepoContext | null {
  try {
    const raw = sessionStorage.getItem(REPO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setRepositoryContext(context: RepoContext | null) {
  if (!context) {
    sessionStorage.removeItem(REPO_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(context));
}

export default function FileUploadStep() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const isBa = role === "ba";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const specInputRef = useRef<HTMLInputElement>(null);

  const [codeFiles, setCodeFiles] = useState<UploadedFile[]>([]);
  const [specFiles, setSpecFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState<"code" | "spec" | null>(null);
  const [reading, setReading] = useState(false);
  const [repoUrl, setRepoUrl] = useState(getRepositoryContext()?.url ?? "");
  const [repoContext, setRepoContextState] = useState<RepoContext | null>(getRepositoryContext());
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [snippetName, setSnippetName] = useState("snippet.ts");
  const [snippetContent, setSnippetContent] = useState("");
  const [snippetError, setSnippetError] = useState("");
  const [devInputMode, setDevInputMode] = useState<"files" | "repo" | "snippet">("files");

  const readFiles = async (fileList: FileList, type: "code" | "spec") => {
    setReading(true);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const content = await file.text();
        newFiles.push({ name: file.name, content, type, source: "upload" });
      } catch {
        // skip binary files
      }
    }
    if (type === "code") setCodeFiles(prev => mergeUploadedFiles(prev, newFiles));
    else setSpecFiles(prev => mergeUploadedFiles(prev, newFiles));
    setReading(false);
  };

  const loadGitHubRepository = async () => {
    if (!repoUrl.trim()) {
      setRepoError("Please paste a public GitHub repository URL first.");
      return;
    }

    setRepoLoading(true);
    setRepoError("");

    try {
      const { repoContext: loadedRepoContext, files } = await fetchGitHubRepositoryFiles(repoUrl);
      const repositoryFiles = files.map((file) => ({ ...file, source: "repo" as const }));
      setCodeFiles(prev => mergeUploadedFiles(prev.filter((file) => file.source !== "repo"), repositoryFiles));
      setRepoContextState(loadedRepoContext);
      setRepoUrl(loadedRepoContext.url);
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : "Unable to load that repository.");
    } finally {
      setRepoLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent, type: "code" | "spec") => {
    e.preventDefault();
    setDragging(null);
    if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files, type);
  };

  const removeFile = (type: "code" | "spec", index: number) => {
    if (type === "code") setCodeFiles(prev => prev.filter((_, i) => i !== index));
    else setSpecFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearRepository = () => {
    setCodeFiles(prev => prev.filter((file) => file.source !== "repo"));
    setRepoContextState(null);
    setRepoUrl("");
    setRepoError("");
  };

  const addSnippet = () => {
    if (!snippetContent.trim()) {
      setSnippetError("Paste some code before adding it.");
      return;
    }

    const normalizedName = snippetName.trim() || "snippet.ts";
    setCodeFiles((prev) => mergeUploadedFiles(prev, [{
      name: normalizedName,
      content: snippetContent.trim(),
      type: "code",
      source: "pasted",
    }]));
    setSnippetError("");
    setSnippetName(normalizedName);
    setSnippetContent("");
  };

  const canProceed = specFiles.length > 0 && codeFiles.length > 0;

  const proceed = () => {
    const allFiles = [...codeFiles, ...specFiles];
    setUploadedFiles(allFiles);
    setRepositoryContext(repoContext);
    navigate(`/dashboard/${role}`);
  };

  const DropZone = ({ type, label, description, files, inputRef: ref }: {
    type: "code" | "spec";
    label: string;
    description: string;
    files: UploadedFile[];
    inputRef: React.RefObject<HTMLInputElement>;
  }) => {
    const isActive = dragging === type;
    const color = type === "code" ? (isBa ? "ba" : "dev") : (isBa ? "ba" : "dev");
    return (
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(type); }}
          onDragLeave={() => setDragging(null)}
          onDrop={(e) => handleDrop(e, type)}
          onClick={() => ref.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
            ${isActive
              ? `border-${color}-primary bg-${color}-primary/10`
              : "border-foreground/10 hover:border-foreground/20 bg-foreground/[0.02]"
            }`}
        >
          <div className="text-3xl mb-2">{type === "code" ? "📄" : "📋"}</div>
          <div className="text-sm text-muted-foreground">
            {reading ? "Reading files..." : "Drop files here or click to browse"}
          </div>
          <div className="text-[11px] text-muted-foreground/50 mt-1">
            .py, .js, .ts, .java, .txt, .md, .json, .yaml, .csv, etc.
          </div>
          <input
            ref={ref}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) readFiles(e.target.files, type); e.target.value = ""; }}
          />
        </div>
        {files.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground/[0.04] border border-foreground/[0.06] text-xs text-foreground group">
                <span className="text-muted-foreground">{type === "code" ? "📄" : "📋"}</span>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/45">
                  {f.source === "repo" ? "repo" : f.source === "pasted" ? "pasted" : "file"}
                </span>
                <span className="text-muted-foreground/50">{(f.content.length / 1024).toFixed(1)}KB</span>
                <button onClick={(e) => { e.stopPropagation(); removeFile(type, i); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger transition-all">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-12"
      style={{
        background: "radial-gradient(ellipse at 30% 40%, hsl(217 91% 60% / 0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, hsl(270 70% 60% / 0.12) 0%, transparent 60%), linear-gradient(135deg, hsl(220 50% 4%) 0%, hsl(270 30% 5%) 100%)"
      }}>
      <div className="text-center">
        <div className="flex items-center justify-center mb-3">
          <img src={dualMindLogo} alt="DualMind AI" width={56} height={56} className="drop-shadow-lg" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-br from-ba-primary to-dev-primary bg-clip-text text-transparent">
          DualMind AI
        </h1>
        <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full text-xs font-semibold border
          ${isBa
            ? "bg-ba-primary/[0.15] text-ba-light border-[hsl(var(--ba-border))]"
            : "bg-dev-primary/[0.15] text-dev-light border-[hsl(var(--dev-border))]"
          }`}>
          <span className={`w-[7px] h-[7px] rounded-full ${isBa ? "bg-ba-primary" : "bg-dev-primary"}`} />
          {isBa ? "Business Analyst" : "Developer"} Mode
        </div>
      </div>

      <div className="w-full max-w-[560px] rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] p-8 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1">
            {isBa ? "Connect Repository & Requirements" : "Add Project Context"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isBa
              ? "Paste a public GitHub repository, let me extract the code automatically, then upload requirements so I can compare both in plain business language."
              : "Choose how to give Developer mode context: upload files, connect a repository, or paste code directly into the box."
            }
          </p>
        </div>

        {isBa ? (
          <>
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold text-foreground">🔗 GitHub Repository</div>
              <p className="text-xs text-muted-foreground">
                Share a public GitHub repository URL and DualMind will pull readable source files automatically for analysis.
              </p>
              <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 flex flex-col gap-3">
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  className="w-full rounded-lg border border-foreground/[0.08] bg-background/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-ba-primary"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={loadGitHubRepository}
                    disabled={repoLoading}
                    className="px-4 py-2.5 rounded-lg border-none text-sm font-semibold text-primary-foreground bg-ba-primary hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {repoLoading ? "Extracting repository..." : "Load Repository"}
                  </button>
                  {repoContext && (
                    <button
                      onClick={clearRepository}
                      className="px-3 py-2 rounded-lg border border-foreground/[0.12] bg-transparent text-muted-foreground text-xs font-medium hover:bg-foreground/[0.06] transition-all"
                    >
                      Clear Repository
                    </button>
                  )}
                </div>
                {repoError && (
                  <div className="text-xs text-danger">{repoError}</div>
                )}
                {repoContext && (
                  <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.04] px-3 py-3 text-xs text-foreground flex flex-col gap-1.5">
                    <div className="font-semibold text-sm">{repoContext.owner}/{repoContext.repo}</div>
                    <div className="text-muted-foreground">
                      Branch: <span className="text-foreground">{repoContext.branch}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Loaded <span className="text-foreground">{repoContext.loadedFiles}</span> readable file(s) from
                      <span className="text-foreground"> {repoContext.discoveredFiles}</span> candidate text file(s).
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-foreground/[0.06]" />
            <DropZone
              type="spec"
              label="📋 Requirements & Specs"
              description="Upload the business requirements or specification documents. This is required before continuing."
              files={specFiles}
              inputRef={specInputRef as React.RefObject<HTMLInputElement>}
            />
          </>
        ) : (
          <>
            <div className="border-t border-foreground/[0.06]" />
            <DropZone
              type="spec"
              label="📋 Specifications & Requirements"
              description="Upload the business requirements, PRD, acceptance criteria, or API contract. This is required before continuing."
              files={specFiles}
              inputRef={specInputRef as React.RefObject<HTMLInputElement>}
            />
            <div className="border-t border-foreground/[0.06]" />
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold text-foreground">Choose code input method</div>
              <p className="text-xs text-muted-foreground">
                Pick one way to add the implementation context you want the developer assistant to inspect.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "files", label: "📄 Add Files" },
                  { key: "repo", label: "🔗 Add Repository" },
                  { key: "snippet", label: "⌨️ Write Code" },
                ].map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setDevInputMode(option.key as "files" | "repo" | "snippet")}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      devInputMode === option.key
                        ? "border-dev-primary bg-dev-primary/[0.14] text-dev-light"
                        : "border-foreground/[0.08] bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 flex flex-col gap-3">
              {devInputMode === "files" && (
                <DropZone
                  type="code"
                  label="📄 Add Files"
                  description="Upload source files, components, services, or any technical docs you want analyzed."
                  files={codeFiles}
                  inputRef={fileInputRef as React.RefObject<HTMLInputElement>}
                />
              )}
              {devInputMode === "repo" && (
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-semibold text-foreground">🔗 Add Repository</div>
                  <p className="text-xs text-muted-foreground">
                    Paste a public GitHub repository URL to import readable source files automatically.
                  </p>
                  <input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    className="w-full rounded-lg border border-foreground/[0.08] bg-background/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-dev-primary"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={loadGitHubRepository}
                      disabled={repoLoading}
                      className="px-4 py-2.5 rounded-lg border-none text-sm font-semibold text-primary-foreground bg-dev-primary hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {repoLoading ? "Extracting repository..." : "Load Repository"}
                    </button>
                    {repoContext && (
                      <button
                        onClick={clearRepository}
                        className="px-3 py-2 rounded-lg border border-foreground/[0.12] bg-transparent text-muted-foreground text-xs font-medium hover:bg-foreground/[0.06] transition-all"
                      >
                        Clear Repository
                      </button>
                    )}
                  </div>
                  {repoError && <div className="text-xs text-danger">{repoError}</div>}
                  {repoContext && (
                    <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.04] px-3 py-3 text-xs text-foreground flex flex-col gap-1.5">
                      <div className="font-semibold text-sm">{repoContext.owner}/{repoContext.repo}</div>
                      <div className="text-muted-foreground">
                        Branch: <span className="text-foreground">{repoContext.branch}</span>
                      </div>
                      <div className="text-muted-foreground">
                        Loaded <span className="text-foreground">{repoContext.loadedFiles}</span> readable file(s) from
                        <span className="text-foreground"> {repoContext.discoveredFiles}</span> candidate text file(s).
                      </div>
                    </div>
                  )}
                  {codeFiles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Current code context: <span className="text-foreground">{codeFiles.length}</span> file(s) loaded.
                    </div>
                  )}
                </div>
              )}
              {devInputMode === "snippet" && (
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-semibold text-foreground">⌨️ Write Code in the Box</div>
                  <p className="text-xs text-muted-foreground">
                    Paste a snippet, component, API handler, or any partial code you want analyzed.
                  </p>
                  <input
                    value={snippetName}
                    onChange={(e) => setSnippetName(e.target.value)}
                    placeholder="snippet.ts"
                    className="w-full rounded-lg border border-foreground/[0.08] bg-background/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-dev-primary"
                  />
                  <textarea
                    value={snippetContent}
                    onChange={(e) => setSnippetContent(e.target.value)}
                    placeholder="Paste code here..."
                    rows={8}
                    className="w-full rounded-lg border border-foreground/[0.08] bg-background/30 px-3 py-2.5 text-sm text-foreground outline-none resize-y min-h-[180px] focus:border-dev-primary"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {snippetError ? <div className="text-xs text-danger">{snippetError}</div> : <div className="text-xs text-muted-foreground">Stored as a code file in the analysis context.</div>}
                    <button
                      onClick={addSnippet}
                      className="px-4 py-2.5 rounded-lg border-none text-sm font-semibold text-primary-foreground bg-dev-primary hover:brightness-110 transition-all"
                    >
                      Add Snippet
                    </button>
                  </div>
                  {codeFiles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Current code context: <span className="text-foreground">{codeFiles.length}</span> file(s) loaded.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2.5 rounded-lg border border-foreground/[0.12] bg-transparent text-muted-foreground text-sm font-medium hover:bg-foreground/[0.06] transition-all"
          >
            ← Back
          </button>
          <button
            onClick={proceed}
            disabled={!canProceed}
            className={`flex-1 py-2.5 rounded-lg border-none text-sm font-semibold text-primary-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed
              ${isBa ? "bg-ba-primary hover:brightness-110" : "bg-dev-primary hover:brightness-110"}`}
          >
            {reading ? "Reading files..." : `Continue to ${isBa ? "Analysis" : "Implementation"} →`}
          </button>
        </div>

        {!canProceed && (
          <div className="text-xs text-warning text-center">
            Add at least one spec file and one code source before continuing.
          </div>
        )}
      </div>
    </div>
  );
}
