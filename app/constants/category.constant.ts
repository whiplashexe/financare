import {
  ArrowDataTransferHorizontalIcon,
  Briefcase01Icon,
  Bus01Icon,
  Car01Icon,
  Coins01Icon,
  Dumbbell01Icon,
  HealthIcon,
  Invoice01Icon,
  Money01Icon,
  MoreHorizontalIcon,
  PopcornIcon,
  ShoppingBag01Icon,
  SpoonAndForkIcon,
} from '@hugeicons/core-free-icons';
import type { TransactionType } from '@/lib/api/transactions';

type IconData = typeof SpoonAndForkIcon;

export const CATEGORY_ICON: Record<string, IconData> = {
  utensils: SpoonAndForkIcon,
  bus: Bus01Icon,
  car: Car01Icon,
  receipt: Invoice01Icon,
  'shopping-bag': ShoppingBag01Icon,
  popcorn: PopcornIcon,
  'heart-pulse': HealthIcon,
  dumbbell: Dumbbell01Icon,
  coins: Coins01Icon,
  banknote: Money01Icon,
  briefcase: Briefcase01Icon,
  ellipsis: MoreHorizontalIcon,
};

export const TYPE_FALLBACK_ICON: Record<TransactionType, IconData> = {
  INCOME: Money01Icon,
  OUTCOME: MoreHorizontalIcon,
  TRANSFER: ArrowDataTransferHorizontalIcon,
};
