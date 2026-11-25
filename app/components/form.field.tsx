import { Button } from '@/components/ui/button';
import { HugeIcon } from '@/components/ui/hugeicon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { ICONS } from '@/constants/icon.constant';
import { useState } from 'react';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';
import { TextInputProps, View } from 'react-native';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'> & {
  control: Control<T>;
  name: Path<T>;
  label: string;
  isPassword?: boolean;
};

export const FormField = <T extends FieldValues>({
  control,
  name,
  label,
  isPassword,
  ...inputProps
}: Props<T>) => {
  const [hidePassword, setHidePassword] = useState<boolean>(true);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View className="gap-1.5">
          <Label nativeID={name}>{label}</Label>
          <View className="flex-row gap-2">
            <Input
              value={String(field.value ?? '')}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={!!fieldState.error}
              className="font-grotesk flex-1"
              secureTextEntry={isPassword && hidePassword}
              {...inputProps}
            />
            {isPassword && (
              <Button size="icon" onPress={() => setHidePassword(!hidePassword)}>
                <HugeIcon
                  size={16}
                  icon={hidePassword ? ICONS.Password.Close : ICONS.Password.Open}
                />
              </Button>
            )}
          </View>
          {fieldState.error && (
            <Text className="text-sm text-destructive">{fieldState.error.message}</Text>
          )}
        </View>
      )}
    />
  );
};
