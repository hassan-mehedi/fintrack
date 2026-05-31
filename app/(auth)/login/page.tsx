"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PasswordInput } from "@/components/auth/password-input";
import { loginSchema, type LoginInput } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";

type Step = "credentials" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>("credentials");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signInAttempt = async (totpCode?: string, recoveryCode?: string) => {
    const data = form.getValues();
    return signIn("credentials", {
      email: data.email,
      password: data.password,
      totpCode: totpCode ?? "",
      recoveryCode: recoveryCode ?? "",
      redirect: false,
    });
  };

  async function onSubmitCredentials(data: LoginInput) {
    setIsLoading(true);
    setError("");
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });
    setIsLoading(false);

    if (!result?.error) {
      router.push("/");
      router.refresh();
      return;
    }

    // NextAuth surfaces the thrown Error's message as result.error.
    // We use "TOTP_REQUIRED" to mean "password OK, second factor needed".
    if (result.error.includes("TOTP_REQUIRED")) {
      setStep("totp");
      setError("");
    } else if (result.error.includes("Too many login")) {
      setError("Too many login attempts. Please try again later.");
    } else {
      setError("Invalid email or password");
    }
  }

  async function onSubmitTotp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    const result = await signInAttempt(
      useRecovery ? undefined : code,
      useRecovery ? code : undefined,
    );
    setIsLoading(false);
    if (!result?.error) {
      router.push("/");
      router.refresh();
      return;
    }
    setError(useRecovery ? "Recovery code didn't match" : "Authenticator code didn't match");
  }

  if (step === "totp") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            <span className="text-primary">Fin</span>Track
          </CardTitle>
          <CardDescription>Enter your authenticator code</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmitTotp} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Input
              autoFocus
              inputMode={useRecovery ? "text" : "numeric"}
              placeholder={useRecovery ? "XXXX-XXXX-XXXX-XXXX" : "123456"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={useRecovery ? 19 : 6}
            />
            <Button type="submit" className="w-full" disabled={isLoading || !code.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify
            </Button>
            <button
              type="button"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
                setError("");
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {useRecovery ? "Use authenticator code instead" : "Use a recovery code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setCode("");
                setUseRecovery(false);
                setError("");
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          <span className="text-primary">Fin</span>Track
        </CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitCredentials)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
