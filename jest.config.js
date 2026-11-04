/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'shared',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/shared/src/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          { tsconfig: '<rootDir>/packages/shared/tsconfig.json' },
        ],
      },
    },
    {
      displayName: 'mobile',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/apps/mobile/src/__tests__/**/*.test.(ts|tsx)'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|lucide-react-native)',
      ],
      moduleNameMapper: {
        '^@davao-bank/shared$': '<rootDir>/packages/shared/src/index.ts',
        '^lucide-react-native$':
          '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
      },
    },
    {
      displayName: 'admin',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/apps/admin/src/__tests__/**/*.test.(ts|tsx)'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/admin-setup.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/apps/admin/tsconfig.json' }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/apps/admin/src/$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/mocks/cssModuleMock.js',
      },
    },
  ],
};
