export type PutObjectInput = {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array | string;
};

export type StoredObject = {
  key: string;
  url: string;
};

export type SignedWriteUrlInput = {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
};

export interface ObjectStorageProvider {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getSignedWriteUrl(input: SignedWriteUrlInput): Promise<string>;
  getSignedReadUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
