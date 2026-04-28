import Dexie, { type EntityTable } from 'dexie';

export interface InventoryItem {
  id?: number;
  uid?: string; // stable id for sync
  name: string;
  category: string;
  quantity: number;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  expiryDate?: string;
  minStockThreshold: number;
}

export interface StockMovement {
  id?: number;
  uid?: string;
  itemId: number;
  quantity: number;
  type: 'IN' | 'OUT';
  reason: 'Harvest' | 'Purchase' | 'Sale' | 'Usage' | 'Damage';
  date: string;
}

export interface Sale {
  id?: number;
  uid?: string;
  itemId: number;
  quantity: number;
  totalPrice: number;
  customerName?: string;
  paymentType: 'Cash' | 'Credit';
  date: string;
}

export interface Purchase {
  id?: number;
  uid?: string;
  supplierName: string;
  itemId: number;
  quantity: number;
  totalCost: number;
  date: string;
}

export interface DayBookEntry {
  id?: number;
  uid?: string;
  time: string; // ISO String
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  category: 'Sale' | 'Purchase' | 'Transport' | 'Wage' | 'Other';
  accountId?: number; // FinancialAccount.id (Cash/Bank/QR)
  method?: 'Cash' | 'QR' | 'BankTransfer';
}

export interface LedgerAccount {
  id?: number;
  uid?: string;
  name: string;
  type: 'Customer' | 'Supplier' | 'Worker';
}

export interface LedgerEntry {
  id?: number;
  uid?: string;
  accountId: number;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Payment {
  id?: number;
  uid?: string;
  partyAccountId: number;
  partyType: 'Customer' | 'Supplier' | 'Worker';
  direction: 'Receive' | 'Pay';
  amount: number;
  date: string; // ISO
  note?: string;
  method: 'Cash' | 'QR' | 'BankTransfer';
  accountId?: number; // FinancialAccount.id
  linkedLedgerEntryId?: number;
  linkedDayBookEntryId?: number;
}

export interface FinancialAccount {
  id?: number;
  uid?: string;
  name: string; // e.g. Cash in Hand, Nabil Bank, eSewa QR
  type: 'Cash' | 'Bank' | 'QR';
}

export interface User {
  id?: number;
  username: string;
  email?: string;
  passwordHash?: string;
  phone?: string;
  roleId: number;
}

export interface Role {
  id?: number;
  name: string;
  description?: string;
  permissions: string[]; // e.g. ["dashboard.read", "orders.write"]
  isSystem?: boolean; // true for seeded roles
}

export type SyncEventOp = "create" | "update" | "delete";

export interface SyncEvent {
  id: string; // uuid
  deviceId: string;
  createdAt: string; // ISO
  entityType: string;
  entityId: string;
  op: SyncEventOp;
  payload: any;
  appliedAt?: string; // ISO
  pushedAt?: string; // ISO
}

export class PatelaFarmDatabase extends Dexie {
  inventory!: EntityTable<InventoryItem, 'id'>;
  stockMovement!: EntityTable<StockMovement, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  purchases!: EntityTable<Purchase, 'id'>;
  dayBook!: EntityTable<DayBookEntry, 'id'>;
  ledgerAccounts!: EntityTable<LedgerAccount, 'id'>;
  ledgerEntries!: EntityTable<LedgerEntry, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  financialAccounts!: EntityTable<FinancialAccount, 'id'>;
  users!: EntityTable<User, 'id'>;
  roles!: EntityTable<Role, 'id'>;
  outbox!: EntityTable<SyncEvent, "id">;

  constructor() {
    super('PatelaFarmDB_v2');
    this.version(2).stores({
      inventory: '++id, name, category, quantity',
      stockMovement: '++id, itemId, type, reason, date',
      sales: '++id, itemId, paymentType, date',
      purchases: '++id, supplierName, itemId, date',
      dayBook: '++id, time, type, category',
      ledgerAccounts: '++id, name, type',
      ledgerEntries: '++id, accountId, date',
      payments: '++id, partyAccountId, direction, date',
      users: '++id, name, role'
    });

    this.version(3)
      .stores({
        inventory: '++id, name, category, quantity',
        stockMovement: '++id, itemId, type, reason, date',
        sales: '++id, itemId, paymentType, date',
        purchases: '++id, supplierName, itemId, date',
        dayBook: '++id, time, type, category, accountId',
        ledgerAccounts: '++id, name, type',
        ledgerEntries: '++id, accountId, date',
        payments: '++id, partyAccountId, direction, date, accountId',
        financialAccounts: '++id, name, type',
        users: '++id, name, role',
      })
      .upgrade(async (tx) => {
        const financialAccounts = tx.table("financialAccounts");
        const dayBook = tx.table("dayBook");
        const payments = tx.table("payments");

        const cashId = await financialAccounts.add({ name: "Cash in Hand", type: "Cash" });

        await dayBook.toCollection().modify((e: any) => {
          if (typeof e.accountId !== "number") e.accountId = cashId;
          if (!e.method) e.method = "Cash";
        });

        await payments.toCollection().modify((p: any) => {
          if (typeof p.accountId !== "number") p.accountId = cashId;
          if (!p.method) p.method = "Cash";
        });
      });

    this.version(4)
      .stores({
        inventory: '++id, name, category, quantity',
        stockMovement: '++id, itemId, type, reason, date',
        sales: '++id, itemId, paymentType, date',
        purchases: '++id, supplierName, itemId, date',
        dayBook: '++id, time, type, category, accountId',
        ledgerAccounts: '++id, name, type',
        ledgerEntries: '++id, accountId, date',
        payments: '++id, partyAccountId, direction, date, accountId',
        financialAccounts: '++id, name, type',
        roles: '++id, name',
        users: '++id, username, roleId',
      })
      .upgrade(async (tx) => {
        const roles = tx.table("roles");
        const users = tx.table("users");

        // Seed default roles (IDs are generated, so we resolve by name).
        const adminId = await roles.add({
          name: "admin",
          description: "Full access to all sections",
          permissions: ["*"],
          isSystem: true,
        });
        const managerId = await roles.add({
          name: "manager",
          description: "Manage daily operations",
          permissions: ["dashboard", "orders", "inventory", "transactions", "accounts", "people", "reports"],
          isSystem: true,
        });
        const workerId = await roles.add({
          name: "worker",
          description: "Limited access",
          permissions: ["dashboard", "inventory", "orders"],
          isSystem: true,
        });

        // Migrate old user shape -> new user shape.
        await users.toCollection().modify((u: any) => {
          const oldRole = String(u.role ?? "").toLowerCase();
          const roleId =
            oldRole === "admin" ? adminId : oldRole === "manager" ? managerId : workerId;

          // Old schema used `name`; keep it as username.
          u.username = u.username ?? u.name ?? "user";
          delete u.name;
          delete u.role;
          delete u.permissions;

          u.roleId = roleId;
          if (!u.email) delete u.email;
          if (!u.passwordHash) delete u.passwordHash;
        });
      });

    this.version(5).stores({
      inventory: '++id, uid, name, category, quantity',
      stockMovement: '++id, uid, itemId, type, reason, date',
      sales: '++id, uid, itemId, paymentType, date',
      purchases: '++id, uid, supplierName, itemId, date',
      dayBook: '++id, uid, time, type, category, accountId',
      ledgerAccounts: '++id, uid, name, type',
      ledgerEntries: '++id, uid, accountId, date',
      payments: '++id, uid, partyAccountId, direction, date, accountId',
      financialAccounts: '++id, name, type',
      roles: '++id, name',
      users: '++id, username, roleId',
      outbox: 'id, createdAt, pushedAt, entityType, entityId',
    });

    this.version(6)
      .stores({
        inventory: '++id, uid, name, category, quantity',
        stockMovement: '++id, uid, itemId, type, reason, date',
        sales: '++id, uid, itemId, paymentType, date',
        purchases: '++id, uid, supplierName, itemId, date',
        dayBook: '++id, uid, time, type, category, accountId',
        ledgerAccounts: '++id, uid, name, type',
        ledgerEntries: '++id, uid, accountId, date',
        payments: '++id, uid, partyAccountId, direction, date, accountId',
        financialAccounts: '++id, uid, name, type',
        roles: '++id, name',
        users: '++id, username, roleId',
        outbox: 'id, createdAt, pushedAt, entityType, entityId',
      })
      .upgrade(async (tx) => {
        const uuidv4 = () =>
          (globalThis.crypto as any)?.randomUUID?.() ??
          `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

        const ensureUid = async (tableName: string) => {
          const t = tx.table(tableName);
          await t.toCollection().modify((row: any) => {
            if (!row.uid) row.uid = uuidv4();
          });
        };

        await ensureUid("inventory");
        await ensureUid("stockMovement");
        await ensureUid("sales");
        await ensureUid("purchases");
        await ensureUid("dayBook");
        await ensureUid("ledgerAccounts");
        await ensureUid("ledgerEntries");
        await ensureUid("payments");
      });

    this.version(7)
      .stores({
        inventory: '++id, uid, name, category, quantity',
        stockMovement: '++id, uid, itemId, type, reason, date',
        sales: '++id, uid, itemId, paymentType, date',
        purchases: '++id, uid, supplierName, itemId, date',
        dayBook: '++id, uid, time, type, category, accountId',
        ledgerAccounts: '++id, uid, name, type',
        ledgerEntries: '++id, uid, accountId, date',
        payments: '++id, uid, partyAccountId, direction, date, accountId',
        financialAccounts: '++id, uid, name, type',
        roles: '++id, name',
        users: '++id, username, roleId',
        outbox: 'id, createdAt, pushedAt, entityType, entityId',
      })
      .upgrade(async (tx) => {
        const uuidv4 = () =>
          (globalThis.crypto as any)?.randomUUID?.() ??
          `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
        const t = tx.table("financialAccounts");
        await t.toCollection().modify((row: any) => {
          if (!row.uid) row.uid = uuidv4();
        });
      });

    this.inventory = this.table('inventory');
    this.stockMovement = this.table('stockMovement');
    this.sales = this.table('sales');
    this.purchases = this.table('purchases');
    this.dayBook = this.table('dayBook');
    this.ledgerAccounts = this.table('ledgerAccounts');
    this.ledgerEntries = this.table('ledgerEntries');
    this.payments = this.table('payments');
    this.financialAccounts = this.table('financialAccounts');
    this.users = this.table('users');
    this.roles = this.table('roles');
    this.outbox = this.table("outbox");
  }
}

export const db = new PatelaFarmDatabase();
