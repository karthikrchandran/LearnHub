import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/demo/video/[lessonSlug]/route";

describe("demo video route", () => {
  it("redirects local demo lesson media to a playable video asset", async () => {
    const response = await GET(new Request("http://learnhub.test/api/demo/video/invite-every-voice"), {
      params: Promise.resolve({ lessonSlug: "invite-every-voice" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(".mp4");
    expect(response.headers.get("cache-control")).toContain("public");
  });
});
