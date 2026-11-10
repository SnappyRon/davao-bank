/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      Text,
      createAnimatedComponent: (c: any) => c,
    },
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (fn: any) => {
      try {
        return fn() || {};
      } catch {
        return {};
      }
    },
    withTiming: (toValue: any, _config: any, cb: any) => {
      if (cb) cb(true);
      return toValue;
    },
    withSpring: (toValue: any, _config: any, cb: any) => {
      if (cb) cb(true);
      return toValue;
    },
    withSequence: (...anims: any[]) => anims[anims.length - 1],
    withDelay: (_delay: any, anim: any) => anim,
    runOnJS: (fn: any) => fn,
    // Used by react-native-gesture-handler's GestureDetector for worklet gestures.
    useEvent: () => () => {},
    useReducedMotion: () => false,
    // Layout transition builder (chainable); layout animations don't run in Jest.
    LinearTransition: {
      duration() {
        return this;
      },
      easing() {
        return this;
      },
    },
    Easing: {
      bezier: () => (x: any) => x,
      linear: (x: any) => x,
      ease: (x: any) => x,
      out: (fn: any) => fn,
      in: (fn: any) => fn,
      inOut: (fn: any) => fn,
    },
  };
});

jest.mock('react-native-worklets', () => ({}), { virtual: true });

// AsyncStorage has no native module under Jest. Components that read
// SettingsContext (e.g. TransactionRow reads hideBalance itself) pull it in
// through the components barrel; tests can still override this per file.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
