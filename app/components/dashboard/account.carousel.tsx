import { Text } from '@/components/ui/text';
import { ICONS } from '@/constants/icon.constant';
import { Account, AccountType } from '@/lib/api/accounts';
import { Link } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

const TYPE_ICON = {
  BANK: ICONS.Bank,
  EWALLET: ICONS.Ewallet,
  CASH: ICONS.Cash,
} satisfies Record<AccountType, typeof ICONS.Bank>;

const TYPE_LABEL: Record<AccountType, string> = {
  BANK: 'Bank',
  EWALLET: 'E-wallet',
  CASH: 'Cash',
};

const subtitle = ({ account }: { account: Account }) => {
  if (account.type !== 'BANK') return TYPE_LABEL[account.type];
  const parts = [account.institution, account.last4 ? `•••• ${account.last4}` : null].filter(
    Boolean
  );
  return parts.length ? parts.join(' . ') : TYPE_LABEL.BANK;
};

type Props = {
  accounts: Account[];
  hidden: boolean;
};

export const AccountCarousel = ({ accounts, hidden }: Props) => {
  const { width } = useWindowDimensions();
  const cardWidth = width * 0.78;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-center px-6">
        <Text className="font-grotesk-bold text-xl">Account</Text>
        <Link href="/accounts" asChild>
          <Pressable hitSlop={8}>
            <Text className="font-grotesk-medium text-muted-foreground">Manage</Text>
          </Pressable>
        </Link>
      </View>
      {accounts.length === 0 ? (
        <View className="px-6">
          <Link href="/new-account" asChild>
            <Pressable className="items-center gap-1 rounded-3xl border border-dashed border-border p-6">
              <Text className="font-grotesk-semibold">No account yet</Text>
              <Text className="text-sm text-muted-foreground">Click for add an account</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <View></View>
      )}
    </View>
  );
};
