import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogoffLink } from "./logoff-link";

const signOutMock = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: (input: unknown) => signOutMock(input),
}));

async function render(component: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(component);
  });

  return { container, root };
}

describe("LogoffLink", () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("signs out through NextAuth and returns to login", async () => {
    const { container, root } = await render(<LogoffLink />);
    const button = container.querySelector("button");

    expect(button?.textContent).toContain("Log off");
    expect(button?.getAttribute("type")).toBe("button");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });

    await act(async () => {
      root.unmount();
    });
  });
});
