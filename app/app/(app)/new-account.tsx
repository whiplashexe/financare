import { AccountForm } from '@/components/account.form';
import { AuthScreen } from '@/components/auth.screen';
import { useCreateAccount } from '@/lib/hooks/use.accounts';
import { useRouter } from 'expo-router';

const NewAccountScreen = () => {
  const router = useRouter();
  const create = useCreateAccount();

  return (
    <AuthScreen title="Add account">
      <AccountForm
        submitLabel="Save"
        onSubmit={async (input) => {
          await create.mutateAsync(input);
          router.back();
        }}
      />
    </AuthScreen>
  );
};

export default NewAccountScreen;
