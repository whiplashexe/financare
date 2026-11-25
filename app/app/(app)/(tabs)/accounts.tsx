import { useTabBarSpace } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/ui/hugeicon';
import { Text } from '@/components/ui/text';
import { ICONS } from '@/constants/icon.constant';
import type { Account, AccountType } from '@/lib/api/accounts';
import { ApiError } from '@/lib/api/error';
import { useAuth } from '@/lib/auth/auth.context';
import { formatMoney } from '@/lib/format';
import { useAccounts, useArchiveAccount } from '@/lib/hooks/use.accounts';
import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TYPE_LABEL: Record<AccountType, string> = {
  BANK: 'Bank',
  EWALLET: 'E-wallet',
  CASH: 'Cash',
};

const AccountsScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { data, refetch, isRefetching } = useAccounts();
  const archive = useArchiveAccount();
  const space = useTabBarSpace();
  const hidden = user?.preferences.hide_balance ?? false;

  const confirmArchive = (account: Account) => {
    Alert.alert(
      'Archive account',
      `Archie "${account.name}"?  transaction history still available.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () =>
            archive.mutate(
              { id: account.id },
              {
                onError: (e) =>
                  Alert.alert('Failed', e instanceof ApiError ? e.message : 'something went wrong'),
              }
            ),
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <FlatList
          data={data?.accounts ?? []}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={{ padding: 24, gap: 12, paddingBottom: space }}
          ListHeaderComponent={
            <View className="mb-3 gap-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-grotesk-bold text-2xl">Account</Text>
                <Button size="sm" onPress={() => router.push('/new-account')}>
                  <HugeIcon icon={ICONS.Add} />
                  <Text>Add</Text>
                </Button>
              </View>
              <View className="gap-1 rounded-3xl border border-border bg-card p-4">
                <Text className="text-sm text-muted-foreground">Total balance</Text>
                <Text className="font-grotesk-bold text-3xl">
                  {formatMoney({ amount: data?.total_balance ?? 0, hidden })}
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text className="text-center text-muted-foreground">No account yet</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => confirmArchive(item)}
              className="gap-1 rounded-3xl border border-border bg-card p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-grotesk-semibold">{item.name}</Text>
                <Text className="font-grotesk-semibold">
                  {formatMoney({ amount: item.current_balance, hidden })}
                </Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {TYPE_LABEL[item.type]}
                {item.institution ? ` · ${item.institution}` : ''}
                {item.last4 ? ` · •••• ${item.last4}` : ''}
              </Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </View>
  );
};

export default AccountsScreen;
