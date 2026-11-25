const value = process.env.EXPO_PUBLIC_API_URL;

if (!value) {
  throw new Error("EXPO_PUBLIC_API_URL doesn't not in .env.local");
}

export const API_URL = value;
