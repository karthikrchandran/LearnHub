export type PutObjectInput = {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array | string;
};

export type StoredObject = {
  key: string;
  url: string;
};

export interface ObjectStorageProvider {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getSignedReadUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
