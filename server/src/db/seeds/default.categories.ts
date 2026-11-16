export type DefaultCategory = {
  name: string;
  type: "INCOME" | "OUTCOME";
  icon: string;
  isFallback: boolean;
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Makanan", type: "OUTCOME", icon: "utensils", isFallback: false },
  { name: "Transportasi", type: "OUTCOME", icon: "bus", isFallback: false },
  { name: "Tagihan", type: "OUTCOME", icon: "receipt", isFallback: false },
  { name: "Belanja", type: "OUTCOME", icon: "shopping-bag", isFallback: false },
  { name: "Hiburan", type: "OUTCOME", icon: "popcorn", isFallback: false },
  {
    name: "Kesehatan",
    type: "OUTCOME",
    icon: "heart-pulse",
    isFallback: false,
  },
  { name: "Biaya Admin", type: "OUTCOME", icon: "coins", isFallback: false },
  { name: "Lainnya", type: "OUTCOME", icon: "ellipsis", isFallback: true },
  { name: "Gaji", type: "INCOME", icon: "banknote", isFallback: false },
  { name: "Lainnya", type: "INCOME", icon: "ellipsis", isFallback: true },
];
