"use client";

import { useState, type FormEvent } from "react";

type MuxVideoUploadFormProps = {
  uploadAction: string;
  disabled?: boolean;
  disabledMessage?: string;
};

type MuxUploadResponse = {
  uploadUrl?: unknown;
  providerUploadId?: unknown;
};

export function MuxVideoUploadForm({
  uploadAction,
  disabled = false,
  disabledMessage = "Mux upload is not configured.",
}: MuxVideoUploadFormProps) {
  const [message, setMessage] = useState(disabled ? disabledMessage : "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) {
      setMessage(disabledMessage);
      return;
    }

    const file = readVideoFile(event.currentTarget);

    if (!file) {
      setMessage("Choose a video file before uploading.");
      return;
    }

    setBusy(true);

    try {
      setMessage("Creating Mux upload...");
      const muxUpload = await createMuxUpload(uploadAction);
      setMessage("Uploading video...");
      const contentType = file.type || "application/octet-stream";
      const uploadResponse = await fetch(muxUpload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Mux video upload failed");
      }

      setMessage(`Video uploaded. Mux is processing it. Upload ${muxUpload.providerUploadId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mux video upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid gap-2">
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Video file
        <input
          name="videoFile"
          type="file"
          accept="video/*,.mp4,.mov,.webm"
          disabled={disabled || busy}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || busy}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {busy ? "Uploading..." : "Upload video"}
      </button>
      {message ? <p className="text-xs font-medium text-slate-600">{message}</p> : null}
    </form>
  );
}

async function createMuxUpload(uploadAction: string): Promise<{ uploadUrl: string; providerUploadId: string }> {
  const response = await fetch(uploadAction, { method: "POST" });

  if (!response.ok) {
    throw new Error("Unable to create Mux upload");
  }

  const body = (await response.json()) as MuxUploadResponse;

  if (typeof body.uploadUrl !== "string" || typeof body.providerUploadId !== "string") {
    throw new Error("Mux upload response is invalid");
  }

  return {
    uploadUrl: body.uploadUrl,
    providerUploadId: body.providerUploadId,
  };
}

function readVideoFile(form: HTMLFormElement): File | null {
  const field = form.elements.namedItem("videoFile");

  if (!(field instanceof HTMLInputElement)) {
    return null;
  }

  return field.files?.[0] ?? null;
}
