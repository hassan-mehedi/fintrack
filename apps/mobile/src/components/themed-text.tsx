import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'defaultBold'
    | 'title'
    | 'heading'
    | 'sectionTitle'
    | 'small'
    | 'smallBold'
    | 'tiny'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'defaultBold' && styles.defaultBold,
        type === 'title' && styles.title,
        type === 'heading' && styles.heading,
        type === 'sectionTitle' && styles.sectionTitle,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'tiny' && styles.tiny,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  tiny: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  defaultBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 700,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: 700,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#00a54f',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
