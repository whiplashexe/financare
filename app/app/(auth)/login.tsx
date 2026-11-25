import { useAuth } from '@/lib/auth/auth.context';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { applyApiError } from '@/lib/api/form.errors';
import { AuthScreen } from '@/components/auth.screen';
import { View } from 'react-native';
import { FormField } from '@/components/form.field';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Link } from 'expo-router';
import { HugeIcon } from '@/components/ui/hugeicon';
import { ICONS } from '@/constants/icon.constant';
import { SocialConnections } from '@/components/social-connections';
import { Separator } from '@/components/ui/separator';
const schema = z.object({
  email: z.email('email format not valid'),
  password: z.string().min(1, 'password is required'),
});

type Values = z.infer<typeof schema>;

const LoginScreen = () => {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn({ email: values.email.trim(), password: values.password });
    } catch (e) {
      setFormError(applyApiError(e, setError, ['email', 'password']));
    }
  });

  return (
    <AuthScreen title="Login" subtitle="Manage your finance with Financare">
      <View className="gap-4">
        <FormField
          control={control}
          name="email"
          label="Email"
          placeholder="johndoe@gmail.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />
        <FormField
          control={control}
          name="password"
          placeholder="********"
          label="Password"
          isPassword
          autoCapitalize="none"
          textContentType="password"
          autoComplete="password"
        />
        {formError && <Text className="text-sm text-destructive">{formError}</Text>}
        <View className="flex-row justify-end">
          <Link asChild href="/forgot-password">
            <Text className="text-sm text-muted-foreground">Forget password?</Text>
          </Link>
        </View>
        <Button onPress={() => onSubmit()} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Loading...' : 'Login'}</Text>
          <HugeIcon icon={ICONS.Login} />
        </Button>
        <Link asChild href="/register">
          <Button variant="ghost">
            <Text>
              No account yet? <Text className="font-grotesk-bold">Create one</Text>
            </Text>
          </Button>
        </Link>

        <View className="flex-row items-center">
          <Separator className="flex-1" />
          <Text className="px-4 text-sm text-muted-foreground">or</Text>
          <Separator className="flex-1" />
        </View>
        <SocialConnections />
      </View>
    </AuthScreen>
  );
};

export default LoginScreen;
