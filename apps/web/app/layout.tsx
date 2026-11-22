import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible,
  EB_Garamond,
  Fira_Code,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  Inconsolata,
  Inter,
  JetBrains_Mono,
  Newsreader,
  STIX_Two_Text,
  Source_Code_Pro,
  Source_Sans_3,
  Source_Serif_4,
} from "next/font/google";
import Script from "next/script";
import "@/styles/globals.css";
import { cn } from "@/lib/utils";
import { RootProvider } from "./provider";

const stixTwo = STIX_Two_Text({
  variable: "--font-stix-two",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const description =
  "A local-first research LaTeX and Lean 4 workspace for mathematical papers, peer-reviewed journals, Beamer slides, TikZ diagrams, and submission packages.";

export const metadata: Metadata = {
  title: "arcanaTeX: Research LaTeX & Lean Studio",
  applicationName: "arcanaTeX",
  description,
  openGraph: {
    title: "arcanaTeX: Research LaTeX & Lean Studio",
    description,
    siteName: "arcanaTeX",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "arcanaTeX: Research LaTeX & Lean Studio",
    description,
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
      className="h-full"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body
        className={cn(
          stixTwo.variable,
          ebGaramond.variable,
          sourceSerif.variable,
          plexSerif.variable,
          newsreader.variable,
          plexSans.variable,
          sourceSans.variable,
          atkinson.variable,
          inter.variable,
          jetbrains.variable,
          ibmPlexMono.variable,
          inconsolata.variable,
          firaCode.variable,
          sourceCodePro.variable,
          "h-full font-sans antialiased",
        )}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
