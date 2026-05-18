import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const REMEMBERED_EMAIL_KEY = 'auth:remembered-email';
const BIOMETRIC_ENABLED_KEY = 'auth:biometric-enabled';
const BIOMETRIC_SERVER_KEY = 'com.institutoignis.app';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function getRememberedEmail() {
  const { value } = await Preferences.get({ key: REMEMBERED_EMAIL_KEY });
  return value ?? '';
}

export async function setRememberedEmail(email: string) {
  if (!email) {
    await Preferences.remove({ key: REMEMBERED_EMAIL_KEY });
    return;
  }

  await Preferences.set({ key: REMEMBERED_EMAIL_KEY, value: email });
}

export async function getBiometricEnabled() {
  const { value } = await Preferences.get({ key: BIOMETRIC_ENABLED_KEY });
  return value === 'true';
}

export async function setBiometricEnabled(enabled: boolean) {
  if (!enabled) {
    await Preferences.remove({ key: BIOMETRIC_ENABLED_KEY });
    return;
  }

  await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: 'true' });
}

export async function isBiometricAvailable() {
  if (!isNativeApp()) return false;

  try {
    const result = await NativeBiometric.isAvailable();
    return !!result?.isAvailable;
  } catch (error) {
    console.error('Biometric availability check failed:', error);
    return false;
  }
}

export async function saveBiometricCredentials(email: string, password: string) {
  await NativeBiometric.setCredentials({
    username: email,
    password,
    server: BIOMETRIC_SERVER_KEY,
  });
}

export async function getBiometricCredentials() {
  return NativeBiometric.getCredentials({
    server: BIOMETRIC_SERVER_KEY,
  });
}

export async function verifyBiometricIdentity() {
  return NativeBiometric.verifyIdentity({
    reason: 'Entre com sua biometria',
    title: 'Instituto Ignis',
    subtitle: 'Confirme sua identidade',
    description: 'Use sua biometria para continuar',
  });
}

export async function clearBiometricCredentials() {
  try {
    await NativeBiometric.deleteCredentials({
      server: BIOMETRIC_SERVER_KEY,
    });
  } catch (error) {
    console.error('Failed to clear biometric credentials:', error);
  }
}
