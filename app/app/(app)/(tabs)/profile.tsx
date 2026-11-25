import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/ui/hugeicon';
import { Text } from '@/components/ui/text';
import { ICONS } from '@/constants/icon.constant';
import { useAuth } from '@/lib/auth/auth.context';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ProfileScreen = () => {
  const { user, signOut } = useAuth();

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View className="gap-4 p-6">
          <Text className="font-grotesk-bold text-2xl">Profile</Text>
          <View className="gap-1 rounded-lg border border-border bg-card p-4">
            <Text className="font-grotesk-semibold">{user?.name}</Text>
            <Text className="text-muted-foreground">{user?.email}</Text>
            <Text className="text-sm text-muted-foreground">Timezone: {user?.timezone}</Text>
          </View>
          <Button variant="outline" onPress={() => signOut()}>
            <HugeIcon icon={ICONS.Logout} />
            <Text>Exit</Text>
          </Button>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default ProfileScreen;
