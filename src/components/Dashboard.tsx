import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatSidebar from "./ChatSidebar";
import { getBaActions, getDevActions } from "@/lib/chat-prompts";
import { inferProjectProfile } from "@/lib/project-profile";
import { getRepositoryContext, getUploadedFiles } from "./FileUploadStep";

interface TileProps {
  icon: string;
  title: string;
  desc: string;
  tag: string;
  isBa: boolean;
  onClick: () => void;
}

const FeatureTile = ({ icon, title, desc, tag, isBa, onClick }: TileProps) => (
  <div
    onClick={onClick}
    className={`p-3 rounded-xl border border-foreground/[0.06] cursor-pointer transition-all duration-200 relative overflow-hidden group min-h-[118px]
      ${isBa ? "bg-ba-card hover:border-ba-primary hover:shadow-[0_0_0_1px_hsl(var(--ba-border)),0_8px_24px_rgba(0,0,0,0.3)]" : "bg-dev-card hover:border-dev-primary hover:shadow-[0_0_0_1px_hsl(var(--dev-border)),0_8px_24px_rgba(0,0,0,0.3)]"}
      hover:-translate-y-0.5`}
  >
    <span className="text-base mb-1 block">{icon}</span>
    <div className="text-[12px] font-semibold text-foreground mb-1 leading-snug">{title}</div>
    <p className="text-[10.5px] text-muted-foreground leading-relaxed line-clamp-2">{desc}</p>
    <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold
      ${isBa ? "bg-ba-primary/[0.12] text-ba-light" : "bg-dev-primary/[0.12] text-dev-light"}`}>{tag}</span>
  </div>
);

interface StatusItemProps {
  label: string;
  status: "done" | "warn" | "miss";
  onClick: () => void;
}

const StatusItem = ({ label, status, onClick }: StatusItemProps) => (
  <div onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/[0.06] text-[11px] text-muted-foreground cursor-pointer hover:bg-foreground/[0.07] hover:text-foreground transition-all">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status === "done" ? "bg-success" : status === "warn" ? "bg-warning" : "bg-danger"}`} />
    {label}
  </div>
);

const getBaTiles = (projectName: string) => [
  { icon: "🏢", title: "What Does This App Do?", desc: `Get a plain-English overview of ${projectName}.`, tag: "Overview", action: "understand_code" },
  { icon: "📋", title: "Are Specs Reflected in Code?", desc: "Compare the repository against the provided requirements.", tag: "Gap Analysis", action: "check_specs" },
  { icon: "⚖️", title: "Compliance & Risk Review", desc: "Surface operational, security, and business-rule risks.", tag: "Risk", action: "compliance_review" },
  { icon: "📊", title: "Stakeholder Progress Report", desc: "Generate a ready-to-share business update.", tag: "Reporting", action: "progress_report" },
  { icon: "💡", title: "Explain the Highest-Value Gap", desc: "Explain the biggest missing or partial feature in plain language.", tag: "Feature", action: "explain_feature" },
  { icon: "✍️", title: "Structure a New Requirement", desc: "Turn a new business need into a professional requirement.", tag: "Requirements", action: "new_requirement" },
];

const getDevTiles = (projectName: string) => [
  { icon: "⚙️", title: "Implement the Priority Feature", desc: `Create a concrete implementation plan for ${projectName}.`, tag: "Implementation", action: "implement_feature" },
  { icon: "🧪", title: "Generate Test Cases", desc: "Create a test strategy around the riskiest workflows and edge cases.", tag: "Testing", action: "generate_tests" },
  { icon: "✅", title: "Verify vs. Specs", desc: "Check the codebase against the uploaded business requirements.", tag: "QA", action: "verify_implementation" },
  { icon: "📝", title: "Explain Code for BA", desc: "Generate a plain-language explanation of the implementation.", tag: "Documentation", action: "explain_for_ba" },
  { icon: "📚", title: "Generate API Docs", desc: "Document the system endpoints and request/response behavior.", tag: "Docs", action: "api_docs" },
  { icon: "⚠️", title: "Risk & Edge Cases", desc: "Identify technical risks, gaps, and failure modes.", tag: "Risk", action: "risk_analysis" },
];

const getBaStatus = (projectName: string, hasRepo: boolean, hasSpecs: boolean) => [
  { label: hasRepo ? "Repository Loaded ✅" : "Repository Missing ⚠️", status: hasRepo ? "done" as const : "warn" as const, prompt: `Summarize the current repository context for ${projectName} and explain what parts of the product are visible from the code.` },
  { label: hasSpecs ? "Requirements Loaded ✅" : "Requirements Missing ⚠️", status: hasSpecs ? "done" as const : "warn" as const, prompt: `What requirement or specification materials do we currently have for ${projectName}, and what gaps remain?` },
  { label: "Traceability Review", status: "warn" as const, prompt: `Which business workflows in ${projectName} are clearly traceable between requirements and implementation, and which are unclear?` },
  { label: "Business Risks", status: "miss" as const, prompt: `What are the biggest business, compliance, or delivery risks visible in ${projectName} right now?` },
];

const getDevStatus = (projectName: string, hasRepo: boolean, hasSpecs: boolean) => [
  { label: hasRepo ? "Code Context Loaded ✅" : "Code Context Missing ⚠️", status: hasRepo ? "done" as const : "warn" as const, prompt: `Summarize the repository structure and key implementation areas for ${projectName}.` },
  { label: hasSpecs ? "Specs Loaded ✅" : "Specs Missing ⚠️", status: hasSpecs ? "done" as const : "warn" as const, prompt: `What requirement or product-definition material exists for ${projectName}, and what is missing?` },
  { label: "Implementation Gaps", status: "warn" as const, prompt: `What are the biggest implementation gaps or unknowns currently visible in ${projectName}?` },
  { label: "Testing & Risk", status: "miss" as const, prompt: `What are the main testing, validation, and technical risks in ${projectName}?` },
];

export default function Dashboard() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [, setContextVersion] = useState(0);

  const isBa = role === "ba";
  const currentRole = (role === "ba" || role === "dev") ? role : "ba";
  const uploadedFiles = getUploadedFiles();
  const repoContext = getRepositoryContext();
  const projectProfile = inferProjectProfile(uploadedFiles, repoContext);
  const actions = isBa ? getBaActions(projectProfile) : getDevActions(projectProfile);
  const tiles = isBa ? getBaTiles(projectProfile.projectName) : getDevTiles(projectProfile.projectName);
  const statusItems = isBa
    ? getBaStatus(projectProfile.projectName, projectProfile.hasRepo, projectProfile.hasSpecs)
    : getDevStatus(projectProfile.projectName, projectProfile.hasRepo, projectProfile.hasSpecs);

  const sendAction = (actionKey: string) => {
    const prompt = actions[actionKey];
    if (prompt) setPendingMessage(prompt);
  };

  const sendStatus = (prompt: string) => {
    setPendingMessage(prompt);
  };

  const onPendingConsumed = useCallback(() => setPendingMessage(null), []);
  const onContextChanged = useCallback(() => setContextVersion((value) => value + 1), []);

  return (
    <div className={`h-screen flex flex-col ${isBa ? "bg-ba-bg" : "bg-dev-bg"}`}>
      <header className={`flex items-center px-6 h-[60px] border-b border-foreground/[0.06] shrink-0 gap-4 ${isBa ? "bg-ba-surface" : "bg-dev-surface"}`}>
        <span className="text-lg font-extrabold tracking-tight bg-gradient-to-br from-ba-primary to-dev-primary bg-clip-text text-transparent">
          DualMind AI
        </span>
        <div className="w-px h-6 bg-foreground/10" />
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border
          ${isBa ? "bg-ba-primary/[0.15] text-ba-light border-[hsl(var(--ba-border))]" : "bg-dev-primary/[0.15] text-dev-light border-[hsl(var(--dev-border))]"}`}>
          <span className={`w-[7px] h-[7px] rounded-full animate-pulse-dot ${isBa ? "bg-ba-primary" : "bg-dev-primary"}`} />
          {isBa ? "Business Analyst" : "Developer"} Mode
        </div>
        <span className="text-sm text-muted-foreground">{projectProfile.projectLabel}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-foreground/[0.04] border border-foreground/[0.06] text-xs text-muted-foreground">
          {repoContext
            ? `🔗 ${repoContext.owner}/${repoContext.repo} · ${repoContext.loadedFiles} file(s)`
            : uploadedFiles.length > 0
              ? `📎 ${uploadedFiles.length} file(s) loaded`
              : "📂 Waiting for project context"}
        </div>
        <button onClick={() => navigate(`/upload/${role}`)} className="px-3.5 py-[7px] rounded-lg border border-foreground/[0.12] bg-transparent text-muted-foreground text-xs font-medium hover:bg-foreground/[0.06] hover:text-foreground hover:border-foreground/20 transition-all">
          {isBa ? "🔗 Change Repository" : "📎 Change Files"}
        </button>
        <button onClick={() => navigate("/")} className="px-3.5 py-[7px] rounded-lg border border-foreground/[0.12] bg-transparent text-muted-foreground text-xs font-medium hover:bg-foreground/[0.06] hover:text-foreground hover:border-foreground/20 transition-all">
          ↩ Switch Role
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[0_0_30%] min-w-[340px] max-w-[520px] p-4 overflow-y-auto flex flex-col gap-4 custom-scrollbar">
          <div className="text-[11px] font-semibold tracking-[1.5px] uppercase text-muted-foreground/50 pb-1">
            Quick Actions — click to ask the AI
          </div>

          <div className="flex gap-2 flex-wrap">
            {statusItems.map((item, index) => (
              <StatusItem key={index} label={item.label} status={item.status} onClick={() => sendStatus(item.prompt)} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {tiles.map((tile, index) => (
              <FeatureTile
                key={index}
                icon={tile.icon}
                title={tile.title}
                desc={tile.desc}
                tag={tile.tag}
                isBa={isBa}
                onClick={() => sendAction(tile.action)}
              />
            ))}
          </div>
        </div>

        <ChatSidebar
          role={currentRole}
          pendingMessage={pendingMessage}
          onPendingConsumed={onPendingConsumed}
          onContextChanged={onContextChanged}
        />
      </div>
    </div>
  );
}
