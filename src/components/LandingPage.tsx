import { useNavigate } from "react-router-dom";
import dualMindLogo from "@/assets/dualmind-logo.png";

interface RoleCardProps {
  type: "ba" | "dev";
  icon: string;
  title: string;
  desc: string;
  features: string[];
  btnLabel: string;
  onClick: () => void;
}

const RoleCard = ({ type, icon, title, desc, features, btnLabel, onClick }: RoleCardProps) => {
  const isBa = type === "ba";
  return (
    <div
      onClick={onClick}
      className={`w-full max-w-[320px] p-8 rounded-[20px] border cursor-pointer transition-all duration-300 relative overflow-hidden group
        border-foreground/[0.08] bg-foreground/[0.03]
        ${isBa ? "hover:border-ba-primary hover:shadow-[0_0_40px_hsl(var(--ba-primary)/0.25),0_20px_60px_rgba(0,0,0,0.4)]" : "hover:border-dev-primary hover:shadow-[0_0_40px_hsl(var(--dev-primary)/0.25),0_20px_60px_rgba(0,0,0,0.4)]"}
        hover:-translate-y-1.5`}
    >
      <div className={`absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300
        ${isBa ? "bg-[radial-gradient(circle_at_50%_0%,hsl(var(--ba-primary)/0.15)_0%,transparent_70%)]" : "bg-[radial-gradient(circle_at_50%_0%,hsl(var(--dev-primary)/0.15)_0%,transparent_70%)]"}`} />
      <div className="relative z-10">
        <span className="text-[40px] mb-4 block">{icon}</span>
        <div className={`text-xl font-bold mb-2 ${isBa ? "text-ba-light" : "text-dev-light"}`}>{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{desc}</p>
        <ul className="flex flex-col gap-2 mb-6">
          {features.map((f, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
              <span className={`text-[11px] ${isBa ? "text-ba-primary" : "text-dev-primary"}`}>→</span>
              {f}
            </li>
          ))}
        </ul>
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className={`w-full py-3 rounded-lg border-none text-sm font-semibold text-primary-foreground transition-all
            ${isBa ? "bg-ba-primary hover:brightness-110" : "bg-dev-primary hover:brightness-110"}`}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  );
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 px-4 py-12"
      style={{
        background: "radial-gradient(ellipse at 30% 40%, hsl(217 91% 60% / 0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, hsl(270 70% 60% / 0.12) 0%, transparent 60%), linear-gradient(135deg, hsl(220 50% 4%) 0%, hsl(270 30% 5%) 100%)"
      }}>
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <img src={dualMindLogo} alt="DualMind AI logo" width={80} height={80} className="drop-shadow-lg" />
        </div>
        <h1
          className="text-[48px] sm:text-[56px] font-extrabold tracking-[-2px] bg-gradient-to-br from-ba-primary to-dev-primary bg-clip-text text-transparent"
          style={{
            filter: "drop-shadow(0 0 12px hsl(217 91% 60% / 0.5)) drop-shadow(0 0 32px hsl(270 70% 60% / 0.35))",
          }}
        >
          DualMind AI
        </h1>
        <p className="text-lg text-muted-foreground mt-2.5">
          Two perspectives. One intelligent workflow.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-[700px] items-stretch justify-center">
        <RoleCard
          type="ba"
          icon="📊"
          title="Business Analyst"
          desc="Upload code and understand it in business terms. Verify requirements, check compliance, and track progress."
          features={[
            "Upload code → get plain-English analysis",
            "Verify specs are correctly implemented",
            "Compliance & regulatory review",
            "Progress reports for stakeholders",
          ]}
          btnLabel="Enter as Business Analyst →"
          onClick={() => navigate("/upload/ba")}
        />
        <RoleCard
          type="dev"
          icon="⚙️"
          title="Developer"
          desc="Upload specs and requirements to get implementation guides, test cases, and technical analysis."
          features={[
            "Upload specs → get implementation tasks",
            "Compare code against requirements",
            "Test case generation with edge cases",
            "API docs & risk analysis",
          ]}
          btnLabel="Enter as Developer →"
          onClick={() => navigate("/upload/dev")}
        />
      </div>

      <p className="text-[13px] text-muted-foreground/60">
        Powered by AI · Upload your own project files to get started
      </p>
    </div>
  );
}
