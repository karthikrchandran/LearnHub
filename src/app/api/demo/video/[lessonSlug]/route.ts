type DemoVideoRouteContext = {
  params: Promise<{
    lessonSlug: string;
  }>;
};

const demoVideoUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

export async function GET(_request: Request, { params }: DemoVideoRouteContext): Promise<Response> {
  await params;

  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=3600",
      Location: demoVideoUrl,
    },
  });
}
