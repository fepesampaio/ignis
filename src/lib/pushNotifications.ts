import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

let listenersRegistered = false;
let activePushUserId: string | null = null;

type PushHandlers = {
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationAction?: (notification: ActionPerformed['notification']) => void;
};

const canUsePushNotifications = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const normalizeRoute = (route?: string | null) => {
  if (!route) return '/notifications';
  return route.startsWith('/') ? route : `/${route}`;
};

const saveTokenForUser = async (userId: string, pushToken: string) => {
  const [{ version }, { data: existing }] = await Promise.all([
    App.getInfo(),
    supabase
      .from('device_push_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('push_token', pushToken)
      .maybeSingle(),
  ]);

  const payload = {
    user_id: userId,
    push_token: pushToken,
    platform: Capacitor.getPlatform(),
    app_version: version,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('device_push_tokens')
      .update(payload)
      .eq('id', existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('device_push_tokens').insert(payload);
  if (error) throw error;
};

const markNotificationAsRead = async (notificationId?: string | null) => {
  if (!notificationId) return;
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
};

export async function initializePushNotifications(userId: string, handlers: PushHandlers = {}) {
  if (!canUsePushNotifications()) return false;
  activePushUserId = userId;

  if (!listenersRegistered) {
    await PushNotifications.addListener('registration', async (token: Token) => {
      try {
        if (!activePushUserId) return;
        await saveTokenForUser(activePushUserId, token.value);
      } catch (error) {
        console.error('Failed to save push token:', error);
      }
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      handlers.onNotificationReceived?.(notification);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', async ({ notification }) => {
      const notificationId = notification.data?.notificationId as string | undefined;
      await markNotificationAsRead(notificationId);
      handlers.onNotificationAction?.(notification);
    });

    listenersRegistered = true;
  }

  const permissionStatus = await PushNotifications.checkPermissions();
  const permission =
    permissionStatus.receive === 'prompt'
      ? await PushNotifications.requestPermissions()
      : permissionStatus;

  if (permission.receive !== 'granted') {
    return false;
  }

  await PushNotifications.register();
  return true;
}

export async function deactivatePushTokensForUser(userId: string) {
  if (!canUsePushNotifications() || !userId) return;
  await supabase
    .from('device_push_tokens')
    .update({ is_active: false, last_seen_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export function getPushRouteFromNotificationData(data?: Record<string, unknown> | null) {
  return normalizeRoute((data?.route as string | undefined) ?? '/notifications');
}
