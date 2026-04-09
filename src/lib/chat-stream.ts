const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bridge-chat`;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function streamChat({
  role,
  messages,
  fileContext,
  onDelta,
  onDone,
  onError,
}: {
  role: "ba" | "dev";
  messages: ChatMessage[];
  fileContext?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    // Try streaming first, fall back to non-streaming if it fails
    let streamingWorked = false;
    try {
      streamingWorked = await tryStreaming({ role, messages, fileContext, onDelta });
    } catch {
      // Streaming failed (likely preview proxy issue), try non-streaming
      console.log("Streaming failed, falling back to non-streaming mode");
    }

    if (!streamingWorked) {
      await tryNonStreaming({ role, messages, fileContext, onDelta, onError });
    }

    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Connection failed");
  }
}

async function tryStreaming({
  role,
  messages,
  fileContext,
  onDelta,
}: {
  role: "ba" | "dev";
  messages: ChatMessage[];
  fileContext?: string;
  onDelta: (text: string) => void;
}): Promise<boolean> {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ role, messages, fileContext: fileContext || "", stream: true }),
  });

  if (resp.status === 429) throw new Error("Rate limit exceeded. Please wait a moment and try again.");
  if (resp.status === 402) throw new Error("AI credits exhausted. Please add funds in Settings → Workspace → Usage.");
  if (!resp.ok || !resp.body) throw new Error(`Server error (${resp.status})`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamDone = false;
  let gotContent = false;

  // Set a timeout - if we don't get any content within 10s, consider streaming broken
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => { if (!gotContent) reject(new Error("Stream timeout")); }, 10000);
  });

  const readPromise = (async () => {
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const json = line.slice(6).trim();
        if (json === "[DONE]") { streamDone = true; break; }

        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            gotContent = true;
            onDelta(content);
          }
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    // flush
    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const j = raw.slice(6).trim();
        if (j === "[DONE]") continue;
        try {
          const p = JSON.parse(j);
          const c = p.choices?.[0]?.delta?.content;
          if (c) { gotContent = true; onDelta(c); }
        } catch { /* ignore */ }
      }
    }
  })();

  try {
    await Promise.race([readPromise, timeoutPromise]);
  } catch {
    reader.cancel();
    if (!gotContent) return false;
  }

  // If we already got content but timed out, that's fine - wait for the rest
  if (gotContent && !streamDone) {
    await readPromise;
  }

  return gotContent;
}

async function tryNonStreaming({
  role,
  messages,
  fileContext,
  onDelta,
  onError,
}: {
  role: "ba" | "dev";
  messages: ChatMessage[];
  fileContext?: string;
  onDelta: (text: string) => void;
  onError: (error: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ role, messages, fileContext: fileContext || "", stream: false }),
  });

  if (resp.status === 429) {
    onError("Rate limit exceeded. Please wait a moment and try again.");
    return;
  }
  if (resp.status === 402) {
    onError("AI credits exhausted. Please add funds in Settings → Workspace → Usage.");
    return;
  }
  if (!resp.ok) {
    onError(`Server error (${resp.status}). Please try again.`);
    return;
  }

  const data = await resp.json();
  if (data.error) {
    onError(data.error);
    return;
  }
  if (data.content) {
    onDelta(data.content);
  }
}
