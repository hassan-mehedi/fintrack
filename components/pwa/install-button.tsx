"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { usePwa } from "@/components/providers/pwa-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "onClick"
>;

const instructionContent = {
  android: {
    title: "Install on Android",
    description:
      "If the install prompt does not appear automatically, open your browser menu and choose Install app or Add to Home screen.",
  },
  desktop: {
    title: "Install on Desktop",
    description:
      "In Chromium-based browsers, use the install icon in the address bar or open the browser menu and choose Install FinTrack.",
  },
  ios: {
    title: "Install on iPhone or iPad",
    description:
      "Open FinTrack in Safari, tap the Share button, then choose Add to Home Screen to install it like an app.",
  },
  unknown: {
    title: "Install FinTrack",
    description:
      "Use your browser's app menu or share menu and look for Install app or Add to Home screen.",
  },
} as const;

export function PwaInstallButton({
  className,
  size = "sm",
  variant = "outline",
  ...props
}: ButtonProps) {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const { canInstall, isInstalled, platform, promptInstall } = usePwa();

  const instructions = useMemo(
    () => instructionContent[platform] ?? instructionContent.unknown,
    [platform]
  );

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (canInstall) {
      const accepted = await promptInstall();

      if (accepted) {
        return;
      }
    }

    setInstructionsOpen(true);
  };

  return (
    <>
      <Button
        className={className}
        size={size}
        variant={variant}
        onClick={() => void handleClick()}
        {...props}
      >
        <Download className="h-4 w-4" />
        Install App
      </Button>

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{instructions.title}</DialogTitle>
            <DialogDescription>{instructions.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  );
}
