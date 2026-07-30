import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const webStorage = {
  get: async (key: string) =>
    (globalThis as { localStorage?: Storage }).localStorage?.getItem(key) ?? null,
  set: async (key: string, value: string) =>
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(key, value),
  remove: async (key: string) =>
    (globalThis as { localStorage?: Storage }).localStorage?.removeItem(key),
};

const nativeStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};

export const tokenStorage = Platform.OS === 'web' ? webStorage : nativeStorage;

export const ACCESS_TOKEN_KEY = 'fintrack.accessToken';
export const REFRESH_TOKEN_KEY = 'fintrack.refreshToken';
