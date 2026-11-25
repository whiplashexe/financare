import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

type Value = {
  skipped: boolean;
  skip: () => void;
};

const OnBoardingContext = createContext<Value | null>(null);

export const OnBoardingProvider = ({ children }: { children: ReactNode }) => {
  const [skipped, setSkipped] = useState<boolean>(false);
  const value = useMemo(() => ({ skipped, skip: () => setSkipped(true) }), [skipped]);
  return <OnBoardingContext.Provider value={value}>{children}</OnBoardingContext.Provider>;
};

export const useOnBoarding = () => {
  const value = useContext(OnBoardingContext);
  if (!value) throw new Error('use onboarding must used inside onboarding provider');
  return value;
};
