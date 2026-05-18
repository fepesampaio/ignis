import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  deactivatePushTokensForUser,
  getPushRouteFromNotificationData,
  initializePushNotifications,
} from '@/lib/pushNotifications';

export function PushNotificationsBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    void initializePushNotifications(user.id, {
      onNotificationReceived: (notification) => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['all-notifications'] });
        queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
        toast.info(notification.title, {
          description: notification.body,
        });
      },
      onNotificationAction: (notification) => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['all-notifications'] });
        queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
        navigate(getPushRouteFromNotificationData(notification.data));
      },
    });
  }, [navigate, queryClient, user?.id]);

  useEffect(() => {
    return () => {
      if (!user?.id) return;
      void deactivatePushTokensForUser(user.id);
    };
  }, [user?.id]);

  return null;
}
