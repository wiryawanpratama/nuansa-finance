
import { openDB } from 'idb';

export interface Wallet {
  id: string;
  name: string;
  openingBalance: number;
  createdAt: number;
}

export interface Transaction {
  id: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  walletId: string;
  transferToWalletId?: string;
  createdAt: number;
}

const dbPromise = openDB('nuansa-finance', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('transactions')) {
      db.createObjectStore('transactions', {
        keyPath: 'id',
      });
    }

    if (!db.objectStoreNames.contains('wallets')) {
      const walletStore = db.createObjectStore('wallets', {
        keyPath: 'id',
      });

      walletStore.put({
        id: 'cash',
        name: 'Cash',
        openingBalance: 0,
        createdAt: Date.now(),
      });
    }
  },
});

export async function getTransactions(): Promise<Transaction[]> {
  const db = await dbPromise;
  const transactions = await db.getAll('transactions');

  // Transaksi lama yang belum memiliki dompet
  // otomatis dianggap berasal dari Cash.
  return transactions.map((item) => ({
    ...item,
    walletId: item.walletId ?? 'cash',
  }));
}

export async function saveTransaction(
  transaction: Transaction,
): Promise<void> {
  const db = await dbPromise;
  await db.put('transactions', transaction);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('transactions', id);
}

export async function getWallets(): Promise<Wallet[]> {
  const db = await dbPromise;
  return db.getAll('wallets');
}

export async function saveWallet(wallet: Wallet): Promise<void> {
  const db = await dbPromise;
  await db.put('wallets', wallet);
}

export async function deleteWallet(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('wallets', id);
}
