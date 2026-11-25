import CustomNavBar from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TAB_MENU } from '@/constants/tab.constant';
import { useAccounts } from '@/lib/hooks/use.accounts';
import { useOnBoarding } from '@/lib/onboarding';
import { Redirect, Tabs } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

const TabsLayout = () => {
  const { data, isPending, isError, refetch } = useAccounts();
  const { skipped } = useOnBoarding();
  const opened = useRef(false);

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text>Failed to load accounts data</Text>
        <Button onPress={() => refetch()}>
          <Text>Try again</Text>
        </Button>
      </View>
    );
  }

  const hasAccount = data.accounts.length > 0;
  if (hasAccount || skipped) opened.current = true;
  if (!opened.current) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <CustomNavBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'shift' }}>
      {TAB_MENU.map((item) => (
        <Tabs.Screen key={item.name} name={item.name} options={{ title: item.options.title }} />
      ))}
    </Tabs>
  );
};

export default TabsLayout;
