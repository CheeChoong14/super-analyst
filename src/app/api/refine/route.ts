import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaManagedAgentsAgentMessageEvent,
  BetaManagedAgentsAgentToolUseEvent,
  BetaManagedAgentsAgentMCPToolUseEvent,
  BetaManagedAgentsSessionStatusIdleEvent,
  BetaManagedAgentsSessionStatusTerminatedEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { NextRequest } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BETA = "managed-agents-2026-04-01" as const;

function send(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: Record<string, unknown>
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { sessionId, message } = (await request.json()) as {
          sessionId: string;
          message: string;
        };

        if (!sessionId || !message) {
          send(controller, encoder, {
            type: "error",
            message: "Missing sessionId or message.",
          });
          return;
        }

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        /* ── 1. Send refinement message ─────────────────────── */
        await client.beta.sessions.events.send(sessionId, {
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: message }],
            },
          ],
          betas: [BETA],
        });

        send(controller, encoder, { type: "status", message: "Refining report…" });

        /* ── 2. Stream session events ────────────────────────── */
        const eventStream = await client.beta.sessions.events.stream(sessionId, { betas: [BETA] });

        for await (const ev of eventStream) {
          if (ev.type === "agent.message") {
            const msg = ev as BetaManagedAgentsAgentMessageEvent;
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                send(controller, encoder, {
                  type: "progress",
                  message: block.text.slice(0, 300),
                });
              }
            }
          } else if (ev.type === "agent.tool_use") {
            const tu = ev as BetaManagedAgentsAgentToolUseEvent;
            send(controller, encoder, { type: "tool", message: tu.name });
          } else if (ev.type === "agent.mcp_tool_use") {
            const tu = ev as BetaManagedAgentsAgentMCPToolUseEvent;
            send(controller, encoder, { type: "tool", message: tu.name });
          } else if (ev.type === "session.status_idle") {
            void (ev as BetaManagedAgentsSessionStatusIdleEvent);
            break;
          } else if (ev.type === "session.status_terminated") {
            void (ev as BetaManagedAgentsSessionStatusTerminatedEvent);
            throw new Error("Session terminated unexpectedly.");
          }
        }

        /* ── 3. Re-download the latest report.html ───────────── */
        send(controller, encoder, {
          type: "status",
          message: "Retrieving updated report…",
        });

        const outputs = await client.beta.files.list({
          scope_id: sessionId,
          betas: [BETA],
        });

        // Take the last report.html — agent may have written multiple versions
        const reportFiles = outputs.data.filter((f) => f.filename === "report.html");
        const reportFile = reportFiles.at(-1);

        if (!reportFile) {
          throw new Error("report.html not found after refinement.");
        }

        const downloaded = await client.beta.files.download(reportFile.id, {
          betas: [BETA],
        });

        const reportHtml = await downloaded.text();
        send(controller, encoder, { type: "report", html: reportHtml });
      } catch (err: unknown) {
        send(controller, encoder, {
          type: "error",
          message: err instanceof Error ? err.message : "An unexpected error occurred.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
