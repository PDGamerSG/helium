import Link from "next/link";
import { HeliumMark } from "@/components/Mark";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-[100svh] place-items-center bg-white px-6">
      <div className="max-w-[34rem] text-center">
        <HeliumMark size={44} className="mx-auto text-coal" />
        <h1 className="t-h2 mt-8 text-coal">Nothing is recorded here.</h1>
        <p className="mt-4 text-[1.05rem] text-coal-2">This address isn&apos;t part of Helium. It may have moved, or it never existed.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-ink">
            Back to home
          </Link>
          <Link href="/workspace" className="btn btn-line">
            Open the workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
