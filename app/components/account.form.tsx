import { FormField } from '@/components/form.field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { AccountInput } from '@/lib/api/accounts';
import { applyApiError } from '@/lib/api/form.errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Switch, View } from 'react-native';
import z from 'zod';

const TYPES = [
  { value: 'BANK', label: 'Bank' },
  { value: 'EWALLET', label: 'E-wallet' },
  { value: 'CASH', label: 'Cash' },
];

const schema = z.object({
  name: z.string().trim().min(1, 'name required').max(50, 'max 50 characters'),
  type: z.enum(['BANK', 'EWALLET', 'CASH']),
  institution: z.string().trim(),
  initial_balance: z.string().regex(/^\d*$/, 'number only'),
  last4: z.string().regex(/^(\d{4})?$/, 'must 4 digits'),
  include_in_total: z.boolean(),
});

type Values = z.infer<typeof schema>;

const toInput = (values: Values): AccountInput => {
  const input: AccountInput = {
    name: values.name,
    type: values.type,
    initial_balance: Number(values.initial_balance || 0),
    include_in_total: values.include_in_total,
  };
  if (values.type !== 'CASH' && values.institution) input.institution = values.institution;
  if (values.last4) input.last4 = values.last4;
  return input;
};

type Props = {
  submitLabel: string;
  onSubmit: (input: AccountInput) => Promise<unknown>;
};

export const AccountForm = ({ submitLabel, onSubmit }: Props) => {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    watch,
    formState: { isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: 'BANK',
      institution: '',
      initial_balance: '',
      last4: '',
      include_in_total: true,
    },
  });

  const type = watch('type');

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(toInput(values));
    } catch (e) {
      setFormError(applyApiError(e, setError, ['name', 'institution', 'initial_balance', 'last4']));
    }
  });

  return (
    <View className="gap-4">
      <FormField control={control} name="name" label="Account Name" autoCapitalize="words" />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <View className="gap-1.5">
            <Label nativeID="type">Account Type</Label>
            <View className="flex-row gap-2">
              {TYPES.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant={field.value === item.value ? 'default' : 'outline'}
                  onPress={() => field.onChange(item.value)}>
                  <Text>{item.label}</Text>
                </Button>
              ))}
            </View>
          </View>
        )}
      />
      {type !== 'CASH' ? (
        <FormField control={control} name="institution" label="Institution (optional)" />
      ) : null}
      <FormField
        control={control}
        name="initial_balance"
        label="Initial Balance"
        keyboardType="number-pad"
        placeholder="0"
      />
      <FormField
        control={control}
        name="last4"
        label="Last 4 digits (optional)"
        keyboardType="number-pad"
        maxLength={4}
      />
      <Controller
        control={control}
        name="include_in_total"
        render={({ field }) => (
          <View className="flex-row items-center justify-between">
            <Text>Count balance total</Text>
            <Switch value={field.value} onValueChange={field.onChange} />
          </View>
        )}
      />
      {formError ? <Text className="text-sm text-destructive">{formError}</Text> : null}
      <Button onPress={() => submit()} disabled={isSubmitting}>
        <Text>{isSubmitting ? 'Saved...' : submitLabel}</Text>
      </Button>
    </View>
  );
};
