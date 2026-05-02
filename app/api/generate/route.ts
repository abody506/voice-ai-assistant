import { NextRequest, NextResponse } from "next/server";

const HF_API_URL =
  "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

function buildPrompt(instruction: string): string {
  return (
    "<s>[INST] You are an expert front-end developer.\n" +
    "When the user describes a UI component or web page, respond with ONLY a valid JSON object.\n" +
    "No markdown fences, no explanation, no extra text - ONLY the raw JSON.\n\n" +
    'The JSON must have exactly two keys:\n' +
    '1. "spoken_summary": A short 1-2 sentence description of what you built.\n' +
    '2. "html_code": A complete self-contained HTML document using Tailwind CSS via CDN.\n\n' +
    "Rules for html_code:\n" +
    '- Include <script src="https://cdn.tailwindcss.com"></script> in <head>\n' +
    "- Use only Tailwind classes, make it beautiful with gradients and shadows\n" +
    "- Full document from <!DOCTYPE html> to </html>\n" +
    "- No external images, use CSS gradients instead\n\n" +
    "Output ONLY the JSON. Example:\n" +
    '{"spoken_summary":"I built a red button.","html_code":"<!DOCTYPE html>..."}\n\n' +
    "User request: " + instruction + " [/INST]"
  );
}

export async function POST(req: NextRequest) {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "HUGGINGFACE_API_TOKEN environment variable is not set." },
      { status: 500 }
    );
  }

  let userPrompt: string;
  try {
    const body = await req.json();
    userPrompt = (body.prompt ?? "").trim();
    if (!userPrompt) throw new Error("empty");
  } catch {
    return NextResponse.json(
      { error: "Invalid request body. Expected { prompt: string }" },
      { status: 400 }
    );
  }

  let hfRes: Response;
  try {
    hfRes = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: buildPrompt(userPrompt),
        parameters: {
          max_new_tokens: 2048,
          temperature: 0.4,
          top_p: 0.9,
          do_sample: true,
          return_full_text: false,
        },
      }),
    });
  } catch (networkErr) {
    console.error("Network error:", networkErr);
    return NextResponse.json(
      { error: "Could not reach Hugging Face API." },
      { status: 502 }
    );
  }

  if (!hfRes.ok) {
    const errText = await hfRes.text();
    console.error(`HF API ${hfRes.status}:`, errText);
    if (hfRes.status === 401)
      return NextResponse.json({ error: "Invalid Hugging Face token." }, { status: 401 });
    if (hfRes.status === 503)
      return NextResponse.json(
        { error: "Model is loading. Please wait 30 seconds and try again." },
        { status: 503 }
      );
    return NextResponse.json(
      { error: `Hugging Face returned ${hfRes.status}: ${errText.slice(0, 300)}` },
      { status: hfRes.status }
    );
  }

  let rawContent: string;
  try {
    const data = await hfRes.json();
    rawContent = Array.isArray(data)
      ? (data[0]?.generated_text ?? "")
      : (data?.generated_text ?? "");
    if (!rawContent) throw new Error("empty generated_text");
  } catch (e) {
    console.error("Failed to parse HF response:", e);
    return NextResponse.json(
      { error: "Unexpected response format from Hugging Face." },
      { status: 502 }
    );
  }

  let parsed: { spoken_summary: string; html_code: string };
  try {
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no JSON found");

    parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed.spoken_summary || !parsed.html_code)
      throw new Error("missing keys");
  } catch {
    console.warn("Model did not return valid JSON. Raw:", rawContent.slice(0, 300));
    parsed = {
      spoken_summary: "I generated a response. Showing the raw output in the preview.",
      html_code: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-900 text-white p-8 font-mono">
<pre class="whitespace-pre-wrap text-sm text-green-400">${rawContent
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body></html>`,
    };
  }

  return NextResponse.json(parsed);
}
