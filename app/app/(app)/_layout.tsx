import { OnBoardingProvider } from '@/lib/onboarding';
import { Stack } from 'expo-router';

const AppLayout = () => {
  return (
    <OnBoardingProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="new-account" options={{ presentation: 'modal' }} />
      </Stack>
    </OnBoardingProvider>
  );
};

export default AppLayout;
