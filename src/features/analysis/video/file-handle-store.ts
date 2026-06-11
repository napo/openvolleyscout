/**
 * Persistence for File System Access API handles of match videos.
 *
 * Browsers cannot reopen a file from a stored path, but Chromium-based ones
 * can persist a FileSystemFileHandle in IndexedDB and reopen the same file in
 * a later session after the user confirms a permission prompt. The handles
 * live in their own database (they are structured-cloneable but must never go
 * through the JSON serialization used for match projects).
 */

export interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

declare global {
  interface FileSystemFileHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface Window {
    showOpenFilePicker?(options?: {
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle[]>;
  }
}

const DB_NAME = 'ovs-video-file-handles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open video handle database'));
  });
}

async function withHandleStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openHandleDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Video handle store operation failed'));
    });
  } finally {
    db.close();
  }
}

export async function saveVideoFileHandle(projectId: string, handle: FileSystemFileHandle): Promise<void> {
  await withHandleStore('readwrite', (store) => store.put(handle, projectId));
}

export async function loadVideoFileHandle(projectId: string): Promise<FileSystemFileHandle | null> {
  const handle = await withHandleStore<FileSystemFileHandle | undefined>('readonly', (store) => store.get(projectId));
  return handle ?? null;
}

export async function deleteVideoFileHandle(projectId: string): Promise<void> {
  await withHandleStore('readwrite', (store) => store.delete(projectId));
}
