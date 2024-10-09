import '@ton/test-utils'
import JEST_CONFIG from '../jest.config'
import {toNano, fromNano, Cell, Address} from '@ton/core'
import {FT, WT} from '../wrappers/test'
import {
  createTokenOnchainMetadata,
  Errors,
  formatUnits,
  Liquidity,
  Op,
  OpName,
  parseFee,
  PlainPool,
  StableSwapFactory,
} from '../wrappers'
import {getCodes, getFactory} from '../scripts/utils'
import {FactoryRuntimeState} from './base/factory.init'
import {exportComputeGas, isAbortLog, resetAbortLog, setAbortLog, StoreGasUsed, wrapSend} from './base/base.utils'
import {generateTestCases} from './base/testcase'

/** https://docs.ton.org/learn/tvm-instructions/tvm-exit-codes */
describe('plain_pool', () => {
  const JEST_CONSOLE = console
  const NODE_CONSOLE = require('console')

  let st: FactoryRuntimeState
  const storeGasUsed = new StoreGasUsed()
  const opt = {opcodes: Op, errors: Errors}

  const INIT_STATES = generateTestCases()

  async function exportGas() {
    const utils = await st.contractUtils()
    const codes = await getCodes()

    const exports = [
      {
        name: 'buffer',
        path: 'gas/export/buffer.fc',
        ops: [OpName.buffer_token, OpName.buffer_add_liquidity, OpName.buffer_refund_me],
        code: codes.buffer_code,
      },
      {
        name: 'liquidity',
        path: 'gas/export/liquidity.fc',
        ops: [OpName.burn, OpName.transfer, OpName.internal_transfer],
        code: codes.liquidity_code,
      },
      {
        name: 'plain_pool',
        path: 'gas/export/plain_pool.fc',
        ops: [
          OpName.pool_init,
          OpName.pool_provide_lp,
          OpName.pool_provide_lp_ton,
          OpName.pool_exchange,
          OpName.pool_exchange_ton,
          OpName.pool_remove_liquidity,
          OpName.pool_remove_liquidity_imbalance,
          OpName.pool_remove_liquidity_one_coin,
          OpName.pool_claim_fee,
          OpName.pool_kill_me,
          OpName.pool_unkill_me,
          OpName.pool_ramp_a,
          OpName.pool_stop_ramp_a,
          OpName.pool_commit_new_fee,
          OpName.pool_apply_new_fee,
          OpName.pool_revert_new_parameters,
          OpName.pool_commit_transfer_ownership,
          OpName.pool_apply_transfer_ownership,
          OpName.pool_revert_transfer_ownership,
          OpName.pool_new_content,
          OpName.pool_new_fee_recipient,

          OpName.pool_add_liquidity,
          OpName.pool_refund_me,
        ],
        code: codes.pool_code,
      },
    ]

    for (const elment of exports) {
      const opGas = storeGasUsed.getOpGasContent(elment.ops)
      const {cells, bits} = await utils.getDataSize(elment.code)
      const codeSize = [
        'const int ' + elment.name + '_code::cells = ' + cells.toString() + ';',
        'const int ' + elment.name + '_code::bits = ' + bits.toString() + ';',
      ].join('\n')
      exportComputeGas(elment.path, opGas, codeSize)
    }
  }

  afterAll(async () => {
    await exportGas()
    storeGasUsed.logGas()
    global.console = JEST_CONSOLE
  })

  beforeAll(async () => {
    global.console = JEST_CONFIG.silent ? JEST_CONSOLE : NODE_CONSOLE
  })

  for (let idx = 0; idx < INIT_STATES.length; idx++) {
    const state = INIT_STATES[idx]

    describe(`state #${idx}`, () => {
      st = new FactoryRuntimeState()

      afterEach(async () => {
        const contracts: Record<string, any> = {
          factory: st.factory,
          pool: st.plain_pool,

          'deployer.buffer': st.deployer.buffer,
          'admin.buffer': st.admin.buffer,
          'bob.buffer': st.bob.buffer,
          'ali.buffer': st.ali.buffer,
          'other.buffer': st.other.buffer,

          'deployer.liquidity': st.deployer.liquidity,
          'admin.liquidity': st.admin.liquidity,
          'bob.liquidity': st.bob.liquidity,
          'ali.liquidity': st.ali.liquidity,
          'other.liquidity': st.other.liquidity,
        }
        const data: Record<string, string> = {}
        for (const key in contracts) {
          const balance = contracts[key] ? await contracts[key].getBalance() : 0
          data[key] = fromNano(balance)
        }
        !isAbortLog() && console.table([data])
        console.log(`#TESTCASE#: ${expect.getState().currentTestName}`, '\n\n')
        resetAbortLog()
      })

      beforeAll(async () => {
        console.log(`#START_STATE#:`, idx, state)

        await st.init()
        for (const [idx, token] of state.tokens.entries()) {
          st.tokens[idx] = token.isNative
            ? await WT.initToken(st.blockchain, st.deployer, token.name, token.decimal)
            : await FT.initToken(st.blockchain, st.deployer, token.name, token.decimal)
        }
        st.factory = st.blockchain.openContract(await getFactory(st.admin.address))
      }, 60000)

      describe('deploy', () => {
        it('deploy_factory (successed)', async () => {
          const send = await wrapSend(
            st.deployer,
            st.factory.sendMessage,
            toNano('50'),
            StableSwapFactory.msgTopUp(),
          )(opt)
          expect(send.result.transactions).toHaveTransaction({
            from: st.deployer.address,
            to: st.factory.address,
            deploy: true,
            success: true,
          })

          await st.initWallets()
          for (const actor of FactoryRuntimeState.actors) {
            for (const [idx, token] of state.tokens.entries()) {
              if (!token.isNative) {
                expect(await st[actor].tokens[idx].getJettonBalance()).toEqual(st.mint_amount * 10n ** token.decimal)
              }
            }
          }

          const {pools, ...factory_info} = await st.factory.getInfo()
          console.log(factory_info)
          for (const pool of pools) {
            console.log(pool)
          }
        })

        it('get_plain_pool_address', async () => {
          setAbortLog()
          await expect(
            st.factory.getPlainPoolAddress({
              amp: 10 ** 4 + 1,
              c_decimals: state.tokens.map((val) => val.decimal),
              coins: st.tokens.map((val) => val.address),
              fee: state.fee,
            }),
          ).rejects.toThrow(new RegExp(`exit_code: ${Errors.amp_out_of_range}$`))

          await expect(
            st.factory.getPlainPoolAddress({
              amp: state.amp,
              c_decimals: state.tokens.map((val) => val.decimal),
              coins: st.tokens.map((val) => val.address),
              fee: 5 * 10 ** 9 + 1,
            }),
          ).rejects.toThrow(new RegExp(`exit_code: ${Errors.fee_exceeded_maximum}$`))

          await expect(
            st.factory.getPlainPoolAddress({
              amp: state.amp,
              c_decimals: [...state.tokens.map((val) => val.decimal), 0],
              coins: st.tokens.map((val) => val.address),
              fee: state.fee,
            }),
          ).rejects.toThrow(new RegExp(`exit_code: ${Errors.decimals_len}$`))

          await expect(
            st.factory.getPlainPoolAddress({
              amp: state.amp,
              c_decimals: [19, ...state.tokens.slice(1).map((val) => val.decimal)],
              coins: st.tokens.map((val) => val.address),
              fee: state.fee,
            }),
          ).rejects.toThrow(new RegExp(`exit_code: ${Errors.decimal_exceeded_maximum}$`))
        })

        it('deploy_plain_pool (successed)', async () => {
          const pool_addr = await st.factory.getPlainPoolAddress({
            amp: state.amp,
            c_decimals: state.tokens.map((val) => val.decimal),
            coins: st.tokens.map((val) => val.address),
            fee: state.fee,
          })

          const poolWallets: (Address | null)[] = []
          for (const [idx, token] of st.tokens.entries()) {
            poolWallets[idx] = token.address ? (await token.wallet(pool_addr)).address : null
          }

          const body = StableSwapFactory.msgCreatePlainPool({
            amp: state.amp,
            c_decimals: state.tokens.map((val) => val.decimal),
            coins: st.tokens.map((val) => val.address),
            fee: state.fee,
            metadata: {
              symbol: 'A/B',
              name: 'Liquidity A/B',
              description: 'Liquidity Token',
              image: 'https://tonstakers.com/jetton/logo.svg',
            },
            poolWallets: poolWallets,
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.deployer, st.factory.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveOpGas(OpName.factory_create_plain_pool, Op.factory_create_plain_pool, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.pool_init, Op.pool_init, send.gasUsedTxs)

          expect(send.result.transactions).toHaveTransaction({
            from: st.factory.address,
            to: pool_addr,
            deploy: true,
            aborted: false,
          })

          await st.setPlainPool(PlainPool.fromAddress(pool_addr))

          console.log(await st.plain_pool.getInfo())
          console.log(await st.plain_pool.getReserves())
          const {pools, ...factory_info} = await st.factory.getInfo()
          console.log(factory_info)
          for (const pool of pools) {
            console.log(pool)
          }
          // console.log(await st.factory.getPoolTemplate())
        })
      })

      describe('pool_add_liquidity', () => {
        it('pool_provide_lp (successed)', async () => {
          const liquidityAmount = await st.plain_pool.getLiquidityAmount({
            amounts: state.tokens.map((token) => state.addLiquidity * 10n ** token.decimal),
            is_deposit: true,
          })
          console.log('liquidityAmount:', formatUnits(liquidityAmount, 18))
          console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50')

          const messages = await st.plain_pool.getMsgAddLiquidity({
            sender: st.deployer.address,
            amounts: state.tokens.map((token) => state.addLiquidity * 10n ** token.decimal),
            min_lp: 1n,
            fw_ton_amount: forward_ton_amount,
          })
          for (const msg of messages) {
            const send = await wrapSend(st.deployer, msg.senderWallet.sendMessage, msg_val + msg.value, msg.body)(opt)
            storeGasUsed.saveGas('pool_provide_lp (successed)', send.gas - (msg.type == 'ton' ? msg.value : 0n))
            if (send.gasUsedTxs[`${Op.transfer_notification}`]) {
              storeGasUsed.saveOpGas(OpName.pool_provide_lp, Op.transfer_notification, send.gasUsedTxs)
            } else {
              storeGasUsed.saveOpGas(OpName.pool_provide_lp_ton, Op.pool_provide_lp_ton, send.gasUsedTxs)
            }
            storeGasUsed.saveOpGas(OpName.buffer_token, Op.buffer_token, send.gasUsedTxs)
            if (send.gasUsedTxs[`${Op.buffer_add_liquidity_notification}`]) {
              storeGasUsed.saveOpGas(OpName.pool_add_liquidity, Op.buffer_add_liquidity_notification, send.gasUsedTxs)
              storeGasUsed.saveOpGas(OpName.internal_transfer, Op.internal_transfer, send, {
                from: st.plain_pool.address,
              })
            }
          }
          expect((await st.deployer.buffer.getState()).state.type).toEqual('uninit')

          const reserves = await st.plain_pool.getReserves()
          for (const [idx, balance] of reserves.balances.entries()) {
            expect(balance).toEqual(state.addLiquidity * 10n ** state.tokens[idx].decimal)
          }
          const deployerLP = await st.deployer.liquidity.getJettonBalance()
          expect(deployerLP).toEqual(liquidityAmount)
        })

        it('pool_provide_lp_one_coin (successed)', async () => {
          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50')
          let deployerLP = await st.deployer.liquidity.getJettonBalance()

          for (const [idx, token] of state.tokens.entries()) {
            const amounts = Array(state.tokens.length).fill(0n)
            amounts[idx] = state.addLiquidity * 10n ** token.decimal

            const messages = await st.plain_pool.getMsgAddLiquidity({
              sender: st.deployer.address,
              amounts: amounts,
              min_lp: 1n,
              fw_ton_amount: forward_ton_amount,
            })
            for (const msg of messages) {
              const send = await wrapSend(st.deployer, msg.senderWallet.sendMessage, msg_val + msg.value, msg.body)(opt)
              storeGasUsed.saveGas(
                'pool_provide_lp_one_coin (successed)',
                send.gas - (msg.type == 'ton' ? msg.value : 0n),
              )
              if (send.gasUsedTxs[`${Op.transfer_notification}`]) {
                storeGasUsed.saveOpGas(OpName.pool_provide_lp, Op.transfer_notification, send.gasUsedTxs)
              } else {
                storeGasUsed.saveOpGas(OpName.pool_provide_lp_ton, Op.pool_provide_lp_ton, send.gasUsedTxs)
              }
              storeGasUsed.saveOpGas(OpName.buffer_token, Op.buffer_token, send.gasUsedTxs)
              if (send.gasUsedTxs[`${Op.buffer_add_liquidity_notification}`]) {
                storeGasUsed.saveOpGas(OpName.pool_add_liquidity, Op.buffer_add_liquidity_notification, send.gasUsedTxs)
                storeGasUsed.saveOpGas(OpName.internal_transfer, Op.internal_transfer, send, {
                  from: st.plain_pool.address,
                  to: st.deployer.liquidity.address,
                })
              }
            }
            expect((await st.deployer.buffer.getState()).state.type).toEqual('uninit')
            const newLp = await st.deployer.liquidity.getJettonBalance()
            expect(newLp).toBeGreaterThan(deployerLP)
            console.log('LP minted:', formatUnits(newLp - deployerLP, 18))
            deployerLP = newLp
          }
        })

        // #### effect to change gas
        // exchange, remove_imbalance, remove_one_coin
        it.skip('pool_provide_lp_one_coin (loop)', async () => {
          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50')
          let deployerLP = await st.deployer.liquidity.getJettonBalance()

          const step = state.addLiquidity / 100n
          for (let idx = 0; idx < 100; idx++) {
            const amounts = Array(state.tokens.length).fill(0n)
            amounts[0] = step * 10n ** state.tokens[0].decimal

            const messages = await st.plain_pool.getMsgAddLiquidity({
              sender: st.deployer.address,
              amounts: amounts,
              min_lp: 1n,
              fw_ton_amount: forward_ton_amount,
            })
            for (const msg of messages) {
              const send = await wrapSend(
                st.deployer,
                msg.senderWallet.sendMessage,
                msg_val + msg.value,
                msg.body,
              )(opt, true)
              storeGasUsed.saveGas(
                'pool_provide_lp_one_coin (successed)',
                send.gas - (msg.type == 'ton' ? msg.value : 0n),
              )
              if (send.gasUsedTxs[`${Op.transfer_notification}`]) {
                storeGasUsed.saveOpGas(OpName.pool_provide_lp, Op.transfer_notification, send.gasUsedTxs)
              } else {
                storeGasUsed.saveOpGas(OpName.pool_provide_lp_ton, Op.pool_provide_lp_ton, send.gasUsedTxs)
              }
              storeGasUsed.saveOpGas(OpName.buffer_token, Op.buffer_token, send.gasUsedTxs)
              if (send.gasUsedTxs[`${Op.buffer_add_liquidity_notification}`]) {
                storeGasUsed.saveOpGas(OpName.pool_add_liquidity, Op.buffer_add_liquidity_notification, send.gasUsedTxs)
                storeGasUsed.saveOpGas(OpName.internal_transfer, Op.internal_transfer, send, {
                  from: st.plain_pool.address,
                  to: st.deployer.liquidity.address,
                })
              }
            }
            expect((await st.deployer.buffer.getState()).state.type).toEqual('uninit')
            const newLp = await st.deployer.liquidity.getJettonBalance()
            expect(newLp).toBeGreaterThan(deployerLP)
            console.log('LP minted:', formatUnits(newLp - deployerLP, 18))
            deployerLP = newLp
          }
        })
      })

      describe('swap_token', () => {
        it('swap (successed)', async () => {
          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50')

          const info = await st.plain_pool.getInfo()
          for (const [i, tokenIn] of state.tokens.entries()) {
            for (const [j, tokenOut] of state.tokens.entries()) {
              if (i != j) {
                if (i > 0) console.log()
                const amountIn = 1n * 10n ** tokenIn.decimal
                const amountOut = await st.plain_pool.getSwapAmountOut({
                  in_idx: i,
                  amount_in: amountIn,
                  out_idx: j,
                })

                const msg = await st.plain_pool.getMsgSwap({
                  sender: st.ali.address,
                  fw_ton_amount: forward_ton_amount,
                  in_idx: info.coins[i],
                  amount_in: amountIn,
                  out_idx: info.coins[j],
                  min_out: amountOut,
                })
                const send = await wrapSend(st.ali, msg.senderWallet.sendMessage, msg_val + msg.value, msg.body)(opt)
                storeGasUsed.saveGas(
                  `swap ${tokenIn.isNative ? 'ton' : 'token'}->${tokenOut.isNative ? 'ton' : 'token'} (successed)`,
                  send.gas - (tokenIn.isNative ? msg.value : 0n) + (tokenOut.isNative ? amountOut : 0n),
                )
                if (send.gasUsedTxs[`${Op.transfer_notification}`]) {
                  storeGasUsed.saveOpGas(OpName.pool_exchange, Op.transfer_notification, send.gasUsedTxs)
                } else {
                  storeGasUsed.saveOpGas(OpName.pool_exchange_ton, Op.pool_exchange_ton, send.gasUsedTxs)
                }

                console.table(st.plain_pool.exportPayLogs(send.result.transactions))

                if (info.wallets[j]) {
                  expect(send.result.transactions).toHaveTransaction({
                    from: st.plain_pool.address,
                    to: info.wallets[j],
                    op: Op.transfer,
                  })
                }

                console.log(`getSwapAmountOut (${i}->${j}):`, formatUnits(amountOut, tokenOut.decimal))
                console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))
              }
            }
          }
        })
      })

      describe('remove_liquidity', () => {
        it('pool_remove_liquidity (successed)', async () => {
          const msg_val = toNano('50')

          const lpSupply = await st.plain_pool.getTotalSupply()
          const deployerLP = await st.deployer.liquidity.getJettonBalance()
          const lpAmount = deployerLP / 4n

          const reserves = await st.plain_pool.getReserves()
          const min_amounts = reserves.balances.map((val) => (val * lpAmount) / lpSupply)

          const ton_idx = await st.plain_pool.getIndex(null, false)
          let receive_ton = ton_idx >= 0 ? min_amounts[ton_idx] : 0n

          const msg = await st.plain_pool.getMsgRemoveLiquidity({
            sender: st.deployer.address,
            lp_amount: lpAmount,
            min_amounts: min_amounts,
          })
          const send = await wrapSend(st.deployer, msg.senderLiquidity.sendMessage, msg_val, msg.body)(opt)
          storeGasUsed.saveGas('pool_remove_liquidity (successed)', send.gas + receive_ton)
          storeGasUsed.saveOpGas(OpName.burn, Op.burn, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.pool_remove_liquidity, Op.burn_notification, send.gasUsedTxs)

          console.table(st.plain_pool.exportPayLogs(send.result.transactions))
          console.log(deployerLP, min_amounts)
          console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

          const lpAfter = await st.deployer.liquidity.getJettonBalance()
          expect(lpAfter).toEqual(deployerLP - lpAmount)

          const lpSupplyAfter = await st.plain_pool.getTotalSupply()
          expect(lpSupplyAfter).toEqual(lpSupply - lpAmount)
        })

        it('pool_remove_liquidity_imbalance (successed)', async () => {
          const msg_val = toNano('50')

          const lpSupply = await st.plain_pool.getTotalSupply()
          const deployerLP = await st.deployer.liquidity.getJettonBalance()

          const lpToBurn = await st.plain_pool.getLiquidityAmount({
            amounts: state.tokens.map((token) => 100n * 10n ** token.decimal),
            is_deposit: false,
          })

          const amounts = state.tokens.map((token) => 100n * 10n ** token.decimal)
          const ton_idx = await st.plain_pool.getIndex(null, false)
          let receive_ton = ton_idx >= 0 ? amounts[ton_idx] : 0n

          const msg = await st.plain_pool.getMsgRemoveLiquidityImbalance({
            sender: st.deployer.address,
            amounts: amounts,
          })
          const send = await wrapSend(st.deployer, msg.senderLiquidity.sendMessage, msg_val, msg.body)(opt)
          storeGasUsed.saveGas('pool_remove_liquidity_imbalance (successed)', send.gas + receive_ton)
          storeGasUsed.saveOpGas(OpName.burn, Op.burn, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.pool_remove_liquidity_imbalance, Op.burn_notification, send.gasUsedTxs)

          console.table(st.plain_pool.exportPayLogs(send.result.transactions))
          console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

          const lpAfter = await st.deployer.liquidity.getJettonBalance()
          const lpDiff = deployerLP - lpAfter
          expect(lpDiff).toBeGreaterThanOrEqual(lpToBurn)

          const lpSupplyAfter = await st.plain_pool.getTotalSupply()
          expect(lpSupply - lpSupplyAfter).toEqual(lpDiff)
        })

        it('pool_remove_liquidity_one_coin (successed)', async () => {
          const msg_val = toNano('50')

          let lpSupply = await st.plain_pool.getTotalSupply()
          let deployerLP = await st.deployer.liquidity.getJettonBalance()

          const info = await st.plain_pool.getInfo()
          const lpBurn = deployerLP / (100n * BigInt(info.n_coins))
          for (const [idx, token] of state.tokens.entries()) {
            const amountOut = await st.plain_pool.getWithdrawOneCoin({
              out_idx: st.tokens[idx].address,
              lp_amount: lpBurn,
            })

            let receive_ton = token.isNative ? amountOut : 0n

            const msg = await st.plain_pool.getMsgRemoveLiquidityOneCoin({
              sender: st.deployer.address,
              out_idx: st.tokens[idx].address,
              lp_amount: lpBurn,
              min_amount_out: amountOut,
            })
            const send = await wrapSend(st.deployer, msg.senderLiquidity.sendMessage, msg_val, msg.body)(opt)
            storeGasUsed.saveGas('pool_remove_liquidity_one_coin (successed)', send.gas + receive_ton)
            storeGasUsed.saveOpGas(OpName.burn, Op.burn, send.gasUsedTxs)
            storeGasUsed.saveOpGas(OpName.pool_remove_liquidity_one_coin, Op.burn_notification, send.gasUsedTxs)

            console.table(st.plain_pool.exportPayLogs(send.result.transactions))
            console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

            const lpAfter = await st.deployer.liquidity.getJettonBalance()
            expect(deployerLP - lpAfter).toEqual(lpBurn)

            const lpSupplyAfter = await st.plain_pool.getTotalSupply()
            expect(lpSupply - lpSupplyAfter).toEqual(lpBurn)

            lpSupply = await st.plain_pool.getTotalSupply()
            deployerLP = await st.deployer.liquidity.getJettonBalance()
          }
        })
      })

      describe('buffer_add_liquidity', () => {
        it('buffer_add_liquidity (successed)', async () => {
          const bobTokensBefore = await Promise.all(
            st.bob.tokens.map((val) => new Promise<bigint>((res, rej) => val.getJettonBalance().then(res).catch(rej))),
          )

          const liquidityAmount = await st.plain_pool.getLiquidityAmount({
            amounts: state.tokens.map((token) => state.addLiquidity * 10n ** token.decimal),
            is_deposit: true,
          })
          console.log('liquidityAmount:', formatUnits(liquidityAmount, 18))
          console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50')
          const amounts = state.tokens.map((token) => state.addLiquidity * 10n ** token.decimal)
          {
            // buffer tokens
            const messages = await st.plain_pool.getMsgAddLiquidity({
              sender: st.bob.address,
              amounts: amounts,
              min_lp: 0n, // => mark as buffer only
              fw_ton_amount: forward_ton_amount,
            })
            for (const msg of messages) {
              const send = await wrapSend(st.bob, msg.senderWallet.sendMessage, msg_val + msg.value, msg.body)(opt)
              storeGasUsed.saveGas('pool_provide_lp (successed)', send.gas - (msg.type == 'ton' ? msg.value : 0n))
              if (send.gasUsedTxs[`${Op.transfer_notification}`]) {
                storeGasUsed.saveOpGas(OpName.pool_provide_lp, Op.transfer_notification, send.gasUsedTxs)
              } else {
                storeGasUsed.saveOpGas(OpName.pool_provide_lp_ton, Op.pool_provide_lp_ton, send.gasUsedTxs)
              }
              storeGasUsed.saveOpGas(OpName.buffer_token, Op.buffer_token, send.gasUsedTxs)
              if (send.gasUsedTxs[`${Op.buffer_add_liquidity_notification}`]) {
                storeGasUsed.saveOpGas(OpName.pool_add_liquidity, Op.buffer_add_liquidity_notification, send.gasUsedTxs)
                storeGasUsed.saveOpGas(OpName.internal_transfer, Op.internal_transfer, send, {
                  from: st.plain_pool.address,
                })
              }
            }
          }

          // expect tokens buffered
          const data = await st.bob.buffer.getBufferData()
          for (const [idx, bobToken] of st.bob.tokens.entries()) {
            if (!state.tokens[idx].isNative) {
              expect(await bobToken.getJettonBalance()).toEqual(bobTokensBefore[idx] - amounts[idx])
            }
            expect(data.balances[idx]).toEqual(amounts[idx])
          }

          const add_amounts = amounts.map((val) => val / 2n)
          {
            // add liquidity
            const msg = await st.plain_pool.getMsgBufferAddLiquidity({
              sender: st.bob.address,
              min_lp: 0n,
              amounts: add_amounts,
            })
            const send = await wrapSend(st.bob, msg.senderBuffer.sendMessage, msg_val, msg.body)(opt)
            storeGasUsed.saveGas('buffer_add_liquidity (successed)', send.gas)
            storeGasUsed.saveOpGas(OpName.buffer_add_liquidity, Op.buffer_add_liquidity, send.gasUsedTxs)
            storeGasUsed.saveOpGas(OpName.pool_add_liquidity, Op.buffer_add_liquidity_notification, send.gasUsedTxs)
            storeGasUsed.saveOpGas(OpName.internal_transfer, Op.internal_transfer, send, {
              from: st.plain_pool.address,
              to: st.bob.liquidity.address,
            })
            console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))
          }
        })

        it('buffer_refund_me', async () => {
          const msg_val = toNano('50')
          const bufferBefore = await st.bob.buffer.getBufferData()
          const bobTokensBefore = await Promise.all(
            st.bob.tokens.map((val) => new Promise<bigint>((res, rej) => val.getJettonBalance().then(res).catch(rej))),
          )

          const ton_idx = await st.plain_pool.getIndex(null, false)
          let refund_ton = ton_idx >= 0 ? bufferBefore.balances[ton_idx] : 0n

          const msg = await st.plain_pool.getMsgBufferRefundMe(st.bob.address)
          const send = await wrapSend(st.bob, msg.senderBuffer.sendMessage, msg_val, msg.body)(opt)
          storeGasUsed.saveGas('buffer_refund_me (successed)', send.gas + refund_ton)
          storeGasUsed.saveOpGas(OpName.buffer_refund_me, Op.buffer_refund_me, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.pool_refund_me, Op.buffer_refund_me_notification, send.gasUsedTxs)

          console.table(st.plain_pool.exportPayLogs(send.result.transactions))

          expect((await st.bob.buffer.getState()).state.type).toEqual('uninit')
          const bufferAfter = await st.bob.buffer.getBufferData()
          expect(bufferAfter.balances).toEqual([])

          for (const [idx, bobToken] of st.bob.tokens.entries()) {
            if (!state.tokens[idx].isNative) {
              expect(await bobToken.getJettonBalance()).toEqual(bobTokensBefore[idx] + bufferBefore.balances[idx])
            }
          }
        })
      })

      describe('liquidity', () => {
        it('liquidity_send_tokens (successed)', async () => {
          const fwd_ton_amount = toNano('50')
          const msg_val = toNano('50') + fwd_ton_amount

          const bobLP = await st.bob.liquidity.getJettonBalance()
          const body = await Liquidity.msgTransfer({
            amount: bobLP,
            response: st.bob.address,
            to: st.other.address,
            forward_ton_amount: fwd_ton_amount,
            forward_payload: Cell.EMPTY,
          })

          const send = await wrapSend(st.bob, st.bob.liquidity.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('liquidity_send_tokens (successed)', send.gas - fwd_ton_amount)
          storeGasUsed.saveOpGas(OpName.transfer, Op.transfer, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.internal_transfer, Op.internal_transfer, send.gasUsedTxs)

          expect(await st.bob.liquidity.getJettonBalance()).toEqual(0n)
          expect(await st.other.liquidity.getJettonBalance()).toEqual(bobLP)
        })
      })

      describe('claim_fee', () => {
        it('claim_fee (successed)', async () => {
          const adminTokensBefore = await Promise.all(
            st.admin.tokens.map(
              (val) => new Promise<bigint>((res, rej) => val.getJettonBalance().then(res).catch(rej)),
            ),
          )

          const body = PlainPool.msgClaimFee()

          const reserves = await st.plain_pool.getReserves()
          // const ton_idx = await st.plain_pool.getIndex(null, false)
          // let receive_ton = ton_idx >= 0 ? reserves.admin_balances[ton_idx] : 0n

          const msg_val = toNano('50')
          const send = await wrapSend(st.other, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_fee (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_claim_fee, Op.pool_claim_fee, send.gasUsedTxs)

          console.table(st.plain_pool.exportPayLogs(send.result.transactions))

          const reservesAfter = await st.plain_pool.getReserves()
          for (const [idx, token] of state.tokens.entries()) {
            if (!token.isNative) {
              expect(await st.admin.tokens[idx].getJettonBalance()).toEqual(
                adminTokensBefore[idx] + reserves.admin_balances[idx],
              )
            }
            expect(reservesAfter.admin_balances[idx]).toEqual(0n)
          }
        })

        it('new_fee_recipient (successed)', async () => {
          const body = PlainPool.msgNewFeeRecipient({fee_recipient: st.other.address})

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('new_fee_recipient (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_new_fee_recipient, Op.pool_new_fee_recipient, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.fee_recipient).toEqualAddress(st.other.address)
        })

        it('withdraw_all_lp (successed)', async () => {
          for (const actor of FactoryRuntimeState.actors) {
            const account = st[actor]
            const msg_val = toNano('50')

            const lpSupply = await st.plain_pool.getTotalSupply()
            const lpAmount = await account.liquidity.getJettonBalance()
            if (lpAmount == 0n) continue

            const reserves = await st.plain_pool.getReserves()
            const min_amounts = reserves.balances.map((val) => (val * lpAmount) / lpSupply)

            const ton_idx = await st.plain_pool.getIndex(null, false)
            let receive_ton = ton_idx >= 0 ? min_amounts[ton_idx] : 0n

            const msg = await st.plain_pool.getMsgRemoveLiquidity({
              sender: account.address,
              lp_amount: lpAmount,
              min_amounts: min_amounts,
            })
            const send = await wrapSend(account, msg.senderLiquidity.sendMessage, msg_val, msg.body)(opt, true)
            storeGasUsed.saveGas('pool_remove_liquidity (successed)', send.gas + receive_ton)
            storeGasUsed.saveOpGas(OpName.burn, Op.burn, send.gasUsedTxs)
            storeGasUsed.saveOpGas(OpName.pool_remove_liquidity, Op.burn_notification, send.gasUsedTxs)

            console.table(st.plain_pool.exportPayLogs(send.result.transactions))
            console.log(lpAmount, min_amounts)
            console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

            const lpAfter = await st.deployer.liquidity.getJettonBalance()
            expect(lpAfter).toEqual(0n)

            const lpSupplyAfter = await st.plain_pool.getTotalSupply()
            expect(lpSupplyAfter).toEqual(lpSupply - lpAmount)
          }

          const reserves = await st.plain_pool.getReserves()
          expect(reserves.liquidity_supply).toEqual(0n)
          for (let idx = 0; idx < reserves.balances.length; idx++) {
            expect(reserves.balances[idx]).toEqual(0n)
            expect(reserves.admin_balances[idx]).toEqual(0n)
          }
        })
      })

      describe('ramp_pool', () => {
        it('ramp_a (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const future_a = 300
          const future_time = st.getTime() + 86400n

          const body = PlainPool.msgRampA({future_a, future_time})

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('ramp_a (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_ramp_a, Op.pool_ramp_a, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.initial_A_time).not.toEqual(info.future_A_time)
          expect(info.initial_A).not.toEqual(info.future_A)
          expect(info.future_A).toEqual(future_a * 100)
          expect(info.future_A_time).toEqual(Number(future_time))
        })

        it('stop_ramp_a (successed)', async () => {
          const body = PlainPool.msgStopRampA()

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('stop_ramp_a (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_stop_ramp_a, Op.pool_stop_ramp_a, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.initial_A_time).toEqual(info.future_A_time)
          expect(info.initial_A).toEqual(info.future_A)
        })
      })

      describe('manager', () => {
        it('kill_me (successed)', async () => {
          const body = PlainPool.msgKillMe()

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('kill_me (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_kill_me, Op.pool_kill_me, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.is_killed).toEqual(true)
        })

        it('unkill_me (successed)', async () => {
          const body = PlainPool.msgUnkillMe()

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('unkill_me (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_unkill_me, Op.pool_unkill_me, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.is_killed).toEqual(false)
        })

        const new_fee = parseFee(10)
        const new_admin_fee = parseFee(30)

        it('commit_new_fee (successed)', async () => {
          const body = PlainPool.msgCommitNewFee({new_fee, new_admin_fee})

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('commit_new_fee (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_commit_new_fee, Op.pool_commit_new_fee, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.future_fee).toEqual(new_fee)
          expect(info.future_admin_fee).toEqual(new_admin_fee)
          expect(info.admin_actions_deadline).toBeGreaterThan(0)

          st.setTime(info.admin_actions_deadline)
        })

        it('apply_new_fee (successed)', async () => {
          const body = PlainPool.msgApplyNewFee()

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('apply_new_fee (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_apply_new_fee, Op.pool_apply_new_fee, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.future_fee).toEqual(0)
          expect(info.future_admin_fee).toEqual(0)
          expect(info.admin_actions_deadline).toEqual(0)
          expect(info.fee).toEqual(new_fee)
          expect(info.admin_fee).toEqual(new_admin_fee)
        })

        it('revert_new_parameters (successed)', async () => {
          const body = PlainPool.msgRevertNewParameters()

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('revert_new_parameters (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_revert_new_parameters, Op.pool_revert_new_parameters, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.future_fee).toEqual(0)
          expect(info.future_admin_fee).toEqual(0)
          expect(info.admin_actions_deadline).toEqual(0)
        })

        it('new_content (successed)', async () => {
          const content = {
            symbol: '12345678901234567890123456789012345678901234567893',
            name: '12345678901234567890123456789012345678901234567892',
            description: '12345678901234567890123456789012345678901234567891',
            image: '12345678901234567890123456789012345678901234567890',
          }
          const body = PlainPool.msgNewContent(content)

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('new_content (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.pool_new_content, Op.pool_new_content, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.pool_new_content, Op.pool_new_content, send.gasUsedTxs)

          const info = await st.plain_pool.getJettonData()
          const new_content = createTokenOnchainMetadata({...content, decimals: '18'})
          expect(info.jetton_content.toBoc().toString('base64')).toEqual(new_content.toBoc().toString('base64'))
        })

        it('commit_transfer_ownership (successed)', async () => {
          const body = PlainPool.msgCommitTransferOwnership({new_admin: st.other.address})

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('commit_transfer_ownership (successed)', send.gas)
          storeGasUsed.saveOpGas(
            OpName.pool_commit_transfer_ownership,
            Op.pool_commit_transfer_ownership,
            send.gasUsedTxs,
          )

          const info = await st.plain_pool.getInfo()
          expect(info.future_admin).toEqualAddress(st.other.address)
          expect(info.transfer_admin_deadline).toBeGreaterThan(0)

          st.setTime(info.transfer_admin_deadline)
        })

        it('apply_transfer_ownership (successed)', async () => {
          const body = PlainPool.msgApplyTransferOwnership()

          const msg_val = toNano('50')
          const send = await wrapSend(st.admin, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('apply_transfer_ownership (successed)', send.gas)
          storeGasUsed.saveOpGas(
            OpName.pool_apply_transfer_ownership,
            Op.pool_apply_transfer_ownership,
            send.gasUsedTxs,
          )

          const info = await st.plain_pool.getInfo()
          expect(info.admin).toEqualAddress(st.other.address)
          expect(info.future_admin).toEqual(null)
          expect(info.transfer_admin_deadline).toEqual(0)
        })

        it('revert_transfer_ownership (successed)', async () => {
          const body = PlainPool.msgRevertTransferOwnership()

          const msg_val = toNano('50')
          const send = await wrapSend(st.other, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('revert_transfer_ownership (successed)', send.gas)
          storeGasUsed.saveOpGas(
            OpName.pool_revert_transfer_ownership,
            Op.pool_revert_transfer_ownership,
            send.gasUsedTxs,
          )

          const info = await st.plain_pool.getInfo()
          expect(info.future_admin).toEqual(null)
          expect(info.transfer_admin_deadline).toEqual(0)
        })

        it('pool_upgrade (successed)', async () => {
          const {pool_code} = await getCodes()
          const body = PlainPool.msgUpgrade(pool_code)

          const msg_val = toNano('50')
          const send = await wrapSend(st.other, st.plain_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('pool_upgrade (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.upgrade, Op.upgrade, send.gasUsedTxs)

          const info = await st.plain_pool.getInfo()
          expect(info.is_initialized).toBe(true)
        })
      })
    })
  }
})
