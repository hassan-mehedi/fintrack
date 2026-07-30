export const LIMITS = {
    maxMessageLength: 500,
    maxVoiceDurationSec: 30,
    chatMaxPerMin: 20,
    transcribeMaxPerMin: 10,
    translateMaxPerMin: 10,
    maxAudioSizeBytes: 5 * 1024 * 1024, // 5MB
    maxJsonBodyBytes: 100 * 1024, // 100KB — generous for chat messages / form data
} as const;
