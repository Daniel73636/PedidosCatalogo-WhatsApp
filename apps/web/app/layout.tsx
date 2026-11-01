import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Arepa Express", template: "%s | Arepa Express" },
  description: "Pide arepas frescas a domicilio o para recoger.",
  manifest: "/manifest.webmanifest",
  applicationName: "Pedidos",
  appleWebApp: { capable: true, title: "Pedidos" },
};
export const viewport: Viewport = { themeColor: "#e4572e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
