import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";

const kameleonDisplay = Cormorant_Garamond({
  variable: "--font-kameleon-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kameleon",
  description: "Kameleon — every pour is a transformation.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0908",
};

export default function KameleonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${kameleonDisplay.variable} min-h-dvh w-full overflow-x-hidden bg-kameleon-bg text-kameleon-text`}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>
  );
}
