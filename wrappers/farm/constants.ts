import {c} from '../common'

export const FarmGemOp = {
  // -----------------------------------------------------------------------
  // Gem Pool
  // -----------------------------------------------------------------------
  gem_pool_earn: c('gem_pool_earn'),
  gem_pool_stake: c('gem_pool_stake'),
  gem_pool_unstake: c('gem_pool_unstake'),
  gem_pool_init: c('gem_pool_init'),
  gem_pool_change_reward: c('gem_pool_change_reward'),

  // -----------------------------------------------------------------------
  // Gem User
  // -----------------------------------------------------------------------
  gem_buffer_stake: c('gem_buffer_stake'),
  gem_buffer_unstake: c('gem_buffer_unstake'),
}

type GemOpKey = keyof typeof FarmGemOp
export const FarmGemOpName = Object.keys(FarmGemOp).reduce(
  (prev, key) => {
    prev[key as GemOpKey] = key
    return prev
  },
  {} as {[K in GemOpKey]: string},
)
