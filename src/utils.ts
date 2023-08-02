export const getDateByAddingDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};
