/** A file chosen for upload. `name` keeps the folder path for dropped folders. */
export interface PickedFile {
  /** Stable identity, also used to skip a file that is added twice. */
  key: string;
  name: string;
  file: File;
}

const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

function pick(file: File, path?: string): PickedFile | null {
  if (JUNK.has(file.name)) return null;
  const name = (path || file.webkitRelativePath || file.name).replace(/^\/+/, "");
  return { key: `${name}:${file.size}:${file.lastModified}`, name, file };
}

export function fromFileList(list: FileList | null): PickedFile[] {
  return Array.from(list ?? []).flatMap((file) => pick(file) ?? []);
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** `readEntries` returns results in batches; keep reading until it is empty. */
async function readDirectory(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    const picked = pick(file, entry.fullPath);
    if (picked) out.push(picked);
  } else if (entry.isDirectory) {
    const children = await readDirectory(entry as FileSystemDirectoryEntry);
    for (const child of children) await walk(child, out);
  }
}

/**
 * Files from a drop, descending into folders. The DataTransfer is only valid
 * during the drop event, so entries are collected synchronously before the
 * first await.
 */
export function fromDataTransfer(data: DataTransfer): Promise<PickedFile[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  // Browsers without the entries API: plain files only.
  if (entries.length === 0) return Promise.resolve(fromFileList(data.files));

  return (async () => {
    const out: PickedFile[] = [];
    for (const entry of entries) await walk(entry, out);
    return out;
  })();
}
