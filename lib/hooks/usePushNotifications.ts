import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Show notifications as banners even when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(userId: string | undefined) {
  const router = useRouter();
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!userId) return;

    registerAndSaveToken(userId);

    // Navigate when user taps a notification
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (!data) return;

      if (data.type === 'message' && data.conversationId) {
        router.push(`/(app)/chat/${data.conversationId}?autoOpen=true`);
      } else if (data.type === 'group_message' && data.groupId) {
        router.push(`/(app)/chat/group/${data.groupId}?autoOpen=true`);
      } else if (data.type === 'friend_request' || data.type === 'friend_accepted') {
        router.push('/(app)/friends');
      }
    });

    return () => {
      responseListenerRef.current?.remove();
    };
  }, [userId]);
}

async function registerAndSaveToken(userId: string) {
  if (!Device.isDevice) return; // Push tokens don't work in simulators

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);
}
