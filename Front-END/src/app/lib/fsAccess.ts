// src/app/lib/fsAccess.ts

// File System Access API (Chrome / Edge). In other browsers, fall back to download.

export type DirectoryHandle = any;

export function isFsAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === "function";
}

export async function pickDirectory(): Promise<DirectoryHandle> {
  // @ts-ignore
  return await window.showDirectoryPicker();
}

async function verifyPermission(handle: any, readWrite: boolean) {
  const options: any = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  // Check if permission was already granted. If so, return true.
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  // Request permission. If the user grants permission, return true.
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  // The user didn't grant permission, so return false.
  return false;
}

export async function saveBlobToDirectory(
  dir: DirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  try {
    // Ensure we have write permission
    const hasPermission = await verifyPermission(dir, true);
    if (!hasPermission) {
      throw new Error("Permission denied by user");
    }

    // @ts-ignore
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (e) {
    console.error("Failed to save to directory, falling back to download", e);
    downloadBlob(blob, filename);
  }
}

export async function saveTextFile(
  dir: DirectoryHandle | null,
  filename: string,
  content: string,
): Promise<void> {
  const blob = new Blob([content], { type: 'text/plain' });
  if (dir) {
     await saveBlobToDirectory(dir, filename, blob);
  } else {
    downloadBlob(blob, filename);
  }
}

export async function saveBase64File(
  dir: DirectoryHandle | null,
  filename: string,
  base64Data: string,
): Promise<void> {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/octet-stream' });
  
  if (dir) {
    await saveBlobToDirectory(dir, filename, blob);
  } else {
    downloadBlob(blob, filename);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}