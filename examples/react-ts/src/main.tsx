import { WalletProvider } from '@txnlab/use-wallet-react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { walletManager } from './walletManager'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProvider manager={walletManager}>
      <App />
    </WalletProvider>
  </React.StrictMode>
)
