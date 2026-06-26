import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface QueuedInvoice {
  id: string;       // local uuid
  payload: any;     // CreateInvoiceDto body
  queuedAt: string; // ISO timestamp
  attempts: number;
}

interface SwarnaOfflineDB extends DBSchema {
  'invoice-queue': {
    key: string;
    value: QueuedInvoice;
    indexes: { byQueuedAt: string };
  };
}

const DB_NAME = 'swarna-offline';
const STORE_NAME = 'invoice-queue';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SwarnaOfflineDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SwarnaOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SwarnaOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byQueuedAt', 'queuedAt');
      },
    });
  }
  return dbPromise;
}

/**
 * Add an invoice payload to the offline queue.
 * Returns the locally-generated UUID for this queued item.
 */
export async function enqueue(payload: any): Promise<string> {
  const db = await getDB();
  const item: QueuedInvoice = {
    id: crypto.randomUUID(),
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await db.add(STORE_NAME, item);
  return item.id;
}

/**
 * Retrieve the oldest unprocessed item from the queue (FIFO by queuedAt).
 * Returns null if the queue is empty.
 */
export async function dequeue(): Promise<QueuedInvoice | null> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('byQueuedAt');
  const cursor = await index.openCursor();
  if (!cursor) return null;
  return cursor.value;
}

/**
 * Remove a queued item by its local id (call after a successful sync).
 */
export async function remove(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

/**
 * Return all queued invoices ordered by queuedAt ascending.
 */
export async function getAll(): Promise<QueuedInvoice[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'byQueuedAt');
}

/**
 * Return the number of items currently in the queue.
 */
export async function count(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

/**
 * Increment the attempt counter for a queued item.
 * Useful for tracking retries without removing the item.
 */
export async function incrementAttempts(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const item = await tx.store.get(id);
  if (item) {
    item.attempts += 1;
    await tx.store.put(item);
  }
  await tx.done;
}
