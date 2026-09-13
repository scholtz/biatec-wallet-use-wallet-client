import { WalletProvider } from '@txnlab/use-wallet-solid'
/* @refresh reload */
import { render } from 'solid-js/web'
import { App } from './App'
import { walletManager } from './walletManager'

render(
  () => (
    <WalletProvider manager={walletManager}>
      <App />
    </WalletProvider>
  ),
  document.getElementById('root')!
)
