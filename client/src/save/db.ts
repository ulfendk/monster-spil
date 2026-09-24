const DB_NAME = "monster-spil";
const DB_VERSION = 1;
const STORE_NAME = "save";

/**
 * One IndexedDB object store holding plain records by key: the device's game list
 * ("games", see games.ts) and one save per game ("save:<gameId>"). Before there were
 * games the only record was the save under "player"; games.ts moves it on first start.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readRecord<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Writes and deletes records in one transaction: all of it happens, or none of it. */
export async function writeRecords(put: Record<string, unknown>, remove: string[] = []): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const [key, value] of Object.entries(put)) store.put(value, key);
    for (const key of remove) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
