import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Spectral } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const spectral = Spectral({ subsets: ["latin"], weight: ["300", "400"], style: ["italic"], variable: "--font-spectral", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Helium: the company brain that remembers what changed", template: "%s · Helium" },
  description:
    "Helium turns meetings and email into one living memory for your team and its agents: what's true now, who said it, and what it replaced. Built on Neo4j.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${spectral.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
