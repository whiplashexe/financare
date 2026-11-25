import { AuthScreen } from '@/components/auth.screen';
import { FormField } from '@/components/form.field';
import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/ui/hugeicon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { ICONS } from '@/constants/icon.constant';
import { applyApiError } from '@/lib/api/form.errors';
import { useAuth } from '@/lib/auth/auth.context';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import z from 'zod';

const schema = z
  .object({
    name: z.string().trim().min(1, 'name required').max(100, 'max 100 characters'),
    email: z.email('invalid email format'),
    password: z
      .string()
      .min(8, 'password min 8 characters')
      .max(128, 'password max 128 characters'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'mismatch confirm password',
  });

type Values = z.infer<typeof schema>;

const RegisterScreen = () => {
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp({
        email: values.email.trim(),
        name: values.name.trim(),
        password: values.password,
      });
    } catch (e) {
      setFormError(applyApiError(e, setError, ['name', 'email', 'password']));
    }
  });

  return (
    <AuthScreen title="Register" subtitle="Make your new Financare account">
      <View className="gap-4">
        <FormField
          control={control}
          name="name"
          label="Name"
          placeholder="johndoe"
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
        />
        <FormField
          control={control}
          name="email"
          label="Email"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="johndoe@gmail.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />
        <FormField
          control={control}
          name="password"
          label="Password"
          secureTextEntry
          autoCapitalize="none"
          placeholder="********"
          textContentType="newPassword"
          autoComplete="new-password"
        />
        <FormField
          control={control}
          name="confirm"
          secureTextEntry
          label="Repeat Password"
          placeholder="********"
          autoCapitalize="none"
          textContentType="newPassword"
        />
        {formError ? <Text className="text-sm text-destructive">{formError}</Text> : null}
        <Button onPress={() => onSubmit()} disabled={isSubmitting}>
          <Text>{isSubmitting ? 'Loading...' : 'Register'}</Text>
          <HugeIcon icon={ICONS.Register} />
        </Button>
        <Link href="/login" asChild>
          <Button variant="ghost">
            <Text>
              Has an account? <Text className="font-grotesk-bold">Login</Text>
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

export default RegisterScreen;
