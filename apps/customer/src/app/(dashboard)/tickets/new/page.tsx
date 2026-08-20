"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type TicketPriority } from "@/lib/api";
import { buttonClass, cardClass, errorTextClass, inputClass, labelClass, secondaryButtonClass, selectClass } from "@/lib/ui";

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 5;

type StagedImageStatus = "queued" | "uploading" | "uploaded" | "failed";

interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: StagedImageStatus;
  error?: string;
}

export default function NewTicketPage() {
  const router = useRouter();
  const { user, accessToken, status } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [images, setImages] = useState<StagedImage[]>([]);
  const [imagePickError, setImagePickError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    // Revoke object URLs on unmount so we don't leak memory.
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickImages(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setImagePickError(null);
    if (files.length === 0) return;

    if (images.length + files.length > MAX_IMAGES) {
      setImagePickError(`You can attach up to ${MAX_IMAGES} images.`);
      return;
    }

    const accepted: StagedImage[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (only JPEG, PNG, or WebP images are allowed)`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        rejected.push(`${file.name} (over 10MB)`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
      });
    }

    if (rejected.length > 0) {
      setImagePickError(`Skipped: ${rejected.join(", ")}`);
    }
    setImages((prev) => [...prev, ...accepted]);
  }

  function handleRemoveImage(id: string) {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  async function uploadStagedImages(ticketId: string, accessToken: string) {
    const results = await Promise.allSettled(
      images.map(async (img) => {
        setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, status: "uploading" } : i)));
        try {
          await api.uploadAttachment(accessToken, ticketId, img.file);
          setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, status: "uploaded" } : i)));
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Upload failed.";
          setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, status: "failed", error: message } : i)));
          throw err;
        }
      }),
    );
    return results.every((r) => r.status === "fulfilled");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const ticket = await api.createTicket(accessToken, { title, description, priority });
      setCreatedTicketId(ticket.id);

      if (images.length === 0) {
        router.push(`/tickets/${ticket.id}`);
        return;
      }

      const allUploaded = await uploadStagedImages(ticket.id, accessToken);
      if (allUploaded) {
        router.push(`/tickets/${ticket.id}`);
      }
      // If any upload failed, stay on this page so the user can see which
      // ones failed — the ticket itself was already created successfully.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-4 text-xl font-semibold text-foreground">New Ticket</h1>
      <form onSubmit={handleSubmit} className={`${cardClass} space-y-4`}>
        <div>
          <label htmlFor="title" className={labelClass}>
            Title
          </label>
          <input
            id="title"
            type="text"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Briefly describe the issue"
            disabled={Boolean(createdTicketId)}
          />
        </div>
        <div>
          <label htmlFor="description" className={labelClass}>
            Description
          </label>
          <textarea
            id="description"
            required
            minLength={10}
            maxLength={5000}
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder="Give as much detail as you can"
            disabled={Boolean(createdTicketId)}
          />
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            className={selectClass}
            disabled={Boolean(createdTicketId)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="images" className={labelClass}>
            Attach images (JPEG, PNG, or WebP — max 10MB each, up to {MAX_IMAGES})
          </label>
          <input
            id="images"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={Boolean(createdTicketId)}
            onChange={handlePickImages}
            className={inputClass}
          />
          {imagePickError && <p className={`${errorTextClass} mt-2`}>{imagePickError}</p>}

          {images.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img) => (
                <li key={img.id} className="relative overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.previewUrl} alt={img.file.name} className="h-24 w-full object-cover" />
                  <div className="flex items-center justify-between gap-1 bg-card px-2 py-1 text-xs">
                    <span className="truncate text-muted-foreground">
                      {img.status === "queued" && "Ready"}
                      {img.status === "uploading" && "Uploading…"}
                      {img.status === "uploaded" && "Uploaded ✓"}
                      {img.status === "failed" && (
                        <span className="text-danger" title={img.error}>
                          Failed
                        </span>
                      )}
                    </span>
                    {img.status !== "uploading" && img.status !== "uploaded" && (
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.id)}
                        className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${img.file.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className={errorTextClass}>{error}</p>}

        {createdTicketId && images.some((img) => img.status === "failed") ? (
          <div className="space-y-2">
            <p className={errorTextClass}>
              Your ticket was created, but some images failed to upload. You can retry them from the ticket page.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/tickets/${createdTicketId}`)}
              className={`${secondaryButtonClass} w-full`}
            >
              Continue to ticket
            </button>
          </div>
        ) : (
          <button type="submit" disabled={loading || Boolean(createdTicketId)} className={buttonClass}>
            {loading ? "Submitting…" : "Submit ticket"}
          </button>
        )}
      </form>
    </main>
  );
}
