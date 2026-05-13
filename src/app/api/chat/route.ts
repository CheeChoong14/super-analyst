import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { filename, columns, messages } = body as {
    filename: string;
    columns: string[];
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const systemPrompt = `You are a friendly data analyst assistant helping the user plan their analysis report.

The user has uploaded "${filename}" with these columns: ${columns.join(", ")}.

Your job:
- Help the user clarify what they want to see in the report (charts, metrics, comparisons, filters, time ranges, etc.)
- Suggest interesting analyses based on the column names
- Ask a clarifying question if their request is vague
- Keep responses concise and conversational — 2 to 4 sentences max
- When you feel requirements are clear enough, let them know they can click "Generate Report"

Do NOT write code or generate the actual report. Just plan it with the user.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return Response.json({ message: text });
}
