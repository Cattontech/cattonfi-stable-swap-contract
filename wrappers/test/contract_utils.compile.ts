import {CompilerConfig} from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'func',
  targets: ['tests/contracts/contract_utils.t.fc'],
}
