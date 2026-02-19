import type { Metadata } from "next";
import { Space_Grotesk, Manrope, IBM_Plex_Mono, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/providers/auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import { TagFilterProvider } from "@/providers/tag-filter-provider";
import { WorkspaceProvider } from "@/providers/workspace-provider";
import { AuthGate } from "@/components/layout/auth-gate";
import { Navbar } from "@/components/layout/navbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { ShortcutsModal } from "@/components/layout/shortcuts-modal";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AKD",
  description: "LLM Agent Benchmark Runner",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${ibmPlexMono.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased font-sans">
        <AuthProvider>
          <WorkspaceProvider>
            <QueryProvider>
              <Suspense>
                <AuthGate>
                  <TagFilterProvider>
                    <Navbar />
                    <main className="app-main">
                      <div className="app-content">{children}</div>
                    </main>
                    <CommandPalette />
                    <ShortcutsModal />
                  </TagFilterProvider>
                </AuthGate>
              </Suspense>
            </QueryProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
