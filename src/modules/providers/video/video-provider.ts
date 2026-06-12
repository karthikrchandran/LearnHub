export type CreateVideoUploadInput = {
  organizationId: string;
  courseId: string;
  lessonId?: string;
  title: string;
};

export type CreateVideoUploadResult = {
  uploadUrl: string;
  providerUploadId: string;
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
