import { Cart } from "@/components/cart";
export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Cart slug={slug} />;
}
