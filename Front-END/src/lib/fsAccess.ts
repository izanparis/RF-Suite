// src/lib/fsAccess.ts
export type DirectoryHandle = any; // para simplificar TS; si quieres lo tipamos fino

export function isFsAccessSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === "function";
}

export async function pickDirectory(): Promise<DirectoryHandle> {
  // @ts-ignore
  return await window.showDirectoryPicker();
}

export async function saveBlobToDirectory(
  dir: DirectoryHandle,
  filename: string,
  blob: Blob
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function saveTextToDirectory(
  dir: DirectoryHandle,
  filename: string,
  content: string,
  mime = "text/plain"
): Promise<void> {
  const blob = new Blob([content], { type: mime });
  await saveBlobToDirectory(dir, filename, blob);
}