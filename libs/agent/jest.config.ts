/* eslint-disable */
export default {
  displayName: 'agent',
  testEnvironment: 'node',
  testTimeout: 60_000,

  globals: {},
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/libs/agent',
  preset: '../../jest.preset.js',

  testPathIgnorePatterns: ['/node_modules/']
};
