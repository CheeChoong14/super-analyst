"use client";

import { useCallback, useRef, useState } from "react";

type Stage = "idle" | "running" | "done" | "error";

interface LogEntry {
  kind: "status" | "tool" | "progress" | "error";
  text: string;
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

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const reset = () => {
    setStage("idle");
    setLogs([]);
    setReportHtml(null);
    setFileName(null);
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

  const analyze = async (file: File) => {
    setStage("running");
    setLogs([]);
    setReportHtml(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

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

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a .csv file.");
      return;
    }
    analyze(file);
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
      <div className="flex h-screen flex-col bg-gray-950">
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
      </div>
    );
  }

  /* ── MAIN VIEW ───────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <header className="border-b border-gray-800 px-5 py-3">
        <span className="text-sm font-semibold text-white">Data Analyst</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        {/* Upload card — always visible */}
        {stage === "idle" && (
          <div className="w-full max-w-md">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
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
              <p className="mb-1 text-base font-medium text-white">
                Drop your CSV here
              </p>
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
        )}

        {/* Progress panel */}
        {(stage === "running" || stage === "error") && (
          <div className="w-full max-w-2xl">
            <div className="mb-4 flex items-center gap-3">
              {stage === "running" ? (
                <>
                  <SpinnerIcon />
                  <span className="text-sm font-medium text-white">
                    Analyzing {fileName}…
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-red-400">
                    Analysis failed
                  </span>
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
        )}
      </main>
    </div>
  );
}
