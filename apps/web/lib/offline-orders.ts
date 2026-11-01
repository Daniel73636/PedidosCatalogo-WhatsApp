export interface PendingOrder {
  slug: string;
  key: string;
  payload: Record<string, unknown>;
  queuedAt: number;
}

const DATABASE = "pedidos-catalogo";
const STORE = "pending-orders";

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE))
      request.result.createObjectStore(STORE, { keyPath: "key" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function queueOrder(order: PendingOrder) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(order);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function pendingOrders(slug: string) {
  const database = await openDatabase();
  const orders = await new Promise<PendingOrder[]>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as PendingOrder[]).filter((order) => order.slug === slug).sort((a, b) => a.queuedAt - b.queuedAt));
    request.onerror = () => reject(request.error);
  });
  database.close();
  return orders;
}

export async function removePendingOrder(key: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
