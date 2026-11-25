import { getDashboard } from '@/lib/api/dashboard';
import { useQuery } from '@tanstack/react-query';

export const dashboardKey = ['dashboard'] as const;

export const useDashboard = () => useQuery({ queryKey: dashboardKey, queryFn: getDashboard });
