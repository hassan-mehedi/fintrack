"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Send, Bot, User, Loader2, Mic, Square, Languages } from "lucide-react";
import { toast } from "sonner";
import { LIMITS } from "@/lib/rate-limit";
import { validateMessage } from "@/lib/chat-guardrails";

type VoiceLang = "en" | "bn";

const LANG_LABELS: Record<VoiceLang, string> = {
  en: "EN",
  bn: "বাং",
};

// --- MediaRecorder + Whisper hook ---

function getPreferredMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

function useWhisperRecording(
  onResult: (text: string) => void,
  lang: VoiceLang
) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !getPreferredMimeType()) {
      setIsSupported(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timerRef.current = null;
    timeoutRef.current = null;
    setSeconds(0);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }, []);

  const sendToWhisper = useCallback(
    async (blob: Blob) => {
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", blob);
        formData.append("language", lang);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (res.status === 429) {
          toast.error("Voice limit reached. Please wait a moment.");
          return;
        }

        if (!res.ok) {
          toast.error("Transcription failed. Please try again.");
          return;
        }

        const data = await res.json();
        if (data.text) onResult(data.text);
      } catch {
        toast.error("Transcription failed. Please try again.");
      } finally {
        setIsTranscribing(false);
      }
    },
    [lang, onResult]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getPreferredMimeType()!;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Release mic
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size > 0) {
          sendToWhisper(blob);
        }
      };

      recorder.start();
      setIsRecording(true);
      setSeconds(0);

      // Count seconds
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);

      // Auto-stop at max duration
      timeoutRef.current = setTimeout(() => {
        stopRecording();
      }, LIMITS.maxVoiceDurationSec * 1000);
    } catch {
      toast.error("Microphone access denied.");
    }
  }, [sendToWhisper, stopRecording]);

  const toggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { isRecording, seconds, isTranscribing, isSupported, toggle };
}

// --- Main component ---

export function AssistantChat() {
  const [input, setInput] = useState("");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en");

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleTranscriptionResult = useCallback(
    async (transcript: string) => {
      if (voiceLang === "bn") {
        // Translate Bangla → English
        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcript }),
          });
          if (res.ok) {
            const data = await res.json();
            setInput((prev) =>
              prev ? prev + " " + data.translated : data.translated
            );
            return;
          }
        } catch {
          // fallthrough to raw text
        }
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      } else {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      }
    },
    [voiceLang]
  );

  const { isRecording, seconds, isTranscribing, isSupported, toggle: toggleMic } =
    useWhisperRecording(handleTranscriptionResult, voiceLang);

  const isLoading = status === "streaming" || status === "submitted";
  const isBusy = isLoading || isTranscribing;

  const toggleLang = () => {
    setVoiceLang((l) => (l === "en" ? "bn" : "en"));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;

    const validation = validateMessage(trimmed);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    sendMessage({ text: trimmed });
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({ text: suggestion });
  };

  const charCount = input.length;
  const showCharCount = charCount > LIMITS.maxMessageLength * 0.7;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions about your finances or create transactions and accounts.
        </p>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-3 max-w-md">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">FinTrack Assistant</h3>
                <p className="text-sm text-muted-foreground">
                  I can help you understand your finances and take actions.
                </p>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Ask about your finances
                    </p>
                    <div className="space-y-2">
                      {[
                        "How am I doing this month?",
                        "What are my biggest expenses?",
                        "Show me my account balances",
                        "Am I over budget on anything?",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="block w-full rounded-lg border p-2 text-left hover:bg-muted transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Take an action
                    </p>
                    <div className="space-y-2">
                      {[
                        "Add a $50 expense for food",
                        "Create a new bank account",
                        "Record a transfer of $100",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="block w-full rounded-lg border p-2 text-left hover:bg-muted transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => {
            const hasText = message.parts?.some(
              (p) => p.type === "text" && p.text.trim()
            );
            if (message.role === "assistant" && !hasText) return null;

            return (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.parts?.map((part, i) => {
                    if (part.type === "text") {
                      return <span key={i}>{part.text}</span>;
                    }
                    return null;
                  })}
                </div>
                {message.role === "user" && (
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}

          {isLoading && (() => {
            const lastMsg = messages[messages.length - 1];
            const hasVisibleContent = lastMsg?.role === "assistant" &&
              lastMsg.parts?.some((p) => p.type === "text" && p.text.trim());
            if (hasVisibleContent) return null;
            return (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Input area */}
        <div className="border-t">
          <form onSubmit={handleSubmit} className="p-4 flex gap-2">
            <div className="relative flex-1">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={LIMITS.maxMessageLength}
                placeholder={
                  isTranscribing
                    ? "Transcribing..."
                    : isRecording
                    ? `Recording (${LANG_LABELS[voiceLang]})...`
                    : "Ask about your finances..."
                }
                disabled={isBusy}
                className="w-full rounded-lg border bg-background px-4 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {showCharCount && (
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${
                    charCount >= LIMITS.maxMessageLength
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {charCount}/{LIMITS.maxMessageLength}
                </span>
              )}
            </div>
            {isSupported && (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={toggleLang}
                        disabled={isRecording || isBusy}
                        className="shrink-0 gap-1.5 px-2.5 text-xs font-semibold"
                      >
                        <Languages className="h-4 w-4" />
                        {LANG_LABELS[voiceLang]}
                      </Button>
                    }
                  />
                  <TooltipContent>
                    Voice: {voiceLang === "en" ? "English" : "Bangla"} (click to switch)
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size={isRecording ? "default" : "icon"}
                        variant={isRecording ? "destructive" : "outline"}
                        onClick={toggleMic}
                        disabled={isBusy && !isRecording}
                        className={`shrink-0 ${isRecording ? "gap-1.5 px-3" : ""}`}
                      >
                        {isRecording ? (
                          <>
                            <Square className="h-3.5 w-3.5 fill-current" />
                            <span className="text-xs tabular-nums">
                              0:{seconds.toString().padStart(2, "0")} / 0:{LIMITS.maxVoiceDurationSec}
                            </span>
                          </>
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {isRecording ? "Stop recording" : "Voice input"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <Button
              type="submit"
              size="icon"
              disabled={isBusy || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="px-4 pb-3 -mt-1 text-[11px] text-muted-foreground">
            {LIMITS.maxMessageLength} char limit
            {isSupported && <> &middot; {LIMITS.maxVoiceDurationSec}s max voice</>}
            {" "}&middot; {LIMITS.chatMaxPerMin} msgs/min &middot; Finance topics only
          </p>
        </div>
      </Card>
    </div>
  );
}
