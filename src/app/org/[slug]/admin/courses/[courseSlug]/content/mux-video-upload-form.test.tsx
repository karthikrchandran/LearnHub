import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MuxVideoUploadForm } from "./mux-video-upload-form";

async function render(component: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(component);
  });

  return { container, root };
}

function attachFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
}

describe("MuxVideoUploadForm", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("creates a direct upload and PUTs the selected video file to Mux", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ uploadUrl: "https://storage.mux.test/upload", providerUploadId: "upload_1" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await render(<MuxVideoUploadForm uploadAction="/mux-upload" />);
    const fileInput = container.querySelector<HTMLInputElement>('input[name="videoFile"]');
    const form = container.querySelector("form");

    expect(fileInput).not.toBeNull();
    attachFile(fileInput!, new File(["video"], "policy.mp4", { type: "video/mp4" }));

    await act(async () => {
      form?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/mux-upload", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://storage.mux.test/upload",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
      }),
    );
    expect(container.textContent).toContain("Video uploaded. Mux is processing it.");
    expect(container.textContent).toContain("upload_1");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps uploads disabled when Mux is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await render(
      <MuxVideoUploadForm uploadAction="/mux-upload" disabled disabledMessage="Mux credentials are missing." />,
    );
    const button = container.querySelector("button");

    expect(button?.getAttribute("disabled")).not.toBeNull();
    expect(container.textContent).toContain("Mux credentials are missing.");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
