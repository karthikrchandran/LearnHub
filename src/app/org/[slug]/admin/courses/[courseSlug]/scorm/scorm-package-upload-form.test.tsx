import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScormPackageUploadForm } from "./scorm-package-upload-form";

async function render(component: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(component);
  });

  return { container, root };
}

describe("ScormPackageUploadForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("keeps package uploads disabled when R2 is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const action = vi.fn();
    const { container, root } = await render(
      <ScormPackageUploadForm
        action={action}
        courseId="course_1"
        packageId="pkg_course_1"
        uploadUrl="/storage/upload"
        disabled
        disabledMessage="R2 storage is missing."
      />,
    );
    const button = container.querySelector("button");

    expect(button?.getAttribute("disabled")).not.toBeNull();
    expect(container.textContent).toContain("R2 storage is missing.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
