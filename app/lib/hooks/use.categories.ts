import { listCategories } from '@/lib/api/categories';
import { useQuery } from '@tanstack/react-query';

export const categoryKey = ['categories'] as const;

export const useCategories = () =>
  useQuery({ queryKey: categoryKey, queryFn: listCategories, staleTime: 5 * 60_000 });
