declare module "expo-video" {
  export function useVideoPlayer(source: string | null, setup?: (player: VideoPlayer) => void): VideoPlayer;
  export function VideoView(props: Record<string, unknown>): JSX.Element;
  export type VideoPlayer = {
    loop: boolean;
    currentTime: number;
    addListener(event: "timeUpdate", listener: (event: { currentTime: number }) => void): { remove(): void };
  };
}