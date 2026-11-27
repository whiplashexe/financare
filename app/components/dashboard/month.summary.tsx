import { Text } from '@/components/ui/text';
import MONTH from '@/constants/month.constant';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MontSummary as MonthSummaryData } from '@/lib/api/dashboard';
import { View } from 'react-native';

const monthLabel = ({ month }: { month: string }) => {
  const [year, number] = month.split('-');
  return `${MONTH[Number(number) - 1]} ${year}`;
};

type ColumnProps = {
  label: string;
  amount: number;
  hidden: boolean;
  className?: string;
};

const Column = ({ amount, label, hidden, className }: ColumnProps) => (
  <View className="flex-1 gap-1">
    <Text className="text-sm text-muted-foreground" numberOfLines={1}>
      {label}
    </Text>
    <Text
      className={cn('font-grotesk-bold text-base', className)}
      numberOfLines={1}
      adjustsFontSizeToFit>
      {formatMoney({ amount, hidden })}
    </Text>
  </View>
);

type Props = {
  summary: MonthSummaryData;
  hidden: boolean;
};

export const MonthSummary = ({ summary, hidden }: Props) => (
  <View className="gap-4 rounded-3xl border border-border bg-card p-5">
    <Text className="font-grotesk-bold text-xl">{monthLabel({ month: summary.month })}</Text>
    <View className="flex-row gap-3">
      <Column
        label="Income"
        amount={summary.income}
        hidden={hidden}
        className="text-emerald-600 dark:text-emerald-400"
      />
    </View>
  </View>
);
