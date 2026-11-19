import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { collection, doc, getDocs, serverTimestamp, setDoc, type Firestore, type Timestamp } from 'firebase/firestore';
import { Platform } from 'react-native';

/**
 * Which app version each family phone runs, at shops/{shopId}/devices/{deviceId}.
 * Phones on v1.3+ write this whenever sync starts, so Settings can show who still needs an update.
 * Older app versions never read this collection, so it can't affect them.
 */
export type DeviceInfo = {
  device_id: string;
  user_name: string;
  platform: string;
  app_version: string;
  /** Online update this phone runs ("" = the version that came with the APK / iPhone build). */
  update_id: string;
  /** When that online update was published (ms), or null for the installed build. */
  update_created_at: number | null;
  runtime_version: string;
  seen_at: number | null;
};

export function thisPhoneVersion(): Pick<DeviceInfo, 'platform' | 'app_version' | 'update_id' | 'update_created_at' | 'runtime_version'> {
  const fromUpdate = !Updates.isEmbeddedLaunch && Updates.updateId;
  return {
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? '',
    update_id: fromUpdate ? (Updates.updateId ?? '') : '',
    update_created_at: fromUpdate ? (Updates.createdAt?.getTime() ?? null) : null,
    runtime_version: Updates.runtimeVersion ?? '',
  };
}

export async function reportThisPhone(fs: Firestore, shopId: string, deviceId: string, userName: string): Promise<void> {
  await setDoc(doc(fs, 'shops', shopId, 'devices', deviceId), {
    device_id: deviceId,
    user_name: userName,
    ...thisPhoneVersion(),
    seen_at: serverTimestamp(),
  });
}

export async function listFamilyPhones(fs: Firestore, shopId: string): Promise<DeviceInfo[]> {
  const snap = await getDocs(collection(fs, 'shops', shopId, 'devices'));
  return snap.docs
    .map((d) => {
      const v = d.data();
      return {
        device_id: String(v.device_id ?? d.id),
        user_name: String(v.user_name ?? ''),
        platform: String(v.platform ?? ''),
        app_version: String(v.app_version ?? ''),
        update_id: String(v.update_id ?? ''),
        update_created_at: typeof v.update_created_at === 'number' ? v.update_created_at : null,
        runtime_version: String(v.runtime_version ?? ''),
        seen_at: (v.seen_at as Timestamp | null)?.toMillis?.() ?? null,
      };
    })
    .sort((a, b) => (b.seen_at ?? 0) - (a.seen_at ?? 0));
}
