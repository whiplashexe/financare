import { request } from '@/lib/api/client';

export type AccountType = 'BANK' | 'EWALLET' | 'CASH';

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  initial_balance: number;
  current_balance: number;
  last4: string | null;
  include_in_total: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
};

export type AccountList = {
  total_balance: number;
  accounts: Account[];
};

export type AccountInput = {
  name: string;
  type: AccountType;
  institution?: string;
  initial_balance: number;
  last4?: string;
  include_in_total: boolean;
};

export const listAccounts = () => request<AccountList>('/accounts');

export const createAccount = (input: AccountInput) =>
  request<Account>('/accounts', { method: 'POST', body: input });

export const archiveAccount = ({ id }: { id: string }) =>
  request<Account>(`/accounts/${id}/archive`, { method: 'POST' });
