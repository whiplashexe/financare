import { useAuth } from '@/lib/auth/auth.context';
import { Redirect } from 'expo-router';

const Index = () => {
  const { status } = useAuth();
  return <Redirect href={status === 'signedIn' ? '/home' : '/login'} />;
};

export default Index;
