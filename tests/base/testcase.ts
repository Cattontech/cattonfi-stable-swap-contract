/*
const INIT_STATES = [
  {
    tokens: [
      {
        isNative: true,
        name: 'TOKEN_A',
        decimal: 9n,
      },
      {
        isNative: false,
        name: 'TOKEN_B',
        decimal: 6n,
      },
    ],
    addLiquidity: 1_000n,
    amp: 200,
    fee: parseFee(0.3),
  },
  {
    // case:: change coin index
    // #### effect to change gas
    // exchange, remove, refund
    tokens: [
      {
        isNative: false,
        name: 'TOKEN_B',
        decimal: 6n,
      },
      {
        isNative: true,
        name: 'TOKEN_A',
        decimal: 9n,
      },
    ],
    addLiquidity: 1_000n,
    amp: 200,
    fee: parseFee(0.3),
  },
  {
    // case:: change coin type
    // #### effect to change gas
    // exchange, remove, refund, provider_lp, claim_fee
    tokens: [
      {
        isNative: false,
        name: 'TOKEN_A',
        decimal: 9n,
      },
      {
        isNative: false,
        name: 'TOKEN_B',
        decimal: 6n,
      },
    ],
    addLiquidity: 1_000n,
    amp: 200,
    fee: parseFee(0.3),
  },
]
*/

import {parseFee} from '../../wrappers'

const TON_NATIVE = {
  isNative: true,
  name: 'TON',
  decimal: 9n,
}

const TOKENS = [
  {
    isNative: false,
    name: 'TOKEN_A',
    decimal: 6n,
  },
  {
    isNative: false,
    name: 'TOKEN_B',
    decimal: 9n,
  },
  {
    isNative: false,
    name: 'TOKEN_C',
    decimal: 18n,
  },
  {
    isNative: false,
    name: 'TOKEN_D',
    decimal: 6n,
  },
  {
    isNative: false,
    name: 'TOKEN_E',
    decimal: 9n,
  },
  {
    isNative: false,
    name: 'TOKEN_F',
    decimal: 18n,
  },
  {
    isNative: false,
    name: 'TOKEN_G',
    decimal: 6n,
  },
  {
    isNative: false,
    name: 'TOKEN_H',
    decimal: 9n,
  },
]

export function generateTestCases() {
  const N_COINS = 8
  const cases = []

  for (let n_coins = 2; n_coins <= N_COINS; n_coins++) {
    /** case: all coins is tokens */
    const tokens = TOKENS.slice(0, n_coins)
    cases.push({
      tokens: tokens,
      addLiquidity: 100_000_000n,
      amp: 200,
      fee: parseFee(0.3),
    })

    /** cases: coins is tokens + native TON */
    /*
    // change native TON coin index: at first
    let ton_with_tokens = TOKENS.slice(0, n_coins - 1)
    ton_with_tokens.splice(0, 0, TON_NATIVE)
    cases.push({
      tokens: ton_with_tokens,
      addLiquidity: 1_000n,
      amp: 200,
      fee: parseFee(0.3),
    })

    // change native TON coin index: at mid
    ton_with_tokens = TOKENS.slice(0, n_coins - 1)
    ton_with_tokens.splice(Math.floor(n_coins / 2), 0, TON_NATIVE)
    cases.push({
      tokens: ton_with_tokens,
      addLiquidity: 1_000n,
      amp: 200,
      fee: parseFee(0.3),
    })

    // change native TON coin index: at last
    ton_with_tokens = TOKENS.slice(0, n_coins - 1)
    ton_with_tokens.splice(n_coins, 0, TON_NATIVE)
    cases.push({
      tokens: ton_with_tokens,
      addLiquidity: 1_000n,
      amp: 200,
      fee: parseFee(0.3),
    })
    */

    // /*
    for (let idx = 0; idx < n_coins; idx++) {
      const ton_with_tokens = TOKENS.slice(0, n_coins - 1)
      // change native TON coin index
      ton_with_tokens.splice(idx, 0, TON_NATIVE)
      cases.push({
        tokens: ton_with_tokens,
        addLiquidity: 1_000n,
        amp: 200,
        fee: parseFee(0.3),
      })
    }
    // */
  }

  return cases
}
