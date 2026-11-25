import { archiveAccount, createAccount, listAccounts } from '@/lib/api/accounts';
import { dashboardKey } from '@/lib/hooks/use.dashboard';
import { queryClient } from '@/lib/query';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const accountKey = ['accounts'] as const;

const refreshAccountData = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKey }),
    queryClient.invalidateQueries({ queryKey: dashboardKey }),
  ]);

export const useAccounts = () => useQuery({ queryKey: accountKey, queryFn: listAccounts });
export const useCreateAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAccount,
    onSuccess: () => refreshAccountData(queryClient),
  });
};
export const useArchiveAccount = () => {
  const queryCLient = useQueryClient();
  return useMutation({
    mutationFn: archiveAccount,
    onSuccess: () => refreshAccountData(queryCLient),
  });
};
