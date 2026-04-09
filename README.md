# DualMind AI

Two perspectives. One intelligent workflow.

DualMind AI is a React + TypeScript web app that helps two audiences work from the same project context:

- `Business Analyst` mode explains code in plain language, compares implementation against requirements, highlights gaps, and surfaces business or compliance risks.
- `Developer` mode turns requirements into implementation tasks, compares specs against code, and proposes testing and delivery guidance.

The app is designed to reduce back-and-forth between business and engineering by grounding every answer in uploaded materials or a connected public GitHub repository.

## What the Project Does

DualMind AI lets a user:

- choose a role: `Business Analyst` or `Developer`
- provide project context through uploaded files, a public GitHub repository, or pasted code
- upload requirement/specification files
- open a chat assistant that answers only from the provided material
- ask role-specific questions through quick actions or free-form chat

## Functional Requirements

### Business Analyst flow

Business Analyst mode requires both:

- at least one `code source`
- at least one `specification / requirements` file

Code context can come from:

- a public GitHub repository URL
- uploaded code files

Business Analyst mode is meant to:

- explain what the application appears to do
- compare requirements against implementation
- highlight unclear traceability
- surface compliance, delivery, and business risks

### Developer flow

Developer mode also requires both:

- at least one `specification / requirements` file
- at least one `code source`

Developer code context can come from one of these input methods:

- `Add Files`
- `Add Repository`
- `Write Code`

Developer mode is meant to:

- translate specs into technical tasks
- compare code with requirements
- identify missing edge cases and dependencies
- suggest testing and implementation steps

## How It Works

### User flow

1. The user lands on the home page and chooses a role.
2. The upload screen collects the required project context.
3. Files are stored in `sessionStorage` so the context survives navigation within the session.
4. The dashboard shows role-specific quick actions plus a chat panel.
5. Chat messages and file context are sent to a Supabase Edge Function.
6. The Edge Function builds a grounded system prompt and forwards the request to the AI gateway.
7. Responses are streamed back into the chat UI, with a non-streaming fallback if streaming fails.

### Routing

The frontend uses React Router and exposes three main routes:

- `/` for the landing page
- `/upload/:role` for project context intake
- `/dashboard/:role` for the main role-based workspace

### Repository ingestion

When a public GitHub repository is connected, the app:

- validates the GitHub URL
- fetches repository metadata from the GitHub API
- fetches the repository tree
- filters for readable text-based files
- excludes generated or noisy directories such as `node_modules`, `dist`, `build`, and `coverage`
- prioritizes key folders like `src`, `app`, `components`, `pages`, `lib`, `server`, `api`, and `supabase`
- limits the amount of content imported for analysis

Current repository extraction limits:

- public repositories only
- maximum `36` files
- maximum `150 KB` per file
- maximum `12,000` characters per stored file

These limits keep the analysis focused and avoid flooding the model with low-value generated content.

## API Connection

DualMind AI uses a two-step API architecture:

1. Frontend -> Supabase Edge Function
2. Supabase Edge Function -> Lovable AI Gateway

### Frontend to Supabase

The frontend sends chat requests to:

`{VITE_SUPABASE_URL}/functions/v1/bridge-chat`

The request includes:

- `role`
- `messages`
- `fileContext`
- `stream`

The frontend authenticates the request using the Supabase publishable key from Vite environment variables.

### Supabase Edge Function

The Edge Function lives at:

[`supabase/functions/bridge-chat/index.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/supabase/functions/bridge-chat/index.ts)

Its responsibilities are:

- receive chat requests from the frontend
- apply the grounded DualMind system prompt
- switch behavior based on `Business Analyst` or `Developer` mode
- inject repository and uploaded file context
- reject unsupported or unrelated prompts
- proxy the request to the AI gateway
- return either streamed or non-streamed responses

### AI provider

The current implementation sends requests to:

`https://ai.gateway.lovable.dev/v1/chat/completions`

Using:

- model: `google/gemini-3-flash-preview`
- secret: `LOVABLE_API_KEY` stored on the Supabase function runtime

## Environment Variables

### Frontend `.env`

The local frontend expects these variables:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`

### Supabase Edge Function secret

The chat proxy also requires:

- `LOVABLE_API_KEY`

This key is not read from the frontend `.env`. It must be configured as a Supabase Edge Function secret.

## Local Setup

### Prerequisites

- Node.js 18+ recommended
- npm
- a Supabase project
- a configured `bridge-chat` Edge Function
- a valid `LOVABLE_API_KEY` secret on the Supabase side

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Default local URL:

`http://127.0.0.1:5173`

### Build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Testing

Vitest is configured, but current test coverage is minimal.

Available command:

```bash
npm test
```

Current state of tests:

- there is only a placeholder test in [`src/test/example.test.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/test/example.test.ts)
- there is no meaningful coverage yet for upload validation
- there is no meaningful coverage yet for GitHub repository ingestion
- there is no meaningful coverage yet for dashboard role logic
- there is no meaningful coverage yet for chat streaming fallback
- there is no meaningful coverage yet for prompt construction

That means the project is buildable and runnable, but behavior is still validated mainly through manual testing rather than automated safety checks.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui and Radix UI
- Supabase JavaScript client
- Supabase Edge Functions
- React Router
- React Markdown
- Vitest

## Key Files

- [`src/components/LandingPage.tsx`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/components/LandingPage.tsx): role selection entry page
- [`src/components/FileUploadStep.tsx`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/components/FileUploadStep.tsx): upload and repository intake flow
- [`src/components/Dashboard.tsx`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/components/Dashboard.tsx): main role-based workspace
- [`src/components/ChatSidebar.tsx`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/components/ChatSidebar.tsx): chat UI and contextual file attachment
- [`src/lib/chat-stream.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/lib/chat-stream.ts): frontend chat transport, streaming, and fallback behavior
- [`src/lib/github-repo.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/lib/github-repo.ts): GitHub repository parsing and extraction
- [`src/lib/project-profile.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/lib/project-profile.ts): project naming and profiling from uploaded context
- [`src/lib/chat-prompts.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/src/lib/chat-prompts.ts): role-based quick-action prompts and welcome prompts
- [`supabase/functions/bridge-chat/index.ts`](/Users/julissabarahona/Downloads/Dual-Mind-main/supabase/functions/bridge-chat/index.ts): backend prompt orchestration and AI proxy

## Current Limitations

- public GitHub repositories only
- no private repo authentication flow yet
- chat quality depends on the provided materials
- no persistent database-backed project history yet
- automated tests are still mostly missing
- repository ingestion is intentionally capped to avoid overloading the analysis context

## Recommended Next Improvements

- add real unit tests for repository parsing, validation, and prompt generation
- add integration tests for the upload flows and dashboard role switching
- support private GitHub repositories with a secure token flow
- persist project sessions beyond `sessionStorage`
- add analytics or audit logs for enterprise use cases

## Scripts

- `npm run dev` - start the local Vite dev server
- `npm run build` - create a production build
- `npm run build:dev` - create a development-mode build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm test` - run Vitest once
- `npm run test:watch` - run Vitest in watch mode
