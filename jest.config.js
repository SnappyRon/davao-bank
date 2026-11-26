/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      modulePathIgnorePatterns: ['<rootDir>/.claude/'],
      displayName: 'scripts',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/scripts/__tests__/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          { tsconfig: '<rootDir>/packages/shared/tsconfig.json' },
        ],
      },
    },
    {
      modulePathIgnorePatterns: ['<rootDir>/.claude/'],
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
      modulePathIgnorePatterns: ['<rootDir>/.claude/'],
      displayName: 'mobile',
      preset: 'jest-expo',
      setupFiles: ['<rootDir>/tests/setup/mobile-setup.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/mobile-after-env.ts'],
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
      modulePathIgnorePatterns: ['<rootDir>/.claude/'],
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
