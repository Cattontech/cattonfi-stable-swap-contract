import {Address, beginCell, Cell, ContractProvider, Dictionary} from '@ton/core'
import {
  BaseContract,
  createTokenOnchainMetadata,
  CommonOp,
  packIdxToAddr,
  packGrams,
  packAddrToIdx,
  TokenMetadata,
  msgAddrInt,
  unpackIdxToAddr,
  unpackGrams,
} from '../common'

export type PlainPoolParams = {
  amp: bigint | number
  fee: bigint | number
  coins: (Address | null)[]
  c_decimals: (bigint | number)[]
}

export class StableSwapFactory extends BaseContract {
  static fromAddress(address: Address) {
    return new StableSwapFactory(address)
  }

  static msgTopUp() {
    return beginCell().storeUint(CommonOp.top_up, 32).storeUint(0, 64).endCell()
  }

  static msgUpgrade(new_code: Cell, update_data?: Cell | null) {
    return beginCell()
      .storeUint(CommonOp.upgrade, 32)
      .storeUint(0, 64)
      .storeRef(new_code)
      .storeMaybeRef(update_data)
      .endCell()
  }

  static packInitState(args: {
    admin: Address
    fee_recipient?: Address
    is_permissionless?: boolean
    plain_pool: {
      admin_fee: bigint | number
      pool_code: Cell
      buffer_code: Cell
      liquidity_code: Cell
    }
  }) {
    return beginCell()
      .storeAddress(args.admin)
      .storeAddress(args.fee_recipient ?? args.admin)
      .storeBit(args.is_permissionless ?? true)
      .storeDict() // pools
      .storeMaybeRef(
        beginCell()
          .storeUint(args.plain_pool.admin_fee, 64)
          .storeRef(args.plain_pool.pool_code)
          .storeRef(args.plain_pool.buffer_code)
          .storeRef(args.plain_pool.liquidity_code)
          .endCell(),
      )
      .storeMaybeRef()
      .endCell()
  }

  static parseDictionaryPools(pools: Cell | null) {
    const dict =
      pools == null
        ? Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
        : Dictionary.loadDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), pools)
    return dict.keys().map((poolInt) => {
      const address = msgAddrInt(poolInt)
      const ds = dict.get(poolInt)!.beginParse()
      const type = ds.loadUint(2)
      const coins = unpackIdxToAddr(ds.loadMaybeRef() ?? Cell.EMPTY)
      const decimals = unpackGrams(ds.loadRef())
      return {type, address, coins, decimals}
    })
  }

  async getInfo(provider: ContractProvider) {
    const res = await provider.get('get_info', [])
    return {
      admin: res.stack.readAddressOpt(),
      fee_recipient: res.stack.readAddressOpt(),
      is_permissionless: res.stack.readBoolean(),
      pools: StableSwapFactory.parseDictionaryPools(res.stack.readCellOpt()),
    }
  }

  async getPoolTemplate(provider: ContractProvider) {
    const res = await provider.get('get_pool_template', [])
    return {
      plain_pool: res.stack.readCellOpt(),
      meta_pool: res.stack.readCellOpt(),
    }
  }

  static packPlainPoolParams(args: PlainPoolParams) {
    return beginCell()
      .storeUint(args.amp, 32)
      .storeUint(args.fee, 64)
      .storeDict(packIdxToAddr(args.coins))
      .storeRef(packGrams(args.c_decimals))
      .endCell()
  }

  async getPlainPoolAddress(provider: ContractProvider, args: PlainPoolParams) {
    const res = await provider.get('get_plain_pool_address', [
      {type: 'slice', cell: StableSwapFactory.packPlainPoolParams(args)},
    ])
    return res.stack.readAddress()
  }

  static msgCreatePlainPool(
    args: {
      poolWallets: (Address | null)[]
      metadata: Omit<TokenMetadata, 'decimals'>
    } & PlainPoolParams,
  ) {
    const wallets = beginCell()
      .storeDict(packAddrToIdx(args.poolWallets))
      .storeDict(packIdxToAddr(args.poolWallets))
      .endCell()
    return beginCell()
      .storeUint(CommonOp.factory_create_plain_pool, 32)
      .storeUint(0, 64)
      .storeRef(wallets)
      .storeRef(createTokenOnchainMetadata({...args.metadata, decimals: '18'}))
      .storeSlice(StableSwapFactory.packPlainPoolParams(args).asSlice())
      .endCell()
  }

  static msgTranferAdmin(new_admin: Address | null) {
    return beginCell().storeUint(CommonOp.factory_tranfer_admin, 32).storeUint(0, 64).storeAddress(new_admin).endCell()
  }

  static msgNewFeeRecipient(new_fee_recipient: Address | null) {
    return beginCell()
      .storeUint(CommonOp.factory_new_fee_recipient, 32)
      .storeUint(0, 64)
      .storeAddress(new_fee_recipient)
      .endCell()
  }

  static msgSetPermissionless(is_permissionless: boolean) {
    return beginCell()
      .storeUint(CommonOp.factory_set_permissionless, 32)
      .storeUint(0, 64)
      .storeBit(is_permissionless)
      .endCell()
  }

  static msgNewPlainPool(args: {admin_fee: bigint | number; pool_code: Cell; buffer_code: Cell; liquidity_code: Cell}) {
    return beginCell()
      .storeUint(CommonOp.factory_new_plain_pool, 32)
      .storeUint(0, 64)
      .storeRef(
        beginCell()
          .storeUint(args.admin_fee, 64)
          .storeRef(args.pool_code)
          .storeRef(args.buffer_code)
          .storeRef(args.liquidity_code)
          .endCell(),
      )
      .endCell()
  }

  static msgNewMetaPool(args: Cell) {
    return beginCell().storeUint(CommonOp.factory_new_plain_pool, 32).storeUint(0, 64).storeRef(args).endCell()
  }
}
