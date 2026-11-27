import { AccountCarousel } from '@/components/dashboard/account.carousel';
import { MonthSummary } from '@/components/dashboard/month.summary';
import { useTabBarSpace } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/auth.context';
import { formatMoney } from '@/lib/format';
import { useAccounts } from '@/lib/hooks/use.accounts';
import { useDashboard } from '@/lib/hooks/use.dashboard';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const HomeScreen = () => {
  const { user } = useAuth();
  const accounts = useAccounts();
  const dashboard = useDashboard();
  const space = useTabBarSpace();
  const { data } = useAccounts();
  const hidden = user?.preferences.hide_balance ?? false;
  const refreshing = accounts.isRefetching || dashboard.isRefetching;

  const refresh = () => {
    accounts.refetch();
    dashboard.refetch();
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          contentContainerStyle={{
            paddingVertical: 24,
            gap: 24,
            paddingBottom: space,
          }}>
          <View className="gap-4 px-6">
            <Text className="font-grotesk-bold text-2xl">Hallo, {user?.name}</Text>
            <View className="gap-1 rounded-3xl border border-border bg-card p-5">
              <Text className="text-sm text-muted-foreground">Total Balance</Text>
              <Text className="font-grotesk-bold text-3xl">
                {formatMoney({ amount: accounts.data?.total_balance ?? 0, hidden })}
              </Text>
            </View>
          </View>
          <AccountCarousel accounts={accounts.data?.accounts ?? []} hidden={hidden} />
          <View className="px-6">
            {dashboard.data ? (
              <MonthSummary summary={dashboard.data.month_summary} hidden={hidden} />
            ) : dashboard.error ? (
              <View className="items-center gap-3 rounded-3xl border border-border p-5">
                <Text className="text-muted-foreground">Failed to load monthly summary</Text>
                <Button size="sm" variant="outline" onPress={() => dashboard.refetch()}>
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : (
              <ActivityIndicator />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;
