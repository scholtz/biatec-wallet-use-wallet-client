/**
 * Translations for the built-in connect dialog (`src/connect-dialog.ts`), covering every
 * language Biatec Wallet itself ships (see `src/locales/*.json` in
 * https://github.com/scholtz/wallet). Kept intentionally small — just the handful of strings
 * the dialog renders — rather than pulling in a full i18n framework.
 */
import type { BiatecMethod } from './transports/types'

export const SUPPORTED_LOCALES = [
  'af',
  'cs',
  'en',
  'es',
  'hu',
  'it',
  'nl',
  'ru',
  'sk',
  'tr'
] as const

export type BiatecLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: BiatecLocale = 'en'

export interface BiatecTranslation {
  title: string
  subtitle: string
  methodLabel: Record<BiatecMethod, string>
  methodHint: Record<BiatecMethod, string>
  /** May contain `<strong>` markup; inserted as HTML, not escaped. */
  methodInstructions: Record<BiatecMethod, string>
  /** `{method}` is replaced with the localized method label. */
  connectWith: string
  /** `{method}` is replaced with the localized method label. */
  preparing: string
  copyLink: string
  copied: string
  cancel: string
  pairingLink: string
  noWallet: string
  getItHere: string
  genericError: string
  /** Label of the button that opens the Biatec Direct popup. */
  openWallet: string
  /** Shown when the browser blocked the Biatec Direct popup. */
  popupBlocked: string
  /** Shown while the Biatec Direct popup is open and the user has not answered yet. */
  waitingForWallet: string
  /** Localized copy per `ConnectMethodState.errorKind`. */
  walletClosed: string
  userRejected: string
  wrongNetwork: string
  timedOut: string
  /** Label of the Direct button while the popup is already open (it only refocuses it). */
  showWalletWindow: string
  /** aria-label of the language switcher. */
  language: string
}

/** Substitutes `{method}` in `template` with `method`. */
export function formatMethod(template: string, method: string): string {
  return template.replace('{method}', method)
}

const en: BiatecTranslation = {
  title: 'Connect Biatec Wallet',
  subtitle: 'Choose how to connect',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Wallet on your phone — scan a code',
    liquid: 'Wallet on your phone — passkey, peer-to-peer',
    direct: 'Wallet in this browser — opens a new window'
  },
  methodInstructions: {
    walletconnect:
      'Open <strong>Biatec Wallet</strong> on your phone, tap the scan icon, and point your camera at this code.',
    liquid:
      "Open <strong>Biatec Wallet</strong>, choose <strong>Liquid Auth</strong>, and scan this code. You'll approve the connection with your device passkey — no relay server involved.",
    direct:
      'Click <strong>Open Biatec Wallet</strong>. The wallet opens in a new window; sign in if asked, then approve the connection. If nothing opens, allow pop-ups for this site and click again.'
  },
  connectWith: 'Connect with {method}',
  preparing: 'Preparing {method}…',
  copyLink: 'Copy link',
  copied: 'Copied!',
  cancel: 'Cancel',
  pairingLink: 'Pairing link',
  noWallet: "Don't have Biatec Wallet?",
  getItHere: 'Get it here',
  genericError: 'Something went wrong.',
  openWallet: 'Open Biatec Wallet',
  popupBlocked:
    'Your browser blocked the Biatec Wallet popup. Allow popups for this site, then click the button again.',
  waitingForWallet: 'Waiting for Biatec Wallet… Approve the connection in the popup window.',
  walletClosed:
    'The wallet window was closed before you finished. Click Open Biatec Wallet to try again.',
  userRejected: 'You declined the connection in Biatec Wallet. You can try again.',
  wrongNetwork:
    'Biatec Wallet is on a different network. Switch network in the wallet, then try again.',
  timedOut: 'Biatec Wallet did not respond in time. Try again.',
  showWalletWindow: 'Show wallet window',
  language: 'Language'
}

const cs: BiatecTranslation = {
  title: 'Připojit Biatec Wallet',
  subtitle: 'Vyberte, jak se připojit',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Peněženka v telefonu — naskenujte kód',
    liquid: 'Peněženka v telefonu — přístupový klíč, peer-to-peer',
    direct: 'Peněženka v tomto prohlížeči — otevře nové okno'
  },
  methodInstructions: {
    walletconnect:
      'Otevřete <strong>Biatec Wallet</strong> v telefonu, klepněte na ikonu skenování a namiřte fotoaparát na tento kód.',
    liquid:
      'Otevřete <strong>Biatec Wallet</strong>, zvolte <strong>Liquid Auth</strong> a naskenujte tento kód. Připojení schválíte přístupovým klíčem zařízení — bez relay serveru.',
    direct:
      'Klikněte na <strong>Otevřít Biatec Wallet</strong>. Peněženka se otevře v novém okně; v případě potřeby se přihlaste a poté připojení schvalte. Pokud se nic neotevře, povolte pro tento web vyskakovací okna a klikněte znovu.'
  },
  connectWith: 'Připojit přes {method}',
  preparing: 'Připravuje se {method}…',
  copyLink: 'Kopírovat odkaz',
  copied: 'Zkopírováno!',
  cancel: 'Zrušit',
  pairingLink: 'Párovací odkaz',
  noWallet: 'Nemáte Biatec Wallet?',
  getItHere: 'Stáhnout zde',
  genericError: 'Něco se pokazilo.',
  openWallet: 'Otevřít Biatec Wallet',
  popupBlocked:
    'Prohlížeč zablokoval vyskakovací okno Biatec Wallet. Povolte pro tento web vyskakovací okna a klikněte na tlačítko znovu.',
  waitingForWallet: 'Čekání na Biatec Wallet… Schvalte připojení ve vyskakovacím okně.',
  walletClosed:
    'Okno peněženky bylo zavřeno dříve, než jste skončili. Klikněte na Otevřít Biatec Wallet a zkuste to znovu.',
  userRejected: 'Připojení jste v Biatec Wallet odmítli. Můžete to zkusit znovu.',
  wrongNetwork: 'Biatec Wallet je na jiné síti. Přepněte síť v peněžence a zkuste to znovu.',
  timedOut: 'Biatec Wallet neodpověděla včas. Zkuste to znovu.',
  showWalletWindow: 'Zobrazit okno peněženky',
  language: 'Jazyk'
}

const sk: BiatecTranslation = {
  title: 'Pripojiť Biatec Wallet',
  subtitle: 'Vyberte, ako sa pripojiť',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Peňaženka v telefóne — naskenujte kód',
    liquid: 'Peňaženka v telefóne — prístupový kľúč, peer-to-peer',
    direct: 'Peňaženka v tomto prehliadači — otvorí nové okno'
  },
  methodInstructions: {
    walletconnect:
      'Otvorte <strong>Biatec Wallet</strong> v telefóne, ťuknite na ikonu skenovania a namierte fotoaparát na tento kód.',
    liquid:
      'Otvorte <strong>Biatec Wallet</strong>, zvoľte <strong>Liquid Auth</strong> a naskenujte tento kód. Pripojenie schválite prístupovým kľúčom zariadenia — bez relay servera.',
    direct:
      'Kliknite na <strong>Otvoriť Biatec Wallet</strong>. Peňaženka sa otvorí v novom okne; v prípade potreby sa prihláste a potom pripojenie schváľte. Ak sa nič neotvorí, povoľte pre túto stránku vyskakovacie okná a kliknite znova.'
  },
  connectWith: 'Pripojiť cez {method}',
  preparing: 'Pripravuje sa {method}…',
  copyLink: 'Kopírovať odkaz',
  copied: 'Skopírované!',
  cancel: 'Zrušiť',
  pairingLink: 'Párovací odkaz',
  noWallet: 'Nemáte Biatec Wallet?',
  getItHere: 'Stiahnuť tu',
  genericError: 'Niečo sa pokazilo.',
  openWallet: 'Otvoriť Biatec Wallet',
  popupBlocked:
    'Prehliadač zablokoval vyskakovacie okno Biatec Wallet. Povoľte pre túto stránku vyskakovacie okná a kliknite na tlačidlo znova.',
  waitingForWallet: 'Čaká sa na Biatec Wallet… Schváľte pripojenie vo vyskakovacom okne.',
  walletClosed:
    'Okno peňaženky bolo zavreté skôr, než ste skončili. Kliknite na Otvoriť Biatec Wallet a skúste to znova.',
  userRejected: 'Pripojenie ste v Biatec Wallet odmietli. Môžete to skúsiť znova.',
  wrongNetwork: 'Biatec Wallet je na inej sieti. Prepnite sieť v peňaženke a skúste to znova.',
  timedOut: 'Biatec Wallet neodpovedala včas. Skúste to znova.',
  showWalletWindow: 'Zobraziť okno peňaženky',
  language: 'Jazyk'
}

const es: BiatecTranslation = {
  title: 'Conectar Biatec Wallet',
  subtitle: 'Elige cómo conectarte',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Cartera en tu teléfono — escanea un código',
    liquid: 'Cartera en tu teléfono — clave de acceso, entre pares',
    direct: 'Cartera en este navegador — abre una ventana nueva'
  },
  methodInstructions: {
    walletconnect:
      'Abre <strong>Biatec Wallet</strong> en tu teléfono, toca el icono de escaneo y apunta la cámara a este código.',
    liquid:
      'Abre <strong>Biatec Wallet</strong>, elige <strong>Liquid Auth</strong> y escanea este código. Aprobarás la conexión con la clave de acceso de tu dispositivo, sin servidor de relay.',
    direct:
      'Haz clic en <strong>Abrir Biatec Wallet</strong>. La cartera se abre en una ventana nueva; inicia sesión si se te pide y luego aprueba la conexión. Si no se abre nada, permite las ventanas emergentes para este sitio y haz clic de nuevo.'
  },
  connectWith: 'Conectar con {method}',
  preparing: 'Preparando {method}…',
  copyLink: 'Copiar enlace',
  copied: '¡Copiado!',
  cancel: 'Cancelar',
  pairingLink: 'Enlace de emparejamiento',
  noWallet: '¿No tienes Biatec Wallet?',
  getItHere: 'Consíguela aquí',
  genericError: 'Algo salió mal.',
  openWallet: 'Abrir Biatec Wallet',
  popupBlocked:
    'Tu navegador bloqueó la ventana emergente de Biatec Wallet. Permite las ventanas emergentes para este sitio y vuelve a hacer clic en el botón.',
  waitingForWallet: 'Esperando a Biatec Wallet… Aprueba la conexión en la ventana emergente.',
  walletClosed:
    'La ventana de la cartera se cerró antes de terminar. Haz clic en Abrir Biatec Wallet para intentarlo de nuevo.',
  userRejected: 'Rechazaste la conexión en Biatec Wallet. Puedes intentarlo de nuevo.',
  wrongNetwork: 'Biatec Wallet está en otra red. Cambia de red en la cartera e inténtalo de nuevo.',
  timedOut: 'Biatec Wallet no respondió a tiempo. Inténtalo de nuevo.',
  showWalletWindow: 'Mostrar ventana de la cartera',
  language: 'Idioma'
}

const hu: BiatecTranslation = {
  title: 'Biatec Wallet csatlakoztatása',
  subtitle: 'Válaszd ki, hogyan csatlakozol',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Tárca a telefonodon — olvass be egy kódot',
    liquid: 'Tárca a telefonodon — jelszókulcs, egyenrangú',
    direct: 'Tárca ebben a böngészőben — új ablakot nyit'
  },
  methodInstructions: {
    walletconnect:
      'Nyisd meg a <strong>Biatec Wallet</strong>-et a telefonodon, koppints a beolvasás ikonra, és irányítsd a kamerát erre a kódra.',
    liquid:
      'Nyisd meg a <strong>Biatec Wallet</strong>-et, válaszd a <strong>Liquid Auth</strong> lehetőséget, és olvasd be ezt a kódot. A kapcsolatot az eszköz jelszókulcsával hagyod jóvá, relay szerver nélkül.',
    direct:
      'Kattints a <strong>Biatec Wallet megnyitása</strong> gombra. A tárca új ablakban nyílik meg; ha kéri, jelentkezz be, majd hagyd jóvá a kapcsolatot. Ha semmi sem nyílik meg, engedélyezd az előugró ablakokat ezen az oldalon, és kattints újra.'
  },
  connectWith: 'Csatlakozás ezzel: {method}',
  preparing: '{method} előkészítése…',
  copyLink: 'Link másolása',
  copied: 'Másolva!',
  cancel: 'Mégse',
  pairingLink: 'Párosítási link',
  noWallet: 'Nincs Biatec Wallet-ed?',
  getItHere: 'Szerezd be itt',
  genericError: 'Hiba történt.',
  openWallet: 'Biatec Wallet megnyitása',
  popupBlocked:
    'A böngésződ blokkolta a Biatec Wallet előugró ablakát. Engedélyezd az előugró ablakokat ezen az oldalon, majd kattints újra a gombra.',
  waitingForWallet: 'Várakozás a Biatec Wallet-re… Hagyd jóvá a kapcsolatot az előugró ablakban.',
  walletClosed:
    'A tárca ablaka bezárult, mielőtt végeztél volna. Kattints a Biatec Wallet megnyitása gombra az újrapróbáláshoz.',
  userRejected: 'Elutasítottad a kapcsolatot a Biatec Walletben. Újra megpróbálhatod.',
  wrongNetwork:
    'A Biatec Wallet másik hálózaton van. Válts hálózatot a tárcában, majd próbáld újra.',
  timedOut: 'A Biatec Wallet nem válaszolt időben. Próbáld újra.',
  showWalletWindow: 'Tárca ablakának megjelenítése',
  language: 'Nyelv'
}

const it: BiatecTranslation = {
  title: 'Connetti Biatec Wallet',
  subtitle: 'Scegli come connetterti',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Wallet sul telefono — scansiona un codice',
    liquid: 'Wallet sul telefono — passkey, peer-to-peer',
    direct: 'Wallet in questo browser — apre una nuova finestra'
  },
  methodInstructions: {
    walletconnect:
      "Apri <strong>Biatec Wallet</strong> sul telefono, tocca l'icona di scansione e inquadra questo codice con la fotocamera.",
    liquid:
      'Apri <strong>Biatec Wallet</strong>, scegli <strong>Liquid Auth</strong> e scansiona questo codice. Approverai la connessione con la passkey del dispositivo, senza alcun server relay.',
    direct:
      'Fai clic su <strong>Apri Biatec Wallet</strong>. Il wallet si apre in una nuova finestra; accedi se richiesto, poi approva la connessione. Se non si apre nulla, consenti i popup per questo sito e fai di nuovo clic.'
  },
  connectWith: 'Connetti con {method}',
  preparing: 'Preparazione di {method}…',
  copyLink: 'Copia link',
  copied: 'Copiato!',
  cancel: 'Annulla',
  pairingLink: 'Link di associazione',
  noWallet: 'Non hai Biatec Wallet?',
  getItHere: 'Scaricalo qui',
  genericError: 'Qualcosa è andato storto.',
  openWallet: 'Apri Biatec Wallet',
  popupBlocked:
    'Il browser ha bloccato il popup di Biatec Wallet. Consenti i popup per questo sito, poi fai di nuovo clic sul pulsante.',
  waitingForWallet: 'In attesa di Biatec Wallet… Approva la connessione nella finestra popup.',
  walletClosed:
    'La finestra del wallet è stata chiusa prima che finissi. Fai clic su Apri Biatec Wallet per riprovare.',
  userRejected: 'Hai rifiutato la connessione in Biatec Wallet. Puoi riprovare.',
  wrongNetwork: 'Biatec Wallet è su una rete diversa. Cambia rete nel wallet, poi riprova.',
  timedOut: 'Biatec Wallet non ha risposto in tempo. Riprova.',
  showWalletWindow: 'Mostra finestra del wallet',
  language: 'Lingua'
}

const nl: BiatecTranslation = {
  title: 'Biatec Wallet verbinden',
  subtitle: 'Kies hoe je wilt verbinden',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Wallet op je telefoon — scan een code',
    liquid: 'Wallet op je telefoon — toegangssleutel, peer-to-peer',
    direct: 'Wallet in deze browser — opent een nieuw venster'
  },
  methodInstructions: {
    walletconnect:
      'Open <strong>Biatec Wallet</strong> op je telefoon, tik op het scanicoon en richt je camera op deze code.',
    liquid:
      'Open <strong>Biatec Wallet</strong>, kies <strong>Liquid Auth</strong> en scan deze code. Je keurt de verbinding goed met de toegangssleutel van je apparaat, zonder relayserver.',
    direct:
      'Klik op <strong>Biatec Wallet openen</strong>. De wallet opent in een nieuw venster; log in als daarom wordt gevraagd en keur daarna de verbinding goed. Opent er niets, sta dan pop-ups toe voor deze site en klik opnieuw.'
  },
  connectWith: 'Verbinden met {method}',
  preparing: '{method} wordt voorbereid…',
  copyLink: 'Link kopiëren',
  copied: 'Gekopieerd!',
  cancel: 'Annuleren',
  pairingLink: 'Koppelingslink',
  noWallet: 'Heb je geen Biatec Wallet?',
  getItHere: 'Download hier',
  genericError: 'Er is iets misgegaan.',
  openWallet: 'Biatec Wallet openen',
  popupBlocked:
    'Je browser heeft de pop-up van Biatec Wallet geblokkeerd. Sta pop-ups toe voor deze site en klik nogmaals op de knop.',
  waitingForWallet: 'Wachten op Biatec Wallet… Keur de verbinding goed in het pop-upvenster.',
  walletClosed:
    'Het walletvenster is gesloten voordat je klaar was. Klik op Biatec Wallet openen om het opnieuw te proberen.',
  userRejected: 'Je hebt de verbinding in Biatec Wallet geweigerd. Je kunt het opnieuw proberen.',
  wrongNetwork:
    'Biatec Wallet staat op een ander netwerk. Wissel van netwerk in de wallet en probeer het opnieuw.',
  timedOut: 'Biatec Wallet reageerde niet op tijd. Probeer het opnieuw.',
  showWalletWindow: 'Walletvenster tonen',
  language: 'Taal'
}

const ru: BiatecTranslation = {
  title: 'Подключить Biatec Wallet',
  subtitle: 'Выберите способ подключения',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Кошелёк на телефоне — отсканируйте код',
    liquid: 'Кошелёк на телефоне — ключ доступа, одноранговое',
    direct: 'Кошелёк в этом браузере — откроется новое окно'
  },
  methodInstructions: {
    walletconnect:
      'Откройте <strong>Biatec Wallet</strong> на телефоне, нажмите значок сканирования и наведите камеру на этот код.',
    liquid:
      'Откройте <strong>Biatec Wallet</strong>, выберите <strong>Liquid Auth</strong> и отсканируйте этот код. Вы подтвердите подключение ключом доступа устройства — без relay-сервера.',
    direct:
      'Нажмите <strong>Открыть Biatec Wallet</strong>. Кошелёк откроется в новом окне; при необходимости войдите, затем подтвердите подключение. Если ничего не открылось, разрешите всплывающие окна для этого сайта и нажмите ещё раз.'
  },
  connectWith: 'Подключиться через {method}',
  preparing: 'Подготовка {method}…',
  copyLink: 'Скопировать ссылку',
  copied: 'Скопировано!',
  cancel: 'Отмена',
  pairingLink: 'Ссылка для подключения',
  noWallet: 'Нет Biatec Wallet?',
  getItHere: 'Получить здесь',
  genericError: 'Что-то пошло не так.',
  openWallet: 'Открыть Biatec Wallet',
  popupBlocked:
    'Браузер заблокировал всплывающее окно Biatec Wallet. Разрешите всплывающие окна для этого сайта и нажмите кнопку ещё раз.',
  waitingForWallet: 'Ожидание Biatec Wallet… Подтвердите подключение во всплывающем окне.',
  walletClosed:
    'Окно кошелька было закрыто до завершения. Нажмите «Открыть Biatec Wallet», чтобы повторить.',
  userRejected: 'Вы отклонили подключение в Biatec Wallet. Можно попробовать ещё раз.',
  wrongNetwork:
    'Biatec Wallet подключён к другой сети. Переключите сеть в кошельке и попробуйте снова.',
  timedOut: 'Biatec Wallet не ответил вовремя. Попробуйте ещё раз.',
  showWalletWindow: 'Показать окно кошелька',
  language: 'Язык'
}

const tr: BiatecTranslation = {
  title: "Biatec Wallet'ı bağla",
  subtitle: 'Nasıl bağlanacağını seç',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Telefonundaki cüzdan — bir kod tara',
    liquid: 'Telefonundaki cüzdan — geçiş anahtarı, eşler arası',
    direct: 'Bu tarayıcıdaki cüzdan — yeni bir pencere açar'
  },
  methodInstructions: {
    walletconnect:
      "Telefonunda <strong>Biatec Wallet</strong>'ı aç, tarama simgesine dokun ve kamerayı bu koda doğrult.",
    liquid:
      "<strong>Biatec Wallet</strong>'ı aç, <strong>Liquid Auth</strong>'u seç ve bu kodu tara. Bağlantıyı cihazının geçiş anahtarıyla onaylarsın — röle sunucusu olmadan.",
    direct:
      "<strong>Biatec Wallet'ı aç</strong> düğmesine tıkla. Cüzdan yeni bir pencerede açılır; istenirse oturum aç, ardından bağlantıyı onayla. Hiçbir şey açılmazsa bu site için açılır pencerelere izin ver ve tekrar tıkla."
  },
  connectWith: '{method} ile bağlan',
  preparing: '{method} hazırlanıyor…',
  copyLink: 'Bağlantıyı kopyala',
  copied: 'Kopyalandı!',
  cancel: 'İptal',
  pairingLink: 'Eşleştirme bağlantısı',
  noWallet: "Biatec Wallet'ın yok mu?",
  getItHere: 'Buradan edin',
  genericError: 'Bir şeyler ters gitti.',
  openWallet: "Biatec Wallet'ı aç",
  popupBlocked:
    'Tarayıcın Biatec Wallet açılır penceresini engelledi. Bu site için açılır pencerelere izin ver, ardından düğmeye tekrar tıkla.',
  waitingForWallet: 'Biatec Wallet bekleniyor… Bağlantıyı açılır pencerede onayla.',
  walletClosed:
    "Cüzdan penceresi sen bitirmeden kapatıldı. Tekrar denemek için Biatec Wallet'ı aç düğmesine tıkla.",
  userRejected: "Bağlantıyı Biatec Wallet'ta reddettin. Tekrar deneyebilirsin.",
  wrongNetwork: 'Biatec Wallet farklı bir ağda. Cüzdanda ağı değiştir ve tekrar dene.',
  timedOut: 'Biatec Wallet zamanında yanıt vermedi. Tekrar dene.',
  showWalletWindow: 'Cüzdan penceresini göster',
  language: 'Dil'
}

const af: BiatecTranslation = {
  title: 'Koppel Biatec Wallet',
  subtitle: 'Kies hoe om te koppel',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: "Beursie op jou foon — skandeer 'n kode",
    liquid: 'Beursie op jou foon — wagsleutel, eweknie-tot-eweknie',
    direct: "Beursie in hierdie blaaier — maak 'n nuwe venster oop"
  },
  methodInstructions: {
    walletconnect:
      'Maak <strong>Biatec Wallet</strong> op jou foon oop, tik op die skandeerikoon en rig jou kamera op hierdie kode.',
    liquid:
      "Maak <strong>Biatec Wallet</strong> oop, kies <strong>Liquid Auth</strong>, en skandeer hierdie kode. Jy keur die verbinding goed met jou toestel se wagsleutel — sonder 'n relay-bediener.",
    direct:
      "Klik op <strong>Maak Biatec Wallet oop</strong>. Die beursie maak in 'n nuwe venster oop; meld aan as gevra, en keur dan die verbinding goed. As niks oopmaak nie, laat opspringvensters vir hierdie werf toe en klik weer."
  },
  connectWith: 'Koppel met {method}',
  preparing: '{method} word voorberei…',
  copyLink: 'Kopieer skakel',
  copied: 'Gekopieer!',
  cancel: 'Kanselleer',
  pairingLink: 'Koppelingskakel',
  noWallet: 'Het jy nie Biatec Wallet nie?',
  getItHere: 'Kry dit hier',
  genericError: 'Iets het verkeerd geloop.',
  openWallet: 'Maak Biatec Wallet oop',
  popupBlocked:
    'Jou blaaier het die Biatec Wallet-opspringvenster geblokkeer. Laat opspringvensters vir hierdie werf toe en klik weer op die knoppie.',
  waitingForWallet: 'Wag vir Biatec Wallet… Keur die verbinding goed in die opspringvenster.',
  walletClosed:
    'Die beursievenster is toegemaak voordat jy klaar was. Klik op Maak Biatec Wallet oop om weer te probeer.',
  userRejected: 'Jy het die verbinding in Biatec Wallet geweier. Jy kan weer probeer.',
  wrongNetwork:
    "Biatec Wallet is op 'n ander netwerk. Skakel netwerk in die beursie oor en probeer weer.",
  timedOut: 'Biatec Wallet het nie betyds geantwoord nie. Probeer weer.',
  showWalletWindow: 'Wys beursievenster',
  language: 'Taal'
}

export const TRANSLATIONS: Record<BiatecLocale, BiatecTranslation> = {
  af,
  cs,
  en,
  es,
  hu,
  it,
  nl,
  ru,
  sk,
  tr
}

function isSupportedLocale(value: string): value is BiatecLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Resolves the best supported locale for `preferred` (an explicit locale/BCP-47 tag, or a list
 * of them, most-preferred first). Falls back to the browser's `navigator.languages` /
 * `navigator.language`, then to {@link DEFAULT_LOCALE}.
 */
export function resolveLocale(preferred?: string | readonly string[]): BiatecLocale {
  const candidates: readonly string[] =
    preferred !== undefined
      ? typeof preferred === 'string'
        ? [preferred]
        : preferred
      : typeof navigator !== 'undefined'
        ? (navigator.languages ?? [navigator.language])
        : []

  for (const candidate of candidates) {
    if (!candidate) continue
    const base = candidate.toLowerCase().split('-')[0]
    if (isSupportedLocale(base)) return base
  }
  return DEFAULT_LOCALE
}
