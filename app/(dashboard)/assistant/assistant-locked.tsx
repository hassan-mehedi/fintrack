"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Clock, Sparkles, CheckCircle2 } from "lucide-react";
import { submitInterestRequest } from "@/lib/actions/subscription";
import { toast } from "sonner";

interface AssistantLockedProps {
  existingRequest: {
    id: string;
    status: "pending" | "approved" | "rejected";
    createdAt: Date;
  } | null;
}

export function AssistantLocked({ existingRequest }: AssistantLockedProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(
    existingRequest?.status === "pending"
  );

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await submitInterestRequest();
      setSubmitted(true);
      toast.success("Your interest has been submitted!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">AI Assistant</h1>
          <Badge variant="secondary">Pro</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Get AI-powered insights about your finances.
        </p>
      </div>

      <Card className="flex flex-1 items-center justify-center">
        <CardContent className="text-center space-y-6 max-w-md">
          {submitted ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Request Under Review</h3>
              <p className="text-sm text-muted-foreground">
                Thanks for your interest! We&apos;re reviewing your request for
                access to the AI Assistant. You&apos;ll get access once
                it&apos;s approved.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  Subscribe to use the AI Assistant
                </h3>
                <p className="text-sm text-muted-foreground">
                  The AI Assistant helps you understand your finances, track
                  spending patterns, and take actions using natural language.
                </p>
              </div>
              <div className="space-y-3 text-sm text-left">
                {[
                  "Ask questions about your spending",
                  "Create transactions with natural language",
                  "Get personalized financial insights",
                  "Check budget status instantly",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full"
                size="lg"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isSubmitting ? "Submitting..." : "I'm Interested"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
