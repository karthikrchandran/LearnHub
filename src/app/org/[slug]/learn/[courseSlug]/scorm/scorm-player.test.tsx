import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScormPlayer } from "./scorm-player";

type TestScormApi = {
  LMSInitialize(value: string): string;
  LMSFinish(value: string): string;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string;
  LMSCommit(value: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
  LMSGetDiagnostic(code: string): string;
};

function launchPayload() {
  return {
    assignmentId: "assignment_1",
    packageId: "package_1",
    launchUrl: "/scorm/org/org_1/course/index.html",
    cmiData: {
      "cmi.core.lesson_status": "incomplete",
    },
    launchCount: 2,
  };
}

async function render(component: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(component);
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { container, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  delete (window as Window & { API?: TestScormApi }).API;
});

describe("ScormPlayer", () => {
  it("launches content, exposes the SCORM API bridge, and commits allowed CMI values", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/launch") {
        return Response.json(launchPayload());
      }

      expect(url).toBe("/commit");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        "cmi.core.lesson_status": "completed",
      });

      return Response.json({
        progressPercent: 100,
        completed: true,
        registration: {
          cmiData: { "cmi.core.lesson_status": "completed" },
          lessonStatus: "completed",
          scoreRaw: 95,
          launchCount: 2,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = await render(
      <ScormPlayer launchPath="/launch" commitPath="/commit" initialProgressPercent={0} initialScore={null} />,
    );
    const iframe = container.querySelector("iframe");

    expect(container.textContent).toContain("Launch count 2");
    expect(container.textContent).toContain("incomplete");
    expect(iframe?.getAttribute("src")).toBe("/scorm/org/org_1/course/index.html");

    const api = (window as Window & { API: TestScormApi }).API;

    await act(async () => {
      expect(api.LMSInitialize("")).toBe("true");
      expect(api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("true");
      expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("completed");
      expect(api.LMSSetValue("cmi.core.total_time", "99:00:00")).toBe("false");
      expect(api.LMSGetLastError()).not.toBe("0");
    });

    const commitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Commit",
    );
    expect(commitButton).toBeTruthy();

    await act(async () => {
      commitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/commit", expect.objectContaining({ method: "POST" }));
    expect(container.textContent).toContain("completed");

    await act(async () => {
      root.unmount();
    });
  });
});
