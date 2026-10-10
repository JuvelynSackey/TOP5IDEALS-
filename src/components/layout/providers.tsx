"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="top5-theme">
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ classNames: { toast: "!rounded-lg !border-border !bg-surface !text-foreground" } }}
      />
    </ThemeProvider>
  );
}
