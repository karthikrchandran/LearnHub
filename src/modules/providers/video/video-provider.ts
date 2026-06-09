export type CreateVideoUploadInput = {
  organizationId: string;
  courseId: string;
  title: string;
};

export type CreateVideoUploadResult = {
  uploadUrl: string;
  providerAssetId: string;
};

export type VideoPlaybackSource = {
  providerAssetId: string;
  playbackId: string;
  playbackUrl: string;
};

export interface VideoProvider {
  createUpload(input: CreateVideoUploadInput): Promise<CreateVideoUploadResult>;
  getPlaybackSource(providerAssetId: string): Promise<VideoPlaybackSource>;
}
