export const greeting = ({ date = new Date() }: { date?: Date } = {}) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};
