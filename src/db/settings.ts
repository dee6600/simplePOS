import type { SQLiteDatabase } from 'expo-sqlite';

import type { Settings } from '../lib/types';

export const DEFAULT_SETTINGS: Settings = {
  showOrderType: false,
  restaurantName: 'Biryani House',
};

export type ShopSettingKey = 'show_order_type' | 'restaurant_name';

/** Shop settings are shared across the family's phones. */
export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    showOrderType: map.has('show_order_type') ? map.get('show_order_type') === '1' : DEFAULT_SETTINGS.showOrderType,
    restaurantName: map.get('restaurant_name') ?? DEFAULT_SETTINGS.restaurantName,
  };
}

export async function saveSetting(db: SQLiteDatabase, key: ShopSettingKey, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key, value,
  );
  await setDeviceSetting(db, 'settings_dirty', '1');
  await setDeviceSetting(db, 'settings_updated_at', String(Date.now()));
}

// ---- Per-phone settings (never synced) ----

export type DeviceSettingKey =
  | 'device_id'
  | 'user_name' // "Dad", "Mom"… shown as "by Dad" on entries
  | 'shop_id' // the shop this phone syncs with, when connected
  | 'my_phone' // this person's number, e.g. 919876543210
  | 'settings_dirty'
  | 'settings_updated_at'
  | `cursor_${string}`;

export async function getDeviceSetting(db: SQLiteDatabase, key: DeviceSettingKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM device_settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setDeviceSetting(db: SQLiteDatabase, key: DeviceSettingKey, value: string | null) {
  if (value === null) {
    await db.runAsync('DELETE FROM device_settings WHERE key = ?', key);
    return;
  }
  await db.runAsync(
    'INSERT INTO device_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

/** SQL expression for "this phone's user name", used when inserting rows. */
export const CURRENT_USER_SQL = "COALESCE((SELECT value FROM device_settings WHERE key = 'user_name'), '')";
