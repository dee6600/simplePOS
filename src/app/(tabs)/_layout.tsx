import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { colors } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

const tab = (title: string, icon: IconName, activeIcon: IconName) => ({
  title,
  tabBarIcon: ({ focused }: { focused: boolean }) => (
    <Ionicons name={focused ? activeIcon : icon} size={26} color={focused ? colors.primary : colors.muted} />
  ),
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.card },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('New Order', 'add-circle-outline', 'add-circle')} />
      <Tabs.Screen name="orders" options={tab('Orders', 'receipt-outline', 'receipt')} />
      <Tabs.Screen name="summary" options={tab('Summary', 'bar-chart-outline', 'bar-chart')} />
      <Tabs.Screen name="settings" options={tab('Settings', 'settings-outline', 'settings')} />
    </Tabs>
  );
}
