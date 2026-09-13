import { WalletManagerPlugin } from '@txnlab/use-wallet-vue'
import { createApp } from 'vue'
import App from './App.vue'
import { walletManagerConfig } from './walletManager'

createApp(App).use(WalletManagerPlugin, walletManagerConfig).mount('#app')
