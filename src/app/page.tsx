"use client";

import { useCallback, useRef, useState } from "react";

type Stage = "idle" | "chat" | "running" | "done" | "error";

interface LogEntry {
  kind: "status" | "tool" | "progress" | "error";
  text: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  hidden?: boolean;
}

interface RefineMessage {
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
}

const UploadIcon = () => (
  <svg
    className="mx-auto mb-4 h-12 w-12 text-gray-500"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
    />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="h-5 w-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

const SendIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

const ChatBubbleIcon = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function parseColumns(csvText: string): string[] {
  const firstLine = csvText.split("\n")[0] ?? "";
  return firstLine
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineMessages, setRefineMessages] = useState<RefineMessage[]>([]);
  const [refineInput, setRefineInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const refineEndRef = useRef<HTMLDivElement>(null);

  const addLog = (entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const reset = () => {
    setStage("idle");
    setLogs([]);
    setReportHtml(null);
    setFileName(null);
    setCsvFile(null);
    setChatMessages([]);
    setChatInput("");
    setSessionId(null);
    setRefineOpen(false);
    setRefineMessages([]);
    setRefineInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadReport = () => {
    if (!reportHtml) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const callChatApi = async (
    filename: string,
    columns: string[],
    messages: { role: "user" | "assistant"; content: string }[]
  ): Promise<string> => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, columns, messages }),
    });
    const data = await res.json();
    return data.message as string;
  };

  const initChat = async (file: File) => {
    setIsChatLoading(true);
    try {
      const text = await file.text();
      const columns = parseColumns(text);
      const initUserContent = `I just uploaded "${file.name}". The columns are: ${columns.join(", ")}.`;

      const reply = await callChatApi(file.name, columns, [
        { role: "user", content: initUserContent },
      ]);

      setChatMessages([
        { role: "user", text: initUserContent, hidden: true },
        { role: "assistant", text: reply },
      ]);
    } catch {
      setChatMessages([
        {
          role: "assistant",
          text: "I'm ready to help plan your report. What would you like to focus on?",
        },
      ]);
    } finally {
      setIsChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || isChatLoading || !csvFile) return;

    const newUserMsg: ChatMessage = { role: "user", text };
    const nextMessages = [...chatMessages, newUserMsg];
    setChatMessages(nextMessages);
    setChatInput("");
    setIsChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const csvText = await csvFile.text();
      const columns = parseColumns(csvText);
      const apiMessages = nextMessages.map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const reply = await callChatApi(csvFile.name, columns, apiMessages);
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setIsChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  const analyze = async (file: File, requirements?: string) => {
    setStage("running");
    setLogs([]);
    setReportHtml(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);
    if (requirements) formData.append("requirements", requirements);

    let response: Response;
    try {
      response = await fetch("/api/analyze", { method: "POST", body: formData });
    } catch {
      addLog({ kind: "error", text: "Failed to reach the server." });
      setStage("error");
      return;
    }

    if (!response.body) {
      addLog({ kind: "error", text: "No response stream from server." });
      setStage("error");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "session_id":
                setSessionId(event.id as string);
                break;
              case "status":
                addLog({ kind: "status", text: event.message });
                break;
              case "tool":
                addLog({ kind: "tool", text: event.message });
                break;
              case "progress":
                addLog({ kind: "progress", text: event.message });
                break;
              case "report":
                setReportHtml(event.html);
                setStage("done");
                break;
              case "error":
                addLog({ kind: "error", text: event.message });
                setStage("error");
                break;
            }
          } catch {
            // malformed SSE chunk — skip
          }
        }
      }
    } catch (err: unknown) {
      addLog({
        kind: "error",
        text: err instanceof Error ? err.message : "Stream read error.",
      });
      setStage("error");
    }
  };

  const sendRefinement = async () => {
    const text = refineInput.trim();
    if (!text || isRefining || !sessionId) return;

    setRefineInput("");
    setIsRefining(true);

    const userMsg: RefineMessage = { role: "user", text };
    const workingMsg: RefineMessage = {
      role: "assistant",
      text: "Working on it…",
      loading: true,
    };
    setRefineMessages((prev) => [...prev, userMsg, workingMsg]);
    setTimeout(() => refineEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    let response: Response;
    try {
      response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
    } catch {
      setRefineMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, text: "Failed to reach the server.", loading: false } : m
        )
      );
      setIsRefining(false);
      return;
    }

    if (!response.body) {
      setRefineMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, text: "No response stream.", loading: false } : m
        )
      );
      setIsRefining(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let statusText = "Working on it…";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "status":
              case "progress":
                statusText = event.message as string;
                setRefineMessages((prev) =>
                  prev.map((m, i) => (i === prev.length - 1 ? { ...m, text: statusText } : m))
                );
                setTimeout(() => refineEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
                break;
              case "report":
                setReportHtml(event.html as string);
                setRefineMessages((prev) =>
                  prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, text: "Report updated!", loading: false } : m
                  )
                );
                setTimeout(() => refineEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
                break;
              case "error":
                setRefineMessages((prev) =>
                  prev.map((m, i) =>
                    i === prev.length - 1
                      ? { ...m, text: `Error: ${event.message as string}`, loading: false }
                      : m
                  )
                );
                break;
            }
          } catch {
            // malformed chunk
          }
        }
      }
    } catch (err: unknown) {
      setRefineMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, text: err instanceof Error ? err.message : "Stream error.", loading: false }
            : m
        )
      );
    } finally {
      setIsRefining(false);
    }
  };

  const generateReport = () => {
    if (!csvFile) return;
    const requirements = chatMessages
      .filter((m) => !m.hidden)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n");
    analyze(csvFile, requirements || undefined);
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a .csv file.");
      return;
    }
    setCsvFile(file);
    setFileName(file.name);
    setChatMessages([]);
    setStage("chat");
    await initChat(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  /* ── REPORT VIEW ─────────────────────────────────────────────── */
  if (stage === "done" && reportHtml) {
    return (
      <div className="relative flex h-screen flex-col bg-gray-950">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-800 px-5 py-3">
          <span className="text-sm font-semibold text-white">Data Analyst</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{fileName}</span>
            <button
              onClick={reset}
              className="rounded px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              New analysis
            </button>
            <button
              onClick={downloadReport}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
            >
              Download report
            </button>
          </div>
        </header>
        <iframe
          srcDoc={reportHtml}
          sandbox="allow-scripts"
          title="Analysis Report"
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />

        {/* Floating chat button */}
        {!refineOpen && (
          <button
            onClick={() => setRefineOpen(true)}
            title="Refine report"
            className="absolute bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-500 hover:scale-105"
          >
            <ChatBubbleIcon />
          </button>
        )}

        {/* Slide-in refine panel */}
        {refineOpen && (
          <div className="absolute right-0 top-0 bottom-0 z-10 flex w-[360px] flex-col border-l border-gray-800 bg-gray-950">
            {/* Panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
              <span className="text-sm font-semibold text-white">Refine Report</span>
              <button
                onClick={() => setRefineOpen(false)}
                className="rounded p-1 text-gray-400 transition hover:bg-gray-800 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {refineMessages.length === 0 && (
                <p className="text-center text-xs text-gray-500 pt-6">
                  Ask me to change anything in the report — charts, colours, metrics, layout.
                </p>
              )}
              {refineMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[280px] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-100"
                    }`}
                  >
                    {msg.loading ? (
                      <span className="inline-flex items-center gap-2">
                        <SpinnerIcon />
                        {msg.text}
                      </span>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}
              <div ref={refineEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-gray-800 px-3 py-3">
              <div className="flex gap-2">
                <input
                  value={refineInput}
                  onChange={(e) => setRefineInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendRefinement();
                    }
                  }}
                  placeholder="e.g. Add a trend line to the bar chart"
                  disabled={isRefining || !sessionId}
                  className="flex-1 rounded-xl bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 disabled:opacity-50"
                />
                <button
                  onClick={sendRefinement}
                  disabled={!refineInput.trim() || isRefining || !sessionId}
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-white transition hover:bg-blue-500 disabled:opacity-40"
                >
                  <SendIcon />
                </button>
              </div>
              {!sessionId && (
                <p className="mt-1.5 text-xs text-yellow-600">
                  Session expired — start a new analysis to refine.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── CHAT VIEW ───────────────────────────────────────────────── */
  if (stage === "chat") {
    const visibleMessages = chatMessages.filter((m) => !m.hidden);
    return (
      <div className="flex h-screen flex-col bg-gray-950">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-800 px-5 py-3">
          <span className="text-sm font-semibold text-white">Data Analyst</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{fileName}</span>
            <button
              onClick={reset}
              className="rounded px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              Start over
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {visibleMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-100"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-2xl px-4 py-2.5 text-sm text-gray-400">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
                      ·
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
                      ·
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
                      ·
                    </span>
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-gray-800 px-4 py-3">
            <div className="flex gap-2 items-end">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder="Tell me what you want in the report…"
                disabled={isChatLoading}
                className="flex-1 rounded-xl bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 disabled:opacity-50"
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || isChatLoading}
                className="shrink-0 rounded-xl bg-gray-700 px-3 py-2.5 text-white transition hover:bg-gray-600 disabled:opacity-40"
                title="Send"
              >
                <SendIcon />
              </button>
              <button
                onClick={generateReport}
                disabled={isChatLoading}
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                Generate Report
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Press Enter to chat · click Generate Report when ready
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── RUNNING / ERROR VIEW ────────────────────────────────────── */
  if (stage === "running" || stage === "error") {
    return (
      <div className="flex min-h-screen flex-col bg-gray-950">
        <header className="border-b border-gray-800 px-5 py-3">
          <span className="text-sm font-semibold text-white">Data Analyst</span>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
          <div className="w-full max-w-2xl">
            <div className="mb-4 flex items-center gap-3">
              {stage === "running" ? (
                <>
                  <SpinnerIcon />
                  <span className="text-sm font-medium text-white">Analyzing {fileName}…</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-red-400">Analysis failed</span>
                  <button
                    onClick={reset}
                    className="ml-auto text-xs text-blue-400 hover:text-blue-300"
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
            <div className="h-80 overflow-y-auto rounded-xl bg-gray-900 p-4">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`mb-1 font-mono text-xs leading-5 ${
                    log.kind === "status"
                      ? "text-blue-400"
                      : log.kind === "tool"
                        ? "text-yellow-400"
                        : log.kind === "error"
                          ? "text-red-400"
                          : "text-gray-400"
                  }`}
                >
                  {log.kind === "tool" && <span className="mr-1 text-yellow-600">$</span>}
                  {log.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── IDLE VIEW ───────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <header className="border-b border-gray-800 px-5 py-3">
        <span className="text-sm font-semibold text-white">Data Analyst</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="w-full max-w-md">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed px-10 py-14 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-500/10"
                : "border-gray-700 hover:border-gray-500 hover:bg-gray-900/60"
            }`}
          >
            <UploadIcon />
            <p className="mb-1 text-base font-medium text-white">Drop your CSV here</p>
            <p className="text-sm text-gray-500">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
