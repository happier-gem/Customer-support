"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/tickets");
    } else if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted px-4 text-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </main>
  );
}
