import { request } from '@/lib/api/client';

export type CategoryType = 'INCOME' | 'OUTCOME';

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  is_default: boolean;
  is_fallback: boolean;
};

export const listCategories = () => request<Category[]>('/categories');
