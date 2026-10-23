import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  deleteTransaction,
  deleteWallet,
  getTransactions,
  getWallets,
  saveTransaction,
  saveWallet,
} from './db';

import type { Transaction, Wallet } from './db';
import './App.css';

const rupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const INCOME_CATEGORIES = ['Uang saku', 'Gaji', 'Freelance', 'Hadiah', 'Lainnya'];
const EXPENSE_CATEGORIES = [
  'Makanan',
  'Transportasi',
  'Kebutuhan',
  'Hiburan',
  'Pendidikan',
  'Lainnya',
];

function App() {
  const [activePage, setActivePage] = useState('Dashboard');
  const [showForm, setShowForm] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState('cash');
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [walletName, setWalletName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);

  // State untuk transfer antar dompet
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferFromWalletId, setTransferFromWalletId] = useState('cash');
  const [transferToWalletId, setTransferToWalletId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(today());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Makanan');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());

  const menu = [
    { name: 'Dashboard', icon: '▦' },
    { name: 'Transaksi', icon: '↕' },
    { name: 'Dompet', icon: '▤' },
    { name: 'Anggaran', icon: '◎' },
    { name: 'Tabungan', icon: '♧' },
  ];

  useEffect(() => {
    Promise.all([getTransactions(), getWallets()])
      .then(([transactionData, walletData]) => {
        setTransactions(transactionData);
        setWallets(walletData);
      })
      .catch(() => {
        setError('Data gagal dibaca. Coba muat ulang halaman.');
      })
      .finally(() => setLoading(false));
  }, []);

  const sortedTransactions = [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );

  const currentMonth = today().slice(0, 7);
  const monthlyTransactions = transactions.filter((tx) =>
    tx.date.startsWith(currentMonth),
  );

  // Transfer tidak dihitung sebagai pemasukan maupun pengeluaran.
  const income = monthlyTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((total, tx) => total + tx.amount, 0);

  const expense = monthlyTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((total, tx) => total + tx.amount, 0);

  const balance =
    wallets.reduce((total, wallet) => total + wallet.openingBalance, 0) +
    transactions.reduce((total, tx) => {
      if (tx.type === 'income') return total + tx.amount;
      if (tx.type === 'expense') return total - tx.amount;
      // Transfer tidak mengubah total uang.
      return total;
    }, 0);

  const getWalletBalance = (wallet: Wallet) =>
    wallet.openingBalance +
    transactions.reduce((total, tx) => {
      if (tx.type === 'transfer') {
        if (tx.walletId === wallet.id) total -= tx.amount;
        if (tx.transferToWalletId === wallet.id) total += tx.amount;
        return total;
      }

      if (tx.walletId !== wallet.id) return total;

      return total + (tx.type === 'income' ? tx.amount : -tx.amount);
    }, 0);

  const getWalletName = (id?: string) =>
    wallets.find((wallet) => wallet.id === id)?.name ?? 'Cash';

  function openTransferForm() {
    setError('');
    const from = wallets.some((wallet) => wallet.id === 'cash')
      ? 'cash'
      : (wallets[0]?.id ?? '');
    setTransferFromWalletId(from);
    setTransferToWalletId(
      wallets.find((wallet) => wallet.id !== from)?.id ?? '',
    );
    setTransferAmount('');
    setTransferDate(today());
    setShowTransferForm((current) => !current);
    setShowForm(false);
  }

  async function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const sourceWallet = wallets.find(
      (wallet) => wallet.id === transferFromWalletId,
    );
    const destinationWallet = wallets.find(
      (wallet) => wallet.id === transferToWalletId,
    );
    const parsedAmount = Number(transferAmount);

    if (!sourceWallet || !destinationWallet) {
      setError('Pilih dompet asal dan dompet tujuan.');
      return;
    }

    if (sourceWallet.id === destinationWallet.id) {
      setError('Dompet asal dan tujuan harus berbeda.');
      return;
    }

    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('Nominal transfer harus berupa bilangan bulat positif.');
      return;
    }

    if (!transferDate) {
      setError('Tanggal transfer wajib diisi.');
      return;
    }

    if (getWalletBalance(sourceWallet) < parsedAmount) {
      setError('Saldo dompet asal tidak mencukupi.');
      return;
    }

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      name: `Transfer ${sourceWallet.name} → ${destinationWallet.name}`,
      category: 'Transfer Antar Dompet',
      date: transferDate,
      amount: parsedAmount,
      type: 'transfer',
      walletId: sourceWallet.id,
      transferToWalletId: destinationWallet.id,
      createdAt: Date.now(),
    };

    try {
      await saveTransaction(transaction);
      setTransactions((current) => [transaction, ...current]);

      setTransferAmount('');
      setTransferToWalletId('');
      setTransferDate(today());
      setShowTransferForm(false);
    } catch {
      setError('Transfer gagal disimpan. Coba lagi.');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const parsedAmount = Number(amount);

    if (!name.trim() || !category.trim() || !date) {
      setError('Lengkapi semua informasi transaksi terlebih dahulu.');
      return;
    }

    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('Nominal harus berupa bilangan bulat positif dalam rupiah.');
      return;
    }

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: category.trim(),
      date,
      amount: parsedAmount,
      type,
      walletId,
      createdAt: Date.now(),
    };

    try {
      await saveTransaction(transaction);
      setTransactions((previous) => [...previous, transaction]);
      setName('');
      setCategory('Makanan');
      setAmount('');
      setDate(today());
      setType('expense');
      setWalletId('cash');
      setShowForm(false);
    } catch {
      setError('Transaksi gagal disimpan. Silakan coba lagi.');
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      'Hapus transaksi ini? Saldo dan ringkasan akan dihitung ulang.',
    );

    if (!confirmed) return;

    setError('');

    try {
      await deleteTransaction(id);
      setTransactions((previous) => previous.filter((tx) => tx.id !== id));
    } catch {
      setError('Transaksi gagal dihapus. Silakan coba lagi.');
    }
  }

  async function handleWalletSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedName = walletName.trim();
    const parsedBalance = Number(openingBalance);

    if (!trimmedName) {
      setError('Nama dompet wajib diisi.');
      return;
    }

    if (
      openingBalance.trim() === '' ||
      !Number.isSafeInteger(parsedBalance) ||
      parsedBalance < 0
    ) {
      setError('Saldo awal harus berupa bilangan bulat nol atau lebih.');
      return;
    }

    const duplicate = wallets.some(
      (wallet) =>
        wallet.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        wallet.id !== editingWalletId,
    );

    if (duplicate) {
      setError('Nama dompet tersebut sudah digunakan.');
      return;
    }

    const existingWallet = wallets.find(
      (wallet) => wallet.id === editingWalletId,
    );

    const wallet: Wallet = {
      id: editingWalletId ?? crypto.randomUUID(),
      name: trimmedName,
      openingBalance: parsedBalance,
      createdAt: existingWallet?.createdAt ?? Date.now(),
    };

    try {
      await saveWallet(wallet);

      setWallets((previous) => {
        const exists = previous.some((item) => item.id === wallet.id);

        return exists
          ? previous.map((item) => (item.id === wallet.id ? wallet : item))
          : [...previous, wallet];
      });

      setWalletName('');
      setOpeningBalance('');
      setEditingWalletId(null);
      setShowWalletForm(false);
    } catch {
      setError('Dompet gagal disimpan. Silakan coba lagi.');
    }
  }

  function startEditWallet(wallet: Wallet) {
    setError('');
    setEditingWalletId(wallet.id);
    setWalletName(wallet.name);
    setOpeningBalance(String(wallet.openingBalance));
    setShowWalletForm(true);
  }

  async function handleDeleteWallet(wallet: Wallet) {
    if (wallet.id === 'cash') {
      setError('Dompet Cash bawaan tidak dapat dihapus.');
      return;
    }

    if (wallets.length <= 1) {
      setError('Kamu harus memiliki setidaknya satu dompet.');
      return;
    }

    // Dompet yang pernah menjadi asal ATAU tujuan transfer juga dianggap punya transaksi.
    const hasTransactions = transactions.some(
      (transaction) =>
        transaction.walletId === wallet.id ||
        transaction.transferToWalletId === wallet.id,
    );

    if (hasTransactions) {
      setError(
        'Dompet ini masih memiliki transaksi. Hapus transaksinya terlebih dahulu sebelum menghapus dompet.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Hapus dompet "${wallet.name}"? Tindakan ini tidak dapat dibatalkan.`,
    );

    if (!confirmed) return;

    setError('');

    try {
      await deleteWallet(wallet.id);
      setWallets((previous) => previous.filter((item) => item.id !== wallet.id));

      if (walletId === wallet.id) {
        setWalletId('cash');
      }
    } catch {
      setError('Dompet gagal dihapus. Silakan coba lagi.');
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">N</div>
          <div>
            <h2>Nuansa</h2>
            <span>Personal Finance</span>
          </div>
        </div>

        <p className="menu-label">MENU UTAMA</p>
        <nav className="side-nav">
          {menu.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activePage === item.name ? 'active' : ''}`}
              onClick={() => setActivePage(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sync-card">
            <span className="sync-dot" />
            <div>
              <strong>Tersimpan lokal</strong>
              <p>Database perangkat ini</p>
            </div>
          </div>
          <p className="version">NUANSA · VERSI 0.2</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">KEUANGAN PRIBADI</p>
            <h1>{activePage}</h1>
          </div>
          <div className="profile">
            <div className="avatar">W</div>
            <div className="profile-text">
              <strong>Dompet Saya</strong>
              <span>Pengelola keuangan</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {(activePage === 'Dashboard' || activePage === 'Transaksi') && (
          <>
            <section className="welcome-row">
              <div>
                <h2>
                  {activePage === 'Dashboard'
                    ? 'Halo, selamat datang! 👋'
                    : 'Catatan transaksi'}
                </h2>
                <p>
                  {activePage === 'Dashboard'
                    ? 'Pantau kondisi keuanganmu dengan lebih mudah.'
                    : 'Semua pemasukan, pengeluaran, dan transfer yang tersimpan.'}
                </p>
              </div>

              <div className="welcome-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    setShowForm((previous) => !previous);
                    setShowTransferForm(false);
                  }}
                >
                  ＋ Tambah transaksi
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={openTransferForm}
                >
                  ⇄ Transfer antar dompet
                </button>
              </div>
            </section>

            {showForm && (
              <section className="form-card">
                <div className="section-heading">
                  <div>
                    <h3>Transaksi baru</h3>
                    <p>Data akan disimpan di perangkat ini.</p>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setShowForm(false)}
                    aria-label="Tutup formulir"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="form-fields">
                    <label>
                      Jenis transaksi
                      <select
                        value={type}
                        onChange={(event) => {
                          const nextType = event.target.value as
                            | 'income'
                            | 'expense';
                          setType(nextType);
                          // Samakan kategori dengan jenis transaksi yang dipilih.
                          setCategory(
                            nextType === 'income'
                              ? INCOME_CATEGORIES[0]
                              : EXPENSE_CATEGORIES[0],
                          );
                        }}
                      >
                        <option value="expense">Pengeluaran</option>
                        <option value="income">Pemasukan</option>
                      </select>
                    </label>

                    <label>
                      Nominal (Rp)
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="Contoh: 25000"
                      />
                    </label>

                    <label>
                      Keterangan
                      <input
                        type="text"
                        maxLength={100}
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Contoh: Makan siang"
                      />
                    </label>

                    <label>
                      Kategori
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                      >
                        {(type === 'income'
                          ? INCOME_CATEGORIES
                          : EXPENSE_CATEGORIES
                        ).map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Dompet
                      <select
                        value={walletId}
                        onChange={(event) => setWalletId(event.target.value)}
                        required
                      >
                        {wallets.map((wallet) => (
                          <option key={wallet.id} value={wallet.id}>
                            {wallet.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Tanggal
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    </label>
                  </div>

                  <button className="primary-button form-submit" type="submit">
                    Simpan transaksi
                  </button>
                </form>
              </section>
            )}

            {showTransferForm && (
              <section className="form-card">
                <div className="section-heading">
                  <div>
                    <h3>Transfer antar dompet</h3>
                    <p>Total saldo tidak berubah, hanya berpindah dompet.</p>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setShowTransferForm(false)}
                    aria-label="Tutup formulir transfer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleTransferSubmit}>
                  <div className="form-fields">
                    <label>
                      Dompet asal
                      <select
                        value={transferFromWalletId}
                        onChange={(event) => {
                          setTransferFromWalletId(event.target.value);
                          if (event.target.value === transferToWalletId) {
                            setTransferToWalletId('');
                          }
                        }}
                        required
                      >
                        {wallets.map((wallet) => (
                          <option key={wallet.id} value={wallet.id}>
                            {wallet.name} — {rupiah(getWalletBalance(wallet))}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Dompet tujuan
                      <select
                        value={transferToWalletId}
                        onChange={(event) =>
                          setTransferToWalletId(event.target.value)
                        }
                        required
                      >
                        <option value="">Pilih dompet tujuan</option>
                        {wallets
                          .filter((wallet) => wallet.id !== transferFromWalletId)
                          .map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              {wallet.name}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label>
                      Nominal (Rp)
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={transferAmount}
                        onChange={(event) =>
                          setTransferAmount(event.target.value)
                        }
                        placeholder="Contoh: 50000"
                      />
                    </label>

                    <label>
                      Tanggal
                      <input
                        type="date"
                        required
                        value={transferDate}
                        onChange={(event) => setTransferDate(event.target.value)}
                      />
                    </label>
                  </div>

                  <button className="primary-button form-submit" type="submit">
                    Simpan transfer
                  </button>
                </form>
              </section>
            )}

            {activePage === 'Dashboard' && (
              <>
                <section className="balance-card">
                  <div className="balance-top">
                    <div>
                      <span className="muted-light">TOTAL SALDO</span>
                      <p className="balance-amount">{rupiah(balance)}</p>
                    </div>
                    <div className="balance-symbol">↗</div>
                  </div>
                  <p className="balance-note">
                    Saldo awal seluruh dompet ditambah pemasukan dan dikurangi
                    pengeluaran. Transfer tidak mengubah total.
                  </p>
                  <div className="balance-footer">
                    <span>▣ Penyimpanan lokal</span>
                    <span>Rupiah (IDR)</span>
                  </div>
                </section>

                <section className="summary-grid">
                  <article className="summary-card">
                    <div className="summary-icon income-icon">↙</div>
                    <p>Total pemasukan</p>
                    <h3>{rupiah(income)}</h3>
                    <span className="summary-caption">Bulan ini</span>
                  </article>
                  <article className="summary-card">
                    <div className="summary-icon expense-icon">↗</div>
                    <p>Total pengeluaran</p>
                    <h3>{rupiah(expense)}</h3>
                    <span className="summary-caption">Bulan ini</span>
                  </article>
                  <article className="summary-card">
                    <div className="summary-icon budget-icon">↔</div>
                    <p>Arus kas bulan ini</p>
                    <h3>{rupiah(income - expense)}</h3>
                    <span className="summary-caption">
                      Pemasukan dikurangi pengeluaran
                    </span>
                  </article>
                </section>
              </>
            )}

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>
                    {activePage === 'Dashboard'
                      ? 'Aktivitas terbaru'
                      : 'Semua transaksi'}
                  </h3>
                  <p>{transactions.length} transaksi tersimpan di perangkat ini</p>
                </div>
                {activePage === 'Dashboard' && (
                  <button
                    className="text-button"
                    onClick={() => setActivePage('Transaksi')}
                  >
                    Lihat semua →
                  </button>
                )}
              </div>

              {loading ? (
                <p className="empty-state">Memuat transaksi...</p>
              ) : sortedTransactions.length === 0 ? (
                <div className="empty-state">
                  <span>🧾</span>
                  <strong>Belum ada transaksi</strong>
                  <p>
                    Tambahkan transaksi pertamamu untuk mulai mencatat keuangan.
                  </p>
                </div>
              ) : (
                <div className="transaction-list">
                  {(activePage === 'Dashboard'
                    ? sortedTransactions.slice(0, 5)
                    : sortedTransactions
                  ).map((tx) => (
                    <div className="transaction-row" key={tx.id}>
                      <div className="transaction-icon">
                        {tx.type === 'income'
                          ? '💰'
                          : tx.type === 'transfer'
                            ? '⇄'
                            : '🧾'}
                      </div>
                      <div className="transaction-info">
                        <strong>{tx.name}</strong>
                        <span>
                          {tx.category} · {formatDate(tx.date)}
                        </span>
                        <span className="transaction-wallet">
                          {tx.type === 'transfer'
                            ? `Dari: ${getWalletName(tx.walletId)} → ${getWalletName(
                                tx.transferToWalletId,
                              )}`
                            : `Dompet: ${getWalletName(tx.walletId)}`}
                        </span>
                      </div>
                      <strong
                        className={
                          tx.type === 'income'
                            ? 'amount-income'
                            : tx.type === 'transfer'
                              ? 'amount-transfer'
                              : 'amount-expense'
                        }
                      >
                        {tx.type === 'income'
                          ? '+'
                          : tx.type === 'transfer'
                            ? ''
                            : '−'}
                        {rupiah(tx.amount)}
                      </strong>
                      <button
                        className="delete-button"
                        onClick={() => void handleDelete(tx.id)}
                        aria-label={`Hapus transaksi ${tx.name}`}
                        title="Hapus transaksi"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activePage === 'Dompet' && (
          <section className="wallet-page">
            <section className="wallet-overview">
              <div>
                <p className="wallet-label">TOTAL SELURUH DOMPET</p>
                <h2>{rupiah(balance)}</h2>
                <p>Saldo awal + pemasukan − pengeluaran</p>
              </div>
              <span className="wallet-overview-icon">▤</span>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>Dompet saya</h3>
                  <p>{wallets.length} dompet terdaftar</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setError('');
                    setEditingWalletId(null);
                    setWalletName('');
                    setOpeningBalance('');
                    setShowWalletForm((previous) => !previous);
                  }}
                >
                  ＋ Tambah dompet
                </button>
              </div>

              {showWalletForm && (
                <form className="wallet-form" onSubmit={handleWalletSubmit}>
                  <h3>{editingWalletId ? 'Edit dompet' : 'Dompet baru'}</h3>

                  <label>
                    Nama dompet
                    <input
                      value={walletName}
                      onChange={(event) => setWalletName(event.target.value)}
                      maxLength={40}
                      placeholder="Contoh: DANA"
                      required
                    />
                  </label>

                  <label>
                    Saldo awal (Rp)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={openingBalance}
                      onChange={(event) => setOpeningBalance(event.target.value)}
                      placeholder="Contoh: 150000"
                      required
                    />
                  </label>

                  <p className="wallet-hint">
                    Masukkan saldo yang tersedia saat mulai menggunakan Nuansa.
                    Saldo awal bukan pemasukan transaksi.
                  </p>

                  <div className="wallet-form-actions">
                    <button className="primary-button" type="submit">
                      Simpan dompet
                    </button>
                    <button
                      className="wallet-cancel-button"
                      type="button"
                      onClick={() => {
                        setShowWalletForm(false);
                        setEditingWalletId(null);
                        setWalletName('');
                        setOpeningBalance('');
                      }}
                    >
                      Batal
                    </button>
                  </div>
                </form>
              )}

              {wallets.length === 0 ? (
                <div className="empty-state">
                  <span>👛</span>
                  <strong>Belum ada dompet</strong>
                  <p>Tambahkan dompet pertamamu untuk mulai mengelola saldo.</p>
                </div>
              ) : (
                <div className="wallet-grid">
                  {wallets.map((wallet) => (
                    <article className="wallet-card" key={wallet.id}>
                      <div className="wallet-card-top">
                        <span className="wallet-card-icon">▤</span>
                        <span className="wallet-card-type">DOMPET</span>
                      </div>

                      <h3>{wallet.name}</h3>
                      <p className="wallet-balance-label">Saldo saat ini</p>
                      <h2>{rupiah(getWalletBalance(wallet))}</h2>

                      <div className="wallet-opening">
                        Saldo awal: {rupiah(wallet.openingBalance)}
                      </div>

                      <div className="wallet-actions">
                        <button
                          className="wallet-edit-button"
                          onClick={() => startEditWallet(wallet)}
                        >
                          ✎ Edit
                        </button>
                        <button
                          className="wallet-delete-button"
                          onClick={() => void handleDeleteWallet(wallet)}
                        >
                          × Hapus
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {(activePage === 'Anggaran' || activePage === 'Tabungan') && (
          <section className="placeholder-panel">
            <div className="placeholder-icon">
              {activePage === 'Anggaran' ? '◎' : '♧'}
            </div>
            <h2>{activePage}</h2>
            <p>Halaman ini sedang disiapkan dan akan hadir di versi berikutnya.</p>
          </section>
        )}

        <footer className="page-footer">
          <span>Nuansa Personal Finance</span>
          <span>Data transaksi tersimpan lokal di browser ini.</span>
        </footer>
      </main>

      <nav className="mobile-nav">
        {menu.map((item) => (
          <button
            key={item.name}
            className={activePage === item.name ? 'mobile-active' : ''}
            onClick={() => setActivePage(item.name)}
          >
            <span>{item.icon}</span>
            <small>{item.name}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
