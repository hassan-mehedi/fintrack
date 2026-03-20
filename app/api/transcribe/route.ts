import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { transcribeLimiter, LIMITS } from "@/lib/rate-limit";

const client = new OpenAI();

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limit = transcribeLimiter(session.user.id);
  if (!limit.success) {
    return Response.json(
      { error: "Rate limit exceeded. Try again shortly.", retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  const formData = await req.formData();
  const audio = formData.get("audio");
  if (!audio || !(audio instanceof Blob)) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }

  if (audio.size > LIMITS.maxAudioSizeBytes) {
    return Response.json({ error: "Audio file too large" }, { status: 400 });
  }

  const language = (formData.get("language") as string) || "en";

  // Convert Blob to File for OpenAI SDK
  const file = new File([audio], `recording.webm`, { type: audio.type || "audio/webm" });

  const transcription = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language,
  });

  return Response.json({ text: transcription.text });
}
