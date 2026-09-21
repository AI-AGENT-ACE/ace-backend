export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export type StoredFile = { storedName: string; storagePath: string };

export interface StorageService {
  save(relativeDirectory: string, extension: string, contents: Buffer): Promise<StoredFile>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
  absolutePath(storagePath: string): string;
}
