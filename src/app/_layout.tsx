import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '../components/Toast';
import { migrateDb } from '../db/migrate';
import { colors } from '../theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="simplepos.db" onInit={migrateDb}>
        <ToastProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="order/[id]" />
          </Stack>
        </ToastProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
