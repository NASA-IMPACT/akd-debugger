import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Roboto_Condensed } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { TagFilterProvider } from "@/providers/tag-filter-provider";
import { Navbar } from "@/components/layout/navbar";
import { ShortcutsModal } from "@/components/layout/shortcuts-modal";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const robotoCondensed = Roboto_Condensed({ subsets: ["latin"], variable: "--font-roboto-condensed" });

export const metadata: Metadata = {
  title: "Axiom",
  description: "LLM Agent Benchmark Runner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${jetbrainsMono.variable} ${robotoCondensed.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased font-sans">
        <QueryProvider>
          <Suspense>
            <TagFilterProvider>
              <Navbar />
              <main className="max-w-[1400px] mx-auto px-4 py-4 md:p-6">{children}</main>
              <ShortcutsModal />
            </TagFilterProvider>
          </Suspense>
        </QueryProvider>
      </body>
    </html>
  );
}
