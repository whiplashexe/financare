import { HugeIcon } from '@/components/ui/hugeicon';
import { Text } from '@/components/ui/text';
import { CATEGORY_ICON, TYPE_FALLBACK_ICON } from '@/constants/category.constant';
import type { Account } from '@/lib/api/accounts';
import type { Category } from '@/lib/api/categories';
import type { TransactionSummary } from '@/lib/api/transactions';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Camera01Icon } from '@hugeicons/core-free-icons';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

const dayKey = ({ date, timeZone }: { date: Date; timeZone?: string }) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const formatWhen = ({ value, timeZone }: { value: string; timeZone?: string }) => {
  const date = new Date(value);
  const sameDay = dayKey({ date, timeZone }) === dayKey({ date: new Date(), timeZone });
  return new Intl.DateTimeFormat(
    'en-GB',
    sameDay
      ? { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { timeZone, day: 'numeric', month: 'short' }
  ).format(date);
};

const signedAmount = ({
  transaction,
  hidden,
}: {
  transaction: TransactionSummary;
  hidden: boolean;
}) => {
  const money = formatMoney({ amount: transaction.amount, hidden });
  if (transaction.type === 'INCOME') return `+${money}`;
  if (transaction.type === 'OUTCOME') return `-${money}`;
  return money;
};

const AMOUNT_CLASS: Record<TransactionSummary['type'], string> = {
  INCOME: 'text-emerald-600 dark:text-emerald-400',
  OUTCOME: 'text-foreground',
  TRANSFER: 'text-muted-foreground',
};

type RowProps = {
  transaction: TransactionSummary;
  accountName: (id: string | null) => string;
  category?: Category;
  hidden: boolean;
  timeZone?: string;
  first: boolean;
};

const TransactionRow = ({
  transaction,
  accountName,
  category,
  hidden,
  timeZone,
  first,
}: RowProps) => {
  const icon =
    transaction.type === 'TRANSFER'
      ? TYPE_FALLBACK_ICON.TRANSFER
      : (category?.icon && CATEGORY_ICON[category.icon]) || TYPE_FALLBACK_ICON[transaction.type];

  const where =
    transaction.type === 'TRANSFER'
      ? `${accountName(transaction.account_id)} → ${accountName(transaction.to_account_id)}`
      : `${accountName(transaction.account_id)} · ${formatWhen({ value: transaction.date, timeZone })}`;

  return (
    <View className={cn('flex-row items-center gap-3 p-4', !first && 'border-t border-border')}>
      <View className="h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <HugeIcon icon={icon} size={22} />
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="shrink font-grotesk-semibold" numberOfLines={1}>
            {transaction.name}
          </Text>
          {transaction.source === 'AUTO' ? (
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="font-grotesk-medium text-xs">Auto</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {where}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className={cn('font-grotesk-bold', AMOUNT_CLASS[transaction.type])} numberOfLines={1}>
          {signedAmount({ transaction, hidden })}
        </Text>
        {transaction.images_count > 0 ? (
          <View className="flex-row items-center gap-1">
            <HugeIcon icon={Camera01Icon} size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">{transaction.images_count}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

type Props = {
  transactions: TransactionSummary[];
  accounts: Account[];
  categories: Category[];
  hidden: boolean;
  timeZone?: string;
};

export const RecentTransactions = ({
  transactions,
  accounts,
  categories,
  hidden,
  timeZone,
}: Props) => {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const accountName = (id: string | null) => (id ? (accountNames.get(id) ?? 'Archived') : '-');

  return (
    <View className="gap-4 px-6">
      <View className="flex-row items-center justify-between">
        <Text className="font-grotesk-bold text-xl">Recent transactions</Text>
        <Link href="/transactions" asChild>
          <Pressable hitSlop={8}>
            <Text className="font-grotesk-medium text-muted-foreground">See all</Text>
          </Pressable>
        </Link>
      </View>
      {transactions.length === 0 ? (
        <View className="items-center gap-1 rounded-3xl border border-dashed border-border p-6">
          <Text className="font-grotesk-semibold">No transactions yet</Text>
          <Text className="text-sm text-muted-foreground">
            Your latest activity will show up here
          </Text>
        </View>
      ) : (
        <View className="overflow-hidden rounded-3xl border border-border bg-card">
          {transactions.map((transaction, index) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              accountName={accountName}
              category={
                transaction.category_id ? categoryById.get(transaction.category_id) : undefined
              }
              hidden={hidden}
              timeZone={timeZone}
              first={index === 0}
            />
          ))}
        </View>
      )}
    </View>
  );
};
