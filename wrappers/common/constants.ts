import {c} from './utils'

export const Op = {
  top_up: c('top_up'),
  pay_to: c('pay_to'),
  upgrade: c('upgrade'),

  // -----------------------------------------------------------------------
  // Jetton Liquidity
  // -----------------------------------------------------------------------
  transfer: 0xf8a7ea5,
  transfer_notification: 0x7362d09c,
  internal_transfer: 0x178d4519,
  excesses: 0xd53276db,
  burn: 0x595f07bc,
  burn_notification: 0x7bdd97de,

  // -----------------------------------------------------------------------
  // Buffer
  // -----------------------------------------------------------------------
  buffer_token: c('buffer_token'),
  buffer_add_liquidity: c('buffer_add_liquidity'),
  buffer_add_liquidity_notification: c('buffer_add_liquidity_notification'),
  buffer_refund_me: c('buffer_refund_me'),
  buffer_refund_me_notification: c('buffer_refund_me_notification'),

  // -----------------------------------------------------------------------
  // Pool
  // -----------------------------------------------------------------------
  pool_init: c('pool_init'),
  pool_provide_lp: c('pool_provide_lp'),
  pool_provide_lp_ton: c('pool_provide_lp_ton'),
  pool_exchange: c('pool_exchange'),
  pool_exchange_ton: c('pool_exchange_ton'),
  pool_remove_liquidity: c('pool_remove_liquidity'),
  pool_remove_liquidity_imbalance: c('pool_remove_liquidity_imbalance'),
  pool_remove_liquidity_one_coin: c('pool_remove_liquidity_one_coin'),
  pool_claim_fee: c('pool_claim_fee'),
  pool_kill_me: c('pool_kill_me'),
  pool_unkill_me: c('pool_unkill_me'),
  pool_ramp_a: c('pool_ramp_a'),
  pool_stop_ramp_a: c('pool_stop_ramp_a'),
  pool_commit_new_fee: c('pool_commit_new_fee'),
  pool_apply_new_fee: c('pool_apply_new_fee'),
  pool_revert_new_parameters: c('pool_revert_new_parameters'),
  pool_commit_transfer_ownership: c('pool_commit_transfer_ownership'),
  pool_apply_transfer_ownership: c('pool_apply_transfer_ownership'),
  pool_revert_transfer_ownership: c('pool_revert_transfer_ownership'),
  pool_new_content: c('pool_new_content'),
  pool_new_fee_recipient: c('pool_new_fee_recipient'),

  // -----------------------------------------------------------------------
  // StableSwapFactory
  // -----------------------------------------------------------------------
  factory_create_plain_pool: c('factory_create_plain_pool'),
}

export const Errors = {
  insufficient_fee: 101,
  invalid_op: 102,
  workchain: 103,
  access_denied: 104,

  insufficient_funds: 105,
  receiver_is_sender: 106,

  zero_amount: 107,
  slippage_exceeded: 108,
  calculation_failure: 109,
  requires_all_tokens: 110,
  same_coin: 111,
  exceed_reserve: 112,
  zero_liquidity_supply: 113,
  zero_liquidity_burned: 114,
  during_ramp: 115,
  insufficient_time: 116,
  amp_out_of_range: 117,
  future_amp_too_low: 118,
  future_amp_too_high: 119,
  active_action: 120,
  no_active_action: 121,
  fee_exceeded_maximum: 122,
  admin_fee_exceeded_maximum: 123,
  killed: 124,
  not_initialized: 125,
  initialized: 126,

  no_wallet: 127,

  decimals_len: 160,
  decimal_exceeded_maximum: 161,
  no_coin: 162,
}

type OpKey = keyof typeof Op | 'pool_add_liquidity' | 'pool_refund_me'
export const OpName = Object.keys(Op).reduce(
  (prev, key) => {
    prev[key as OpKey] = key
    return prev
  },
  {
    pool_add_liquidity: 'pool_add_liquidity',
    pool_refund_me: 'pool_refund_me',
  } as {[K in OpKey]: string},
)

export function parseFee(fee: number) {
  if (fee < 0 || fee > 100) throw new Error('require fee from 0->100 %')
  return Math.floor((fee * 10 ** 10) / 100)
}
