import { TAB_MENU } from '@/constants/tab.constant';
import { THEME } from '@/lib/theme';
import { HugeiconsIcon } from '@hugeicons/react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useColorScheme } from 'nativewind';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const useTabBarSpace = () => {
  const insets = useSafeAreaInsets();
  return insets.bottom + 100;
};

const CustomNavBar = ({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) => {
  const { colorScheme } = useColorScheme();
  const palette = THEME[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.primary, bottom: insets.bottom + 16 },
      ]}>
      {state.routes.map((route, index) => {
        const item = TAB_MENU.find((menu) => menu.name === route.name);
        if (!item) return null;

        const { options } = descriptors[route.key];
        const label = String(options.title ?? item.options.title);
        const isFocused = state.index === index;

        const onPress = () => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigateToTab(route.key);
          }
        };

        const onLongPress = () => {
          emitter.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <AnimatedPressable
            key={route.key}
            layout={LinearTransition.springify().mass(0.5)}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isFocused }}
            style={[
              styles.tabItem,
              { backgroundColor: isFocused ? palette.primaryForeground : 'transparent' },
            ]}>
            <HugeiconsIcon
              icon={item.options.icon}
              size={18}
              color={isFocused ? palette.primary : palette.primaryForeground}
            />
            {isFocused ? (
              <Animated.Text
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                numberOfLines={1}
                style={[styles.text, { color: palette.primary }]}>
                {label}
              </Animated.Text>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '94%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 40,
    paddingHorizontal: 8,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 30,
  },
  text: {
    marginLeft: 8,
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
  },
});

export default CustomNavBar;
