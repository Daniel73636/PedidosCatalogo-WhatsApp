import type { Metadata } from "next";
import { Storefront } from "@/components/storefront";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/${slug}`;
  return {
    title: `Menú · ${name}`, description: `Pide directo a ${name}, sin comisiones.`,
    alternates: { canonical: url },
    openGraph: {
      title: `Menú de ${name}`, description: "Pide, paga y sigue tu pedido en línea.", url, type: "website", locale: "es_CO",
      images: [{ url: "/icon.svg", width: 512, height: 512, alt: `Menú de ${name}` }],
    },
  };
}
export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Storefront slug={slug} />;
}
