import type { Metadata } from "next";
import { Suspense } from "react";
import { Shell } from "@/components/workspace/Shell";

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const name = tenant.charAt(0).toUpperCase() + tenant.slice(1);
  return { title: `${name} workspace` };
}

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <Suspense>
      <Shell key={tenant} tenant={tenant}>{children}</Shell>
    </Suspense>
  );
}
