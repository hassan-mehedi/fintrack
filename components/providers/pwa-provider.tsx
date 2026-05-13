"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

type InstallPlatform = "android" | "desktop" | "ios" | "unknown";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface PwaContextValue {
  canInstall: boolean;
  isInstalled: boolean;
  platform: InstallPlatform;
  promptInstall: () => Promise<boolean>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

function detectPlatform(): InstallPlatform {
  if (typeof window === "undefined") {
    return "unknown";
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return "ios";
  }

  if (/android/.test(userAgent)) {
    return "android";
  }

  if (/mac|win|linux|cros/.test(userAgent)) {
    return "desktop";
  }

  return "unknown";
}

function getStandaloneStatus() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("unknown");

  useEffect(() => {
    const syncInstallState = () => {
      setIsInstalled(getStandaloneStatus());
      setPlatform(detectPlatform());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      syncInstallState();
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      toast.success("FinTrack has been installed.");
    };

    const registerServiceWorker = async () => {
      if (
        process.env.NODE_ENV === "development" ||
        !("serviceWorker" in navigator)
      ) {
        return;
      }

      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.error("Service worker registration failed", error);
      }
    };

    syncInstallState();

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleMediaChange = () => syncInstallState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    if (document.readyState === "complete") {
      void registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener
    );
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }

      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall: deferredPrompt !== null,
      isInstalled,
      platform,
      promptInstall: async () => {
        if (!deferredPrompt) {
          return false;
        }

        await deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;

        setDeferredPrompt(null);

        if (result.outcome === "dismissed") {
          toast.info("Install prompt dismissed.");
        }

        return result.outcome === "accepted";
      },
    }),
    [deferredPrompt, isInstalled, platform]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const context = useContext(PwaContext);

  if (!context) {
    throw new Error("usePwa must be used within a PwaProvider.");
  }

  return context;
}
