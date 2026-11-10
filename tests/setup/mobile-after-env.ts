/* eslint-disable @typescript-eslint/no-require-imports */
// Runs after the test framework is installed, so afterEach is available.
// Clears the global AsyncStorage mock between tests so stored settings never
// leak from one test into the next. Files that mock AsyncStorage themselves
// (without `clear`) are left alone.
afterEach(async () => {
  const storage = require('@react-native-async-storage/async-storage');
  const api = storage?.default ?? storage;
  if (typeof api?.clear === 'function') {
    await api.clear();
  }
});
