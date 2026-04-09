import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { streamChat, type ChatMessage } from "@/lib/chat-stream";
import { getBaWelcome, getDevWelcome } from "@/lib/chat-prompts";
import { inferProjectProfile } from "@/lib/project-profile";
import { appendUploadedFiles, getRepositoryContext, getUploadedFiles, type UploadedFile } from "./FileUploadStep";

interface ChatSidebarProps {
  role: "ba" | "dev";
  pendingMessage: string | null;
  onPendingConsumed: () => void;
  onContextChanged: () => void;
}

function buildFileContext(files: UploadedFile[], role: "ba" | "dev"): string {
  if (files.length === 0) return "";

  const codeFiles = files.filter(f => f.type === "code");
  const specFiles = files.filter(f => f.type === "spec");

  let context = "\n\n--- UPLOADED MATERIALS ---\n";

  if (specFiles.length > 0) {
    context += "\n## Specifications / Requirements:\n";
    for (const f of specFiles) {
      context += `\n### File: ${f.name}\n\`\`\`\n${f.content}\n\`\`\`\n`;
    }
  }

  if (codeFiles.length > 0) {
    context += "\n## Code Files:\n";
    for (const f of codeFiles) {
      const ext = f.name.split(".").pop() || "";
      context += `\n### File: ${f.name}\n\`\`\`${ext}\n${f.content}\n\`\`\`\n`;
    }
  }

  context += "\n--- END UPLOADED MATERIALS ---\n";
  context += role === "ba"
    ? "\nAnalyze the uploaded code and answer questions in plain business language."
    : "\nAnalyze the uploaded specs/code and provide technical implementation guidance.";

  return context;
}

export default function ChatSidebar({ role, pendingMessage, onPendingConsumed, onContextChanged }: ChatSidebarProps) {
  const isBa = role === "ba";
  const navigate = useNavigate();
  const uploadedFiles = getUploadedFiles();
  const repoContext = getRepositoryContext();
  const hasUploads = uploadedFiles.length > 0;
  const projectProfile = inferProjectProfile(uploadedFiles, repoContext);

  const codeUploads = uploadedFiles.filter(f => f.type === "code");
  const specUploads = uploadedFiles.filter(f => f.type === "spec");

  const buildRepoSnapshot = () => {
    if (codeUploads.length === 0) return "";

    const topAreas = Object.entries(
      codeUploads.reduce<Record<string, number>>((acc, file) => {
        const [area] = file.name.split("/");
        const key = area && area !== file.name ? area : "root";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([area, count]) => area === "root" ? `${count} top-level file(s)` : `${area} (${count})`);

    const sampleFiles = codeUploads.slice(0, 4).map((file) => `\`${file.name}\``);
    const remaining = codeUploads.length - sampleFiles.length;

    let snapshot = "\n\n**Context loaded:**";

    if (topAreas.length > 0) {
      snapshot += ` main areas include ${topAreas.join(", ")}.`;
    }

    if (sampleFiles.length > 0) {
      snapshot += ` Sample files: ${sampleFiles.join(", ")}${remaining > 0 ? `, and ${remaining} more.` : "."}`;
    }

    return snapshot;
  };

  const welcomeMsg = hasUploads
    ? (isBa
      ? `👋 Welcome! I've loaded **${codeUploads.length} repository file(s)** and **${specUploads.length} requirement file(s)**${repoContext ? ` from **${repoContext.owner}/${repoContext.repo}**` : ""}. I'll compare them and answer your questions in plain business language.${buildRepoSnapshot()}\n\n**Click any tile** on the left or ask me anything — e.g. "Are all requirements met?" or "What are the biggest business risks?"`
      : `👨‍💻 Ready! I've loaded **${specUploads.length} spec file(s)**${codeUploads.length > 0 ? ` and **${codeUploads.length} code file(s)** for comparison` : ""}.\n\n**Click any tile** on the left or ask me anything — e.g. "How do I implement this?" or "Does the code match the spec?"`)
    : (isBa ? getBaWelcome(projectProfile) : getDevWelcome(projectProfile));

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: welcomeMsg },
  ]);
  const [input, setInput] = useState("");
  const [snippetName, setSnippetName] = useState("snippet.ts");
  const [snippetContent, setSnippetContent] = useState("");
  const [snippetError, setSnippetError] = useState("");
  const [showSnippetBox, setShowSnippetBox] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [attaching, setAttaching] = useState<"code" | "spec" | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const specInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [messages]);

  // Build file context string once
  const fileContext = `${repoContext
    ? `\n\n--- REPOSITORY SOURCE ---\nRepository: ${repoContext.url}\nOwner: ${repoContext.owner}\nRepo: ${repoContext.repo}\nBranch: ${repoContext.branch}\nLoaded Files: ${repoContext.loadedFiles}\n--- END REPOSITORY SOURCE ---\n`
    : ""}${buildFileContext(uploadedFiles, role)}`;

  const sendMessage = useCallback(async (content: string) => {
    if (streaming || !content.trim()) return;

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setStreaming(true);

    let assistantText = "";

    const upsert = (chunk: string) => {
      assistantText += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length === updatedMessages.length + 1) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    await streamChat({
      role,
      messages: updatedMessages,
      fileContext,
      onDelta: upsert,
      onDone: () => setStreaming(false),
      onError: (err) => {
        setMessages(prev => [...prev, { role: "assistant", content: `⚠️ **Error:** ${err}` }]);
        setStreaming(false);
      },
    });
  }, [messages, streaming, role, fileContext]);

  useEffect(() => {
    if (pendingMessage) {
      sendMessage(pendingMessage);
      onPendingConsumed();
    }
  }, [pendingMessage, onPendingConsumed, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !streaming) {
        sendMessage(input);
        setInput("");
      }
    }
  };

  const clearChat = () => {
    setMessages([{ role: "assistant", content: welcomeMsg }]);
  };

  const addFilesFromPicker = async (files: FileList | null, type: "code" | "spec") => {
    if (!files?.length) return;

    setAttaching(type);

    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        newFiles.push({ name: file.name, content, type });
      } catch {
        // Skip binary files.
      }
    }

    if (newFiles.length > 0) {
      appendUploadedFiles(newFiles);
      onContextChanged();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `📎 Added **${newFiles.length} ${type === "spec" ? "specification" : "code"} file(s)** to the current analysis context.`,
        },
      ]);
    }

    setAttaching(null);
  };

  const addSnippetToContext = () => {
    if (!snippetContent.trim()) {
      setSnippetError("Paste some code before adding it.");
      return;
    }

    appendUploadedFiles([{
      name: snippetName.trim() || "snippet.ts",
      content: snippetContent.trim(),
      type: "code",
      source: "pasted",
    }]);
    onContextChanged();
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `⌨️ Added pasted code as **${snippetName.trim() || "snippet.ts"}** to the current analysis context.`,
      },
    ]);
    setSnippetError("");
    setSnippetContent("");
    setShowSnippetBox(false);
  };

  return (
    <aside className={`flex-1 min-w-0 flex flex-col border-l border-foreground/[0.06] ${isBa ? "bg-ba-surface" : "bg-dev-surface"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-2">
          <span>🤖</span>
          <div>
            <div className="text-[13px] font-semibold text-foreground">AI Assistant</div>
            <div className="text-[11px] text-muted-foreground/60">
              {isBa ? "Business Analyst" : "Developer"} Mode
              {hasUploads && <span className="ml-1 text-success">· {uploadedFiles.length} file(s) loaded</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/upload/${role}`)}
            className="px-2.5 py-1 rounded-lg border border-foreground/[0.08] bg-transparent text-muted-foreground/70 text-[11px] hover:text-muted-foreground hover:bg-foreground/[0.04] transition-all"
          >
            {isBa ? "Repo" : "Context"}
          </button>
          {!isBa && (
            <button
              onClick={() => setShowSnippetBox((value) => !value)}
              className="px-2.5 py-1 rounded-lg border border-foreground/[0.08] bg-transparent text-muted-foreground/70 text-[11px] hover:text-muted-foreground hover:bg-foreground/[0.04] transition-all"
            >
              Paste code
            </button>
          )}
          <button onClick={clearChat} className="px-2.5 py-1 rounded-lg border border-foreground/[0.08] bg-transparent text-muted-foreground/60 text-[11px] hover:text-muted-foreground hover:bg-foreground/[0.04] transition-all">
            Clear chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 custom-scrollbar scroll-smooth">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 animate-fade-in-up ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5
              ${msg.role === "user" ? "bg-foreground/10" : isBa ? "bg-ba-primary/20" : "bg-dev-primary/20"}`}>
              {msg.role === "user" ? "👤" : isBa ? "📊" : "⚙️"}
            </div>
            <div className={`max-w-[88%] px-3.5 py-2.5 text-[13px] leading-relaxed chat-markdown
              ${msg.role === "user"
                ? "bg-foreground/[0.07] text-foreground rounded-xl rounded-tr-lg"
                : isBa
                  ? "bg-ba-primary/[0.08] border border-[hsl(var(--ba-border))] text-foreground rounded-xl rounded-tl-lg"
                  : "bg-dev-primary/[0.08] border border-[hsl(var(--dev-border))] text-foreground rounded-xl rounded-tl-lg"
              }`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="inline-block w-0.5 h-3.5 bg-muted-foreground ml-0.5 align-middle animate-blink" />
              )}
            </div>
          </div>
        ))}
        {streaming && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-2.5">
            <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm shrink-0 ${isBa ? "bg-ba-primary/20" : "bg-dev-primary/20"}`}>
              {isBa ? "📊" : "⚙️"}
            </div>
            <div className={`px-3.5 py-2.5 rounded-xl rounded-tl-lg ${isBa ? "bg-ba-primary/[0.08] border border-[hsl(var(--ba-border))]" : "bg-dev-primary/[0.08] border border-[hsl(var(--dev-border))]"}`}>
              <div className="flex gap-1 py-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" style={{ animation: `bounce-dot 1.2s infinite ${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-foreground/[0.06]">
        {!isBa && showSnippetBox && (
          <div className="mb-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 flex flex-col gap-2.5">
            <input
              value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              placeholder="snippet.ts"
              className="w-full rounded-lg border border-foreground/[0.08] bg-background/30 px-3 py-2 text-[12px] text-foreground outline-none focus:border-dev-primary"
            />
            <textarea
              value={snippetContent}
              onChange={(e) => setSnippetContent(e.target.value)}
              placeholder="Paste code here to add it as context..."
              rows={6}
              className="w-full rounded-lg border border-foreground/[0.08] bg-background/30 px-3 py-2 text-[12px] text-foreground outline-none resize-y min-h-[140px] focus:border-dev-primary"
            />
            <div className="flex items-center justify-between gap-3">
              <div className={`text-[10px] ${snippetError ? "text-danger" : "text-muted-foreground/50"}`}>
                {snippetError || "This stores the snippet as a code file for the developer assistant."}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowSnippetBox(false);
                    setSnippetError("");
                  }}
                  className="px-3 py-1.5 rounded-lg border border-foreground/[0.08] bg-transparent text-[11px] text-muted-foreground hover:bg-foreground/[0.04] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={addSnippetToContext}
                  className="px-3 py-1.5 rounded-lg border-none bg-dev-primary text-[11px] font-semibold text-primary-foreground hover:brightness-110 transition-all"
                >
                  Add pasted code
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex flex-wrap gap-2">
            {isBa && (
              <button
                onClick={() => specInputRef.current?.click()}
                disabled={!!attaching}
                className="px-3 py-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-[11px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-all disabled:opacity-50"
              >
                {attaching === "spec" ? "Adding specs..." : "📋 Add Specs"}
              </button>
            )}
            <button
              onClick={() => codeInputRef.current?.click()}
              disabled={!!attaching}
              className="px-3 py-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-[11px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-all disabled:opacity-50"
            >
              {attaching === "code" ? "Adding files..." : isBa ? "📄 Add Code" : "📄 Add Files"}
            </button>
            {!isBa && (
              <button
                onClick={() => navigate(`/upload/${role}`)}
                className="px-3 py-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-[11px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-all"
              >
                🔗 Add Repository
              </button>
            )}
            {!isBa && (
              <button
                onClick={() => setShowSnippetBox((value) => !value)}
                className="px-3 py-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-[11px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-all"
              >
                ⌨️ Write Code
              </button>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground/50">
            {uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s) in context` : "No extra files attached"}
          </div>
        </div>
        <input
          ref={specInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFilesFromPicker(e.target.files, "spec");
            e.target.value = "";
          }}
        />
        <input
          ref={codeInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFilesFromPicker(e.target.files, "code");
            e.target.value = "";
          }}
        />
        <div className={`flex items-end gap-2.5 bg-foreground/[0.04] border border-foreground/[0.08] rounded-xl px-3 py-2 transition-colors
          ${isBa ? "focus-within:border-[hsl(var(--ba-border))]" : "focus-within:border-[hsl(var(--dev-border))]"}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isBa ? "Ask anything about the project..." : "Ask about implementation, tests, code..."}
            rows={1}
            disabled={streaming}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-foreground resize-none leading-relaxed max-h-[120px] min-h-[20px] placeholder:text-muted-foreground/40"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => { if (input.trim() && !streaming) { sendMessage(input); setInput(""); } }}
            disabled={!input.trim() || streaming}
            className={`w-8 h-8 rounded-lg border-none flex items-center justify-center text-[15px] shrink-0 transition-all text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed
              ${isBa ? "bg-ba-primary hover:brightness-110" : "bg-dev-primary hover:brightness-110"}`}
          >
            ↑
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
          {isBa ? "Enter to send · Shift+Enter for new line · Attach files above" : "Enter to send · Shift+Enter for new line · Add files, a repository, or pasted code above"}
        </p>
      </div>
    </aside>
  );
}
