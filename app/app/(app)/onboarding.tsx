import { AccountForm } from '@/components/account.form';
import { AuthScreen } from '@/components/auth.screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCreateAccount } from '@/lib/hooks/use.accounts';
import { useOnBoarding } from '@/lib/onboarding';
import { useRouter } from 'expo-router';

const OnBoardingScreen = () => {
  const router = useRouter();
  const create = useCreateAccount();
  const { skip } = useOnBoarding();

  return (
    <AuthScreen
      title="Create your first account"
      subtitle="Account is where your balance saved, like debit or wallet">
      <AccountForm
        submitLabel="Save"
        onSubmit={async (input) => {
          await create.mutateAsync(input);
          router.replace('/home');
        }}
      />
      <Button
        variant="ghost"
        onPress={() => {
          skip();
          router.replace('/home');
        }}>
        <Text>Skip this step</Text>
      </Button>
    </AuthScreen>
  );
};

export default OnBoardingScreen;
