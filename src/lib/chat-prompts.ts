import type { ProjectProfile } from "./project-profile";

// These prompts are used client-side for reference / welcome messages only.
// The actual system prompts live in the edge function (supabase/functions/bridge-chat/index.ts).

export const BA_SYSTEM_PROMPT = "";
export const DEV_SYSTEM_PROMPT = "";

export function getBaActions(profile: ProjectProfile): Record<string, string> {
  return {
    understand_code: `Please explain what the ${profile.projectName} ${profile.projectType} does in plain business language. Cover:
1. What is the purpose of this application?
2. What can it currently do?
3. Who are the users and how do they benefit?
4. What inputs go in, and what outputs or outcomes come out?
Keep it jargon-free — as if you're explaining it to a non-technical executive.`,

    check_specs: `Perform a full requirements traceability analysis for ${profile.projectName}.
- Use the uploaded repository and any uploaded requirement/specification materials as the source of truth.
- Group findings into: ✅ clearly implemented, ⚠️ partially evidenced, ❌ missing, and ❓ cannot confirm.
- Reference specific evidence from the repository when possible.
- Explain business impact for anything partial or missing.
Give me a clear table and then elaborate on the most important gaps.`,

    compliance_review: `Perform a compliance and business-risk review of ${profile.projectName}.
Check:
1. Security or privacy-sensitive workflows
2. Data handling and validation risks
3. Business rule enforcement
4. Auditability / traceability / operational risk
5. Any legal, operational, or commercial concerns visible from the provided material
Use plain business language and only claim issues you can support from the uploaded repository/specs.`,

    progress_report: `Generate a stakeholder progress report for the ${profile.projectName} project. Include:
- Executive Summary
- Features Complete
- In Progress / Partial
- Blocked / Missing
- Risk Assessment
- Recommended Next Steps
Make it professional and suitable for a non-technical audience.`,

    explain_feature: `Identify the highest-value missing or partially implemented feature in ${profile.projectName}, then explain it in plain business language:
1. What is the feature?
2. Why does a user or operator need it?
3. How would it work in a concrete real-world example?
4. What business value would it create?
5. What appears to be its current implementation status?`,

    new_requirement: `Help me structure a new requirement for ${profile.projectName}.

Structure using:
- Requirement ID or feature label
- User story
- Acceptance criteria
- Business rules
- API or workflow implications
- Dependencies`,
  };
}

export function getDevActions(profile: ProjectProfile): Record<string, string> {
  return {
    implement_feature: `Provide a complete technical implementation guide for the highest-priority missing or partial feature in ${profile.projectName}.

I need:
1. Requirement interpretation
2. Proposed implementation approach
3. Concrete code/module changes
4. Edge cases and validations
5. Error handling and testing strategy

Ground your answer in the uploaded repository and specs.`,

    generate_tests: `Generate a comprehensive test strategy for ${profile.projectName}'s most important missing or risky feature.

Cover:
1. Happy path tests
2. Boundary conditions
3. Edge cases
4. Error conditions
5. Validation tests
6. Integration tests

Format as practical test cases using the stack visible in the uploaded repository.`,

    verify_implementation: `Verify the existing code for ${profile.projectName} against the uploaded business requirements and expected product behavior.
1. Identify clearly implemented features
2. Identify partial or missing features
3. Highlight validation gaps
4. Flag technical risks
5. Call out anything that cannot be confirmed from the provided material

Flag bugs, missing validations, or spec deviations.`,

    explain_for_ba: `Write a business-friendly explanation of the ${profile.projectName} codebase for a Business Analyst:
1. What the code does in plain terms
2. The core workflow with a real example
3. The API or system behavior (what goes in, what comes out)
4. What's missing or partial
5. Quality/reliability (what test coverage means for the business)`,

    api_docs: `Generate API or system interface documentation for ${profile.projectName} based only on the uploaded materials.

For each visible endpoint or interface, provide the purpose, inputs, outputs, error behavior, and examples where possible.
Be explicit about what is confirmed versus inferred.`,

    risk_analysis: `Perform a technical risk assessment for ${profile.projectName}:
1. Missing implementation risks
2. Unhandled edge cases
3. Validation gaps
4. Data integrity concerns
5. Performance concerns
6. Security concerns
7. Missing error handling

Rate each as HIGH / MEDIUM / LOW and suggest a fix.`,
  };
}

export function getBaWelcome(profile: ProjectProfile) {
  return `👋 Welcome! I'm **DualMind AI** — your bridge between business requirements and technical implementation.

I'm operating in **Business Analyst** mode. I have context for **${profile.projectName}** and I'm here to help you:

- 📋 Understand what the code does in **plain business language**
- ✅ Check whether **requirements are met**
- ⚠️ Identify **gaps, risks, and compliance concerns**
- 📊 Generate **progress reports** for stakeholders

Project snapshot:
- 🔎 Project type: **${profile.projectType}**
- 📦 Repository linked: **${profile.repoLabel ?? "No repository metadata"}**
- 📝 Requirements loaded: **${profile.hasSpecs ? "Yes" : "No formal specs uploaded yet"}**

**Click any feature tile** on the left to get started, or ask me anything in plain language.`;
}

export function getDevWelcome(profile: ProjectProfile) {
  return `👨‍💻 Ready to build! I'm **DualMind AI** — your bridge between business specs and technical execution.

I'm operating in **Developer** mode with context for **${profile.projectName}**.

What I can help with:
- 🔧 Generate **implementation plans** grounded in the uploaded repo/specs
- 🧪 Create **test suites** and identify edge cases
- 📐 Verify code against **requirements**
- 🔍 Perform **risk analysis** and find gaps

Project snapshot:
- 🔎 Project type: **${profile.projectType}**
- 📦 Repository linked: **${profile.repoLabel ?? "No repository metadata"}**
- 📝 Requirements loaded: **${profile.hasSpecs ? "Yes" : "No formal specs uploaded yet"}**

**Click any tile** for a targeted deep-dive, or ask me anything.`;
}
