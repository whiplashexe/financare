import { request } from '@/lib/api/client';

export type MontSummary = {
  month: string;
  income: number;
  outcome: number;
  net: number;
};

export type Dashboard = {
  total_balance: number;
  month_summary: MontSummary;
  recent_transactions: unknown[];
  upcoming_reminders: unknown[];
  action_needed: unknown[];
};

export const getDashboard = () => request<Dashboard>('/dashboard');
