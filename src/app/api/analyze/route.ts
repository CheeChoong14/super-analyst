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

const SYSTEM_PROMPT = `You are a senior data analyst producing a publication-quality report.

## Style
- Professional and precise. Let the data speak with concrete numbers.
- Short paragraphs (2–3 sentences) between charts.
- Lead with the most actionable finding.

## Execution
- Write .py scripts and run them with \`python3 script.py\`.
- Sample large tables (\`nrows=\` / \`.sample()\`) instead of loading everything.
- Sanity-check key metrics before building narrative around them.

## Charts
- Build each chart as its own \`go.Figure()\`, embed with
  \`fig.to_html(include_plotlyjs=False, full_html=False)\`, and load Plotly
  from the CDN once in <head>.
- Always set \`marker_color\` and \`template='simple_white'\`.

## Output
Write a single self-contained \`report.html\` to /mnt/session/outputs/
with inline CSS, 3+ embedded Plotly charts, and a closing section of
actionable recommendations. Confirm "Saved: report.html" when done.`;

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
        /* ── 1. Parse upload ────────────────────────────────── */
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file || !file.name.toLowerCase().endsWith(".csv")) {
          send(controller, encoder, {
            type: "error",
            message: "Please upload a valid .csv file.",
          });
          return;
        }

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        /* ── 2. Upload CSV to Anthropic Files API ────────────── */
        send(controller, encoder, { type: "status", message: "Uploading CSV…" });

        const dataset = await client.beta.files.upload({ file, betas: [BETA] });

        /* ── 3. Create environment ───────────────────────────── */
        send(controller, encoder, {
          type: "status",
          message: "Provisioning environment…",
        });

        const env = await client.beta.environments.create({
          name: `data-analyst-env-${Date.now()}`,
          config: {
            type: "cloud",
            networking: { type: "unrestricted" },
            packages: { pip: ["pandas", "plotly"] },
          },
          betas: [BETA],
        });

        /* ── 4. Create agent ─────────────────────────────────── */
        const agent = await client.beta.agents.create({
          name: `data-analyst-${Date.now()}`,
          model: "claude-sonnet-4-6",
          system: SYSTEM_PROMPT,
          tools: [
            {
              type: "agent_toolset_20260401",
              default_config: {
                enabled: true,
                permission_policy: { type: "always_allow" },
              },
              configs: [
                { name: "web_search", enabled: false },
                { name: "web_fetch", enabled: false },
              ],
            },
          ],
          betas: [BETA],
        });

        /* ── 5. Create session with mounted file ─────────────── */
        send(controller, encoder, { type: "status", message: "Starting session…" });

        const mountPath = `/mnt/session/uploads/${file.name}`;

        const session = await client.beta.sessions.create({
          environment_id: env.id,
          agent: { type: "agent", id: agent.id, version: agent.version },
          resources: [{ type: "file", file_id: dataset.id, mount_path: mountPath }],
          title: `Analysis: ${file.name}`,
          betas: [BETA],
        });

        /* ── 5b. Emit session ID so the client can refine later ─ */
        send(controller, encoder, { type: "session_id", id: session.id });

        /* ── 6. Send analysis prompt ─────────────────────────── */
        const requirements = formData.get("requirements") as string | null;

        const requirementsSection = requirements
          ? `## User's specific requirements\n${requirements}\n\nAddress these requirements directly, and also cover:`
          : "Perform a comprehensive analysis covering:";

        const prompt = `Analyze the data in ${mountPath}.

${requirementsSection}
1. Data overview — shape, columns, types, missing values
2. Key statistical summaries for numeric columns
3. Trends, distributions, and notable patterns
4. Correlations or outliers worth highlighting
5. Actionable insights and concrete recommendations

Produce a comprehensive report.html per your system instructions.`;

        await client.beta.sessions.events.send(session.id, {
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: prompt }],
            },
          ],
          betas: [BETA],
        });

        send(controller, encoder, { type: "status", message: "Analyzing data…" });

        /* ── 7. Stream session events ────────────────────────── */
        const eventStream = await client.beta.sessions.events.stream(session.id, { betas: [BETA] });

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

        /* ── 8. Retrieve report.html ─────────────────────────── */
        send(controller, encoder, { type: "status", message: "Retrieving report…" });

        const outputs = await client.beta.files.list({
          scope_id: session.id,
          betas: [BETA],
        });

        const reportFile = outputs.data.find((f) => f.filename === "report.html");

        if (!reportFile) {
          throw new Error(
            "report.html not found in session outputs. The agent may not have written it to /mnt/session/outputs/."
          );
        }

        const downloaded = await client.beta.files.download(reportFile.id, {
          betas: [BETA],
        });

        const reportHtml = await downloaded.text();

        send(controller, encoder, { type: "report", html: reportHtml });

        /* ── 9. Keep session alive for follow-up refinements ─── */
        // Session is intentionally not archived here so /api/refine can reuse it.
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
