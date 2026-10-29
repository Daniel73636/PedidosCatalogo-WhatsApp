import type { Metadata } from "next";
import { Storefront } from "@/components/storefront";

export const metadata: Metadata = { title: "Menú", openGraph: { title: "Arepa Express", description: "Pide arepas frescas en línea." } };
export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Storefront slug={slug} />;
}
