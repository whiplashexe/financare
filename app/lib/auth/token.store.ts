import * as SecureStore from 'expo-secure-store';

const REFRESH_KEY = 'refresh_token';
let accessToken: string | null = null;

export const tokens = {
  getAccess: () => accessToken,
  setAccess: (value: string | null) => {
    accessToken = value;
  },
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefresh: (value: string) => SecureStore.setItemAsync(REFRESH_KEY, value),
  clear: async () => {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
