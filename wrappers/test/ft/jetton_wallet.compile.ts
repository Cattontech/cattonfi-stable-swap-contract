import {CompilerConfig} from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'func',
  targets: ['tests/contracts/jetton/ft/jetton_wallet.fc'],
}