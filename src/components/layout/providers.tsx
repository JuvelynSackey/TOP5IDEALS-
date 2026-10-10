"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="top5-theme" nonce={nonce}>
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
