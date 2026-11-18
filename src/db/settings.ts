import type { SQLiteDatabase } from 'expo-sqlite';

import type { Settings } from '../lib/types';

export const DEFAULT_SETTINGS: Settings = {
  showOrderType: false,
  restaurantName: 'Biryani House',
};

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    showOrderType: map.has('show_order_type') ? map.get('show_order_type') === '1' : DEFAULT_SETTINGS.showOrderType,
    restaurantName: map.get('restaurant_name') ?? DEFAULT_SETTINGS.restaurantName,
  };
}

export async function saveSetting(db: SQLiteDatabase, key: 'show_order_type' | 'restaurant_name', value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}
