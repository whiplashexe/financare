import { Text } from '@/components/ui/text';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export const AuthScreen = ({ title, subtitle, children }: Props) => {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="flex-grow justify-center gap-6 p-6">
            <View className="gap-1">
              <Text className="font-grotesk-bold text-3xl">{title}</Text>
              {subtitle && <Text className="text-muted-foreground">{subtitle}</Text>}
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};
