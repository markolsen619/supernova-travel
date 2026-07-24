import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import type { Expense, ExpenseCategory } from '@/types';

async function fetchExpenses(tripId: string): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, 'trips', tripId, 'expenses'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense);
}

/** Owner/collaborator-only per firestore.rules — same read gate as `days`. */
export function useExpenses(tripId: string | null) {
  return useQuery({
    queryKey: ['expenses', tripId],
    queryFn: () => fetchExpenses(tripId!),
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });
}

export interface NewExpenseInput {
  title: string;
  amount: number;
  category: ExpenseCategory;
  paidByUid: string;
  splitAmongUids: string[];
  createdByUid: string;
}

export function useExpenseMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expenses', tripId] });

  const addExpense = useMutation({
    mutationFn: (input: NewExpenseInput) =>
      addDoc(collection(db, 'trips', tripId, 'expenses'), { ...input, createdAt: serverTimestamp() }),
    onSuccess: invalidate,
  });

  const updateExpense = useMutation({
    mutationFn: ({ expenseId, data }: { expenseId: string; data: Partial<NewExpenseInput> }) =>
      updateDoc(doc(db, 'trips', tripId, 'expenses', expenseId), data),
    onSuccess: invalidate,
  });

  const deleteExpense = useMutation({
    mutationFn: (expenseId: string) => deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId)),
    onSuccess: invalidate,
  });

  return { addExpense, updateExpense, deleteExpense };
}

// ── Derived balances ─────────────────────────────────────────────────────

export interface SettleUpLine {
  fromUid: string;
  toUid: string;
  amount: number;
}

export interface TripBalances {
  totalSpent: number;
  /** uid → net balance. Positive = other people owe them; negative = they
   * owe other people. Never real money movement — just the ledger math. */
  balances: Record<string, number>;
  /** Minimal set of "X pays Y $Z" lines that would zero every balance out —
   * a simple greedy match (largest creditor against largest debtor,
   * repeat), not an optimal minimum-transaction solver, but more than
   * enough for a trip-sized group. */
  settleUp: SettleUpLine[];
}

const EPSILON = 0.01;

/** Pure function, no Firestore/React — computed client-side from whatever
 * useExpenses() already returned, so there's no separate "balances" doc to
 * keep in sync. */
export function computeBalances(expenses: Expense[]): TripBalances {
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const balances: Record<string, number> = {};

  for (const expense of expenses) {
    const memberCount = expense.splitAmongUids.length;
    if (memberCount === 0) continue;
    const share = expense.amount / memberCount;
    balances[expense.paidByUid] = (balances[expense.paidByUid] ?? 0) + expense.amount;
    for (const uid of expense.splitAmongUids) {
      balances[uid] = (balances[uid] ?? 0) - share;
    }
  }

  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > EPSILON)
    .map(([uid, amount]) => ({ uid, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < -EPSILON)
    .map(([uid, amount]) => ({ uid, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const settleUp: SettleUpLine[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);
    if (amount > EPSILON) {
      settleUp.push({ fromUid: debtor.uid, toUid: creditor.uid, amount: Math.round(amount * 100) / 100 });
    }
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount <= EPSILON) ci++;
    if (debtor.amount <= EPSILON) di++;
  }

  return { totalSpent, balances, settleUp };
}
