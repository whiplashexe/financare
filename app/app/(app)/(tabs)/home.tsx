import { AccountCarousel } from '@/components/dashboard/account.carousel';
import { MonthSummary } from '@/components/dashboard/month.summary';
import { RecentTransactions } from '@/components/dashboard/recent.transactions';
import { useTabBarSpace } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/ui/hugeicon';
import { Text } from '@/components/ui/text';
import { ICONS } from '@/constants/icon.constant';
import { useAuth } from '@/lib/auth/auth.context';
import { formatMoney } from '@/lib/format';
import { greeting } from '@/lib/greeting';
import { useAccounts } from '@/lib/hooks/use.accounts';
import { useCategories } from '@/lib/hooks/use.categories';
import { useDashboard } from '@/lib/hooks/use.dashboard';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const HomeScreen = () => {
  const { user, setHideBalance } = useAuth();
  const accounts = useAccounts();
  const dashboard = useDashboard();
  const categories = useCategories();
  const space = useTabBarSpace();
  const hidden = user?.preferences.hide_balance ?? false;
  const refreshing = accounts.isRefetching || dashboard.isRefetching;

  const refresh = () => {
    accounts.refetch();
    dashboard.refetch();
  };

  const toggleHidden = () =>
    setHideBalance({ hide: !hidden }).catch(() =>
      Alert.alert('Failed', 'Could not update balance visibility')
    );

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
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-muted-foreground">{greeting()}</Text>
                <Text className="font-grotesk-bold text-xl">{user?.name}</Text>
              </View>
              <Button
                size="icon"
                variant="ghost"
                onPress={toggleHidden}
                accessibilityLabel={hidden ? 'Show Balance' : 'Hide Balance'}>
                <HugeIcon icon={hidden ? ICONS.Password.Close : ICONS.Password.Open} />
              </Button>
            </View>
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
          {dashboard.data ? (
            <RecentTransactions
              transactions={dashboard.data.recent_transactions}
              accounts={accounts.data?.accounts ?? []}
              categories={categories.data ?? []}
              hidden={hidden}
              timeZone={user?.timezone}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;
