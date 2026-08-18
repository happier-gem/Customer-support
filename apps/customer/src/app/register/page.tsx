"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Phase 10: customer registration no longer accepts a free-typed
 * organization id (see RegisterCustomerDto's doc comment) — an account can
 * only be created through a resolved join link/QR/code, so this route just
 * forwards to the code-entry landing page.
 */
export default function RegisterRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/join");
  }, [router]);
  return null;
}
