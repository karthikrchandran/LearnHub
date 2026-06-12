"use client";

import { useRef, useState, type FormEvent } from "react";

type ScormPackageUploadFormProps = {
  action: (formData: FormData) => Promise<void> | void;
  courseId: string;
  packageId: string;
  uploadUrl: string;
};

type SignedUploadResponse = {
  key?: unknown;
  uploadUrl?: unknown;
};

export function ScormPackageUploadForm({
  action,
  courseId,
  packageId,
  uploadUrl,
}: ScormPackageUploadFormProps) {
  const uploadedRef = useRef(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (uploadedRef.current) {
      uploadedRef.current = false;
      return;
    }

    event.preventDefault();
    const form = event.currentTarget;
    const packageFile = readPackageFile(form);

    if (!packageFile) {
      setMessage("Choose a SCORM zip package before saving metadata.");
      return;
    }

    try {
      setMessage("Preparing upload...");
      const contentType = packageFile.type || "application/zip";
      const signedUpload = await createSignedUpload({
        uploadUrl,
        fileName: packageFile.name,
        contentType,
        byteSize: packageFile.size,
        courseId,
        packageId,
      });

      setMessage("Uploading package...");
      const uploadResponse = await fetch(signedUpload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: packageFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("SCORM package upload failed");
      }

      setFormValue(form, "originalFileName", packageFile.name);
      setFormValue(form, "contentType", contentType);
      setFormValue(form, "byteSize", String(packageFile.size));
      setFormValue(form, "storageKey", signedUpload.key);
      uploadedRef.current = true;
      setMessage("Saving package metadata...");
      form.requestSubmit();
    } catch (error) {
      uploadedRef.current = false;
      setMessage(error instanceof Error ? error.message : "SCORM package upload failed");
    }
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-2"
      data-scorm-upload-url={uploadUrl}
      data-scorm-upload-purpose="scorm_zip"
      data-scorm-package-id={packageId}
    >
      <h2 className="text-lg font-semibold text-slate-950 md:col-span-2">Upload zip metadata</h2>
      <input type="hidden" name="originalFileName" />
      <input type="hidden" name="contentType" />
      <input type="hidden" name="byteSize" />
      <input type="hidden" name="storageKey" />
      <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
        Upload zip
        <input name="packageFile" type="file" accept=".zip,application/zip" className="rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Launch path
        <input name="launchPath" placeholder="index.html" className="rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Manifest title
        <input name="manifestTitle" className="rounded-md border border-slate-300 px-3 py-2" />
      </label>
      {message ? <p className="text-sm font-medium text-slate-600 md:col-span-2">{message}</p> : null}
      <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white md:col-span-2">
        Save package metadata
      </button>
    </form>
  );
}

async function createSignedUpload(input: {
  uploadUrl: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  courseId: string;
  packageId: string;
}): Promise<{ key: string; uploadUrl: string }> {
  const response = await fetch(input.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose: "scorm_zip",
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      courseId: input.courseId,
      packageId: input.packageId,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to create SCORM signed upload");
  }

  const body = (await response.json()) as SignedUploadResponse;

  if (typeof body.key !== "string" || typeof body.uploadUrl !== "string") {
    throw new Error("SCORM signed upload response is invalid");
  }

  return { key: body.key, uploadUrl: body.uploadUrl };
}

function readPackageFile(form: HTMLFormElement): File | null {
  const field = form.elements.namedItem("packageFile");

  if (!(field instanceof HTMLInputElement)) {
    return null;
  }

  return field.files?.[0] ?? null;
}

function setFormValue(form: HTMLFormElement, name: string, value: string): void {
  const field = form.elements.namedItem(name);

  if (field instanceof HTMLInputElement) {
    field.value = value;
  }
}
