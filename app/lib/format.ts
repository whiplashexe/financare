const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export const formatMoney = ({ amount, hidden = false }: { amount: number; hidden: boolean }) =>
  hidden ? 'Rp ******' : rupiah.format(amount);
