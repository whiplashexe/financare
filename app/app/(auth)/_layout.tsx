import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'login',
};
const AuthLayout = () => {
  return <Stack screenOptions={{ headerShown: false }} />;
};

export default AuthLayout;
