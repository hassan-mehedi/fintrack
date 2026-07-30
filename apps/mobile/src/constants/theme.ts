/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Hex conversions of the web app's oklch palette (apps/web/app/globals.css)
export const Colors = {
  light: {
    text: '#0a140e',
    textSecondary: '#5b675e',
    background: '#f6f9f7',
    backgroundElement: '#ffffff',
    backgroundSelected: '#d9eedf',
    border: '#d9e0db',
    primary: '#008339',
    onPrimary: '#ffffff',
    success: '#00a54f',
    danger: '#e7000b',
    warning: '#e1a200',
  },
  dark: {
    text: '#eaf1eb',
    textSecondary: '#819587',
    background: '#050b07',
    backgroundElement: '#0c1610',
    backgroundSelected: '#16231a',
    border: 'rgba(255, 255, 255, 0.12)',
    primary: '#00a54f',
    onPrimary: '#052e16',
    success: '#00a54f',
    danger: '#ff6467',
    warning: '#e1a200',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// The JS tab bar occupies its own layout space, so screens need no extra inset
export const BottomTabInset = 0;
export const MaxContentWidth = 800;
