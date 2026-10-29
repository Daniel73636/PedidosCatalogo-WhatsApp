import { Checkout } from "@/components/checkout";
export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Checkout slug={slug} />;
}
