import { Dispatch } from 'redux';
import { RootState, store } from '..';
import { db } from '../db';
import { setLocation } from '../routing/actions';
import { showToast } from '../toast/actions';
import { NOTIFICATIONS_STATUS, UPDATE_NOTIFICATIONS_STATUS } from './types';

const messaging = window.firebase.messaging();

console.log('Notification.permission', Notification.permission);

const isGranted = () => Notification.permission === NOTIFICATIONS_STATUS.GRANTED;

export const initializeMessaging = async () => {
  messaging.onMessage(({ notification }) => {
    showToast({
      message: `${notification.title} ${notification.body}`,
      action: {
        title: '{$ notifications.toast.title $}',
        callback: () => {
          setLocation(notification.click_action);
        },
      },
    });
  });
  messaging.onTokenRefresh(() => getToken(true));
};

export const requestPermission = () => async (dispatch: Dispatch) => {
  try {
    await messaging.requestPermission();
    store.dispatch(getToken(true));
    } catch(error) {
      dispatch({
        type: UPDATE_NOTIFICATIONS_STATUS,
        status: NOTIFICATIONS_STATUS.DENIED,
      });
    }
};

export const getToken = (subscribe = false) => (dispatch: Dispatch, getState):  => {
  if (!subscribe && !isGranted()) {
    console.log(`getToken: subscribe ${subscribe} isGranted ${isGranted()}`);
    return;
  }
  messaging
    .getToken()
    .then((currentToken) => {
      if (currentToken) {
        const state: RootState = getState();

        const subscribersRef = db().collection('notificationsSubscribers').doc(currentToken);
        const subscribersPromise = subscribersRef.get();

        const userUid = 'uid' in state.user ? state.user.uid : null;

        let userSubscriptionsPromise = Promise.resolve(null);
        let userSubscriptionsRef;
        if (userUid) {
          userSubscriptionsRef = db().collection('notificationsUsers').doc(userUid);
          userSubscriptionsPromise = userSubscriptionsRef.get();
        }

        Promise.all([subscribersPromise, userSubscriptionsPromise]).then(
          ([subscribersSnapshot, userSubscriptionsSnapshot]) => {
            const isDeviceSubscribed = subscribersSnapshot.exists
              ? subscribersSnapshot.data()
              : false;
            const userSubscriptions =
              userSubscriptionsSnapshot && userSubscriptionsSnapshot.exists
                ? userSubscriptionsSnapshot.data()
                : {};

            const isUserSubscribed = !!(
              userSubscriptions.tokens && userSubscriptions.tokens[currentToken]
            );

            if (isDeviceSubscribed) {
              dispatch({
                type: UPDATE_NOTIFICATIONS_STATUS,
                status: NOTIFICATIONS_STATUS.GRANTED,
                token: currentToken,
              });
              if (userUid && !isUserSubscribed) {
                userSubscriptionsRef.set(
                  {
                    tokens: { [currentToken]: true },
                  },
                  { merge: true }
                );
              }
            } else if (!isDeviceSubscribed && subscribe) {
              subscribersRef.set({ value: true });
              if (userUid) {
                userSubscriptionsRef.set(
                  {
                    tokens: { [currentToken]: true },
                  },
                  { merge: true }
                );
              }
              dispatch({
                type: UPDATE_NOTIFICATIONS_STATUS,
                status: NOTIFICATIONS_STATUS.GRANTED,
                token: currentToken,
              });
            }
          }
        );
      } else {
        dispatch({
          type: UPDATE_NOTIFICATIONS_STATUS,
          status: Notification.permission,
          token: null,
        });
      }
    })
    .catch((error) => {
      dispatch({
        type: UPDATE_NOTIFICATIONS_STATUS,
        status: NOTIFICATIONS_STATUS.DENIED,
        token: null,
      });
    });
};

export const unsubscribe = (token: string) => async (dispatch: Dispatch) => {
  await messaging.deleteToken(token)
  dispatch({
    type: UPDATE_NOTIFICATIONS_STATUS,
    status: NOTIFICATIONS_STATUS.DEFAULT,
    token: null,
  });
};
