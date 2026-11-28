export type TransactionType = 'INCOME' | 'OUTCOME' | 'TRANSFER';

export type TransactionSummary = {
  id: string;
  type: TransactionType;
  name: string;
  amount: number;
  date: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  parent_transaction_id: string | null;
  tags: string[];
  source: 'MANUAL' | 'AUTO';
  images_count: number;
  items_count: number;
  thumbnail_url: string | null;
};
