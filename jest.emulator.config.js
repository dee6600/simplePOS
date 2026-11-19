// Runs the Firebase emulator test in plain Node: same TypeScript transform as jest-expo, but without its
// React Native setup files (they replace fetch, which breaks Firebase Auth in Node).
// Use: npm run test:emulator
const { transform, transformIgnorePatterns } = require('jest-expo/jest-preset');

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.emulator.test.ts'],
  transform,
  transformIgnorePatterns,
};
