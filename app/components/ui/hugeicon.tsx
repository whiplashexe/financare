import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react-native';
import type { ComponentProps } from 'react';
import { useContext } from 'react';

type Props = ComponentProps<typeof HugeiconsIcon>;

export function HugeIcon({ className, size = 20, ...props }: Props) {
  const textClass = useContext(TextClassContext);

  return (
    <HugeiconsIcon className={cn('text-foreground', textClass, className)} size={size} {...props} />
  );
}
