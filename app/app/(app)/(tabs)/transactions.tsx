import { Text } from '@/components/ui/text';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TransactionsScreen = () => {
  return (
    <View className="flex-1">
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <Text>Transactions</Text>
      </SafeAreaView>
    </View>
  );
};

export default TransactionsScreen;
