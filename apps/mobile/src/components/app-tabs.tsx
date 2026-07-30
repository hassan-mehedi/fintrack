import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof MaterialIcons.glyphMap;

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Dashboard', icon: 'dashboard' },
  { name: 'transactions', title: 'Transactions', icon: 'receipt-long' },
  { name: 'budgets', title: 'Budgets', icon: 'pie-chart' },
  { name: 'accounts', title: 'Accounts', icon: 'account-balance-wallet' },
  { name: 'settings', title: 'Settings', icon: 'settings' },
];

export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
        },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name={tab.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
