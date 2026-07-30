import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { LIMITS } from "@fintrack/ai/limits";

export async function transcribeRoutes(app: FastifyInstance) {
    app.post(
        "/transcribe",
        {
            preHandler: app.authenticate,
            config: {
                rateLimit: { max: LIMITS.transcribeMaxPerMin, timeWindow: "1 minute" },
            },
        },
        async (request, reply) => {
            if (!process.env.OPENAI_API_KEY) {
                return reply.code(503).send({
                    error: "Voice input is unavailable: transcription requires an OpenAI API key.",
                });
            }

            const upload = await request.file({
                limits: { fileSize: LIMITS.maxAudioSizeBytes },
            });
            if (!upload) {
                return reply.code(400).send({ error: "Missing audio file" });
            }

            const buffer = await upload.toBuffer();
            const language =
                typeof (upload.fields.language as { value?: string } | undefined)?.value ===
                "string"
                    ? (upload.fields.language as { value: string }).value
                    : undefined;

            const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const file = new File([buffer], upload.filename || "recording.m4a", {
                type: upload.mimetype || "audio/m4a",
            });

            const transcription = await client.audio.transcriptions.create({
                model: "whisper-1",
                file,
                language,
            });

            return reply.send({ text: transcription.text });
        }
    );
}
