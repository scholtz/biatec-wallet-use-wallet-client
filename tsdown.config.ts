import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  // Peer deps and the WalletConnect SDKs stay external; consumers' bundlers resolve them.
  deps: {
    neverBundle: [
      'algosdk',
      '@txnlab/use-wallet',
      '@txnlab/use-wallet/adapter',
      '@walletconnect/sign-client',
      '@walletconnect/types',
      'socket.io-client',
      'cbor-x',
      'qrcode'
    ]
  }
})
