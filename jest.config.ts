import type {Config} from 'jest'
import {defaults} from 'jest-config'

const config: Config = {
  ...defaults,
  preset: 'ts-jest',
  testEnvironment: './jest.fail.fast.js',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // silent: true,
}

export default config
