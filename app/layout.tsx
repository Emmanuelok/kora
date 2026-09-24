import type { Viewport } from "next";
import { rootMetadata, THEME_COLOR } from "../lib/site-metadata";
import PwaExperience from "./pwa";
import "./globals.css";
import "./fonts.css";
import "./flagship.css";
import "./pwa.css";

export const metadata = rootMetadata;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GH">
      <body className="antialiased">{children}<PwaExperience /></body>
    </html>
  );
}
