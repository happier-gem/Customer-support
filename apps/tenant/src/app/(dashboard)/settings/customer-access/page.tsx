"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type JoinLink } from "@/lib/api";
import { buttonClass, cardClass, dangerButtonClass, errorTextClass, secondaryButtonClass, successTextClass } from "@/lib/ui";

export default function CustomerAccessPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();
  const qrRef = useRef<HTMLCanvasElement>(null);

  const [link, setLink] = useState<JoinLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && user && user.role !== "TENANT_OWNER") {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken || user?.role !== "TENANT_OWNER") return;
    let cancelled = false;
    api
      .getCustomerAccessLink(accessToken)
      .then((data) => {
        if (!cancelled) setLink(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the customer join link.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, accessToken, user]);

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    if (!accessToken) return;
    if (!confirm("Regenerating will invalidate the current link, code, and QR code — anyone who hasn't joined yet will need the new one. Continue?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const updated = await api.regenerateCustomerAccessLink(accessToken);
      setLink(updated);
      setSuccess("A new join link, code, and QR code have been generated. The previous one no longer works.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate the join link.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!accessToken) return;
    if (!confirm("This will stop the current link, code, and QR code from working until you regenerate a new one. Continue?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const updated = await api.revokeCustomerAccessLink(accessToken);
      setLink(updated);
      setSuccess("The customer join link has been revoked.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke the join link.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadQr() {
    const canvas = qrRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "customer-join-qr-code.png";
    a.click();
  }

  if (status === "loading" || loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!user || user.role !== "TENANT_OWNER" || !link) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Customer access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share this link, code, or QR code so customers can find and join your organization's support portal.
        </p>
      </div>

      <section className={`${cardClass} space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Status</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              link.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {link.isActive ? "Active" : "Revoked"}
          </span>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Customer join link</label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link.joinUrl}
              className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
            <button type="button" onClick={handleCopy} className={secondaryButtonClass}>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Organization code</label>
          <p className="text-2xl font-semibold tracking-widest text-foreground">{link.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">Customers can type this code manually if they can't use the link or QR code.</p>
        </div>

        {error && <p className={errorTextClass}>{error}</p>}
        {success && <p className={successTextClass}>{success}</p>}

        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" onClick={handleRegenerate} disabled={busy} className={secondaryButtonClass}>
            Regenerate link
          </button>
          {link.isActive && (
            <button type="button" onClick={handleRevoke} disabled={busy} className={dangerButtonClass}>
              Revoke link
            </button>
          )}
        </div>
      </section>

      <section className={`${cardClass} space-y-4`}>
        <h2 className="text-sm font-semibold text-foreground">QR code</h2>
        <p className="text-sm text-muted-foreground">Print this or display it wherever customers can scan it with their phone.</p>
        <div className="flex justify-center rounded-lg border border-border bg-card p-6">
          <QRCodeCanvas ref={qrRef} value={link.joinUrl} size={220} level="M" includeMargin />
        </div>
        <button type="button" onClick={handleDownloadQr} className={buttonClass}>
          Download QR code
        </button>
      </section>
    </main>
  );
}
