import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  maxDuration: 60, // seconds — needed for streaming on Vercel
};

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert automotive research assistant for VehicleIQ, a vehicle research and comparison tool. Your role is to help users make informed vehicle purchase decisions.

You have deep knowledge of:
- Vehicle reliability data, common problems, and long-term ownership costs
- Performance specs, real-world fuel economy, and towing/payload capacity
- Safety ratings (NHTSA, IIHS) and standard/optional safety features
- Trim levels, option packages, and best value configurations
- Competitive comparisons within vehicle classes
- YouTube reviewers and publications worth trusting (e.g., Consumer Reports, Car and Driver, Motor Trend, Doug DeMuro, Throttle House)

Guidelines:
- Write in plain conversational prose — no bullet points, no hyphens, no asterisks, no markdown formatting
- Keep responses short and direct, 2-4 sentences max unless the user asks for more detail
- Sound like a knowledgeable friend, not a spec sheet
- Acknowledge when you are uncertain or when data may be outdated
- Suggest specific YouTube channels or articles when relevant
- Flag any known recalls or widespread issues naturally in conversation`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, vehicleContext } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    vehicleContext?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // Validate each message is well-formed and cap content length
  const MAX_MSG_LENGTH = 8000;
  const validRoles = new Set(["user", "assistant"]);
  const safeMessages = messages
    .slice(-20) // keep only the last 20 to prevent token abuse
    .filter(
      (m) =>
        m &&
        typeof m.role === "string" &&
        validRoles.has(m.role) &&
        typeof m.content === "string" &&
        m.content.length > 0,
    )
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MSG_LENGTH),
    }));

  if (safeMessages.length === 0) {
    return res.status(400).json({ error: "No valid messages provided" });
  }

  // Truncate vehicleContext to prevent overly long or injected system-prompt additions
  const safeContext =
    typeof vehicleContext === "string"
      ? vehicleContext.slice(0, 500)
      : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const systemText = safeContext
      ? `${SYSTEM_PROMPT}\n\n${safeContext}`
      : SYSTEM_PROMPT;

    const stream = anthropic.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: systemText,
      messages: safeMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  } finally {
    res.end();
  }
}
