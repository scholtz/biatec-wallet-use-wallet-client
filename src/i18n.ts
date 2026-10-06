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
}

/** Substitutes `{method}` in `template` with `method`. */
export function formatMethod(template: string, method: string): string {
  return template.replace('{method}', method)
}

const en: BiatecTranslation = {
  title: 'Connect Biatec Wallet',
  subtitle: 'Pick a method, then scan the code',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Relay-based pairing',
    liquid: 'Peer-to-peer, passkey',
    direct: 'Popup window, no relay'
  },
  methodInstructions: {
    walletconnect:
      'Open <strong>Biatec Wallet</strong> on your phone, tap the scan icon, and point your camera at this code.',
    liquid:
      "Open <strong>Biatec Wallet</strong>, choose <strong>Liquid Auth</strong>, and scan this code. You'll approve the connection with your device passkey — no relay server involved.",
    direct:
      'Click <strong>Open Biatec Wallet</strong>. Biatec Wallet opens in a popup where you approve the connection — no QR code and no relay server. Allow popups for this site if your browser blocks it.'
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
  waitingForWallet: 'Waiting for Biatec Wallet… Approve the connection in the popup window.'
}

const cs: BiatecTranslation = {
  title: 'Připojit Biatec Wallet',
  subtitle: 'Vyberte způsob a naskenujte kód',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Párování přes relay',
    liquid: 'Peer-to-peer, přístupový klíč',
    direct: 'Vyskakovací okno, bez relay'
  },
  methodInstructions: {
    walletconnect:
      'Otevřete <strong>Biatec Wallet</strong> v telefonu, klepněte na ikonu skenování a namiřte fotoaparát na tento kód.',
    liquid:
      'Otevřete <strong>Biatec Wallet</strong>, zvolte <strong>Liquid Auth</strong> a naskenujte tento kód. Připojení schválíte přístupovým klíčem zařízení — bez relay serveru.',
    direct:
      'Klikněte na <strong>Otevřít Biatec Wallet</strong>. Biatec Wallet se otevře ve vyskakovacím okně, kde připojení schválíte — bez QR kódu a bez relay serveru. Pokud to prohlížeč blokuje, povolte pro tento web vyskakovací okna.'
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
  waitingForWallet: 'Čekání na Biatec Wallet… Schvalte připojení ve vyskakovacím okně.'
}

const sk: BiatecTranslation = {
  title: 'Pripojiť Biatec Wallet',
  subtitle: 'Vyberte spôsob a naskenujte kód',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Párovanie cez relay',
    liquid: 'Peer-to-peer, prístupový kľúč',
    direct: 'Vyskakovacie okno, bez relay'
  },
  methodInstructions: {
    walletconnect:
      'Otvorte <strong>Biatec Wallet</strong> v telefóne, ťuknite na ikonu skenovania a namierte fotoaparát na tento kód.',
    liquid:
      'Otvorte <strong>Biatec Wallet</strong>, zvoľte <strong>Liquid Auth</strong> a naskenujte tento kód. Pripojenie schválite prístupovým kľúčom zariadenia — bez relay servera.',
    direct:
      'Kliknite na <strong>Otvoriť Biatec Wallet</strong>. Biatec Wallet sa otvorí vo vyskakovacom okne, kde pripojenie schválite — bez QR kódu a bez relay servera. Ak to prehliadač blokuje, povoľte pre túto stránku vyskakovacie okná.'
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
  waitingForWallet: 'Čaká sa na Biatec Wallet… Schváľte pripojenie vo vyskakovacom okne.'
}

const es: BiatecTranslation = {
  title: 'Conectar Biatec Wallet',
  subtitle: 'Elige un método y escanea el código',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Emparejamiento mediante relay',
    liquid: 'Entre pares, con clave de acceso',
    direct: 'Ventana emergente, sin relay'
  },
  methodInstructions: {
    walletconnect:
      'Abre <strong>Biatec Wallet</strong> en tu teléfono, toca el icono de escaneo y apunta la cámara a este código.',
    liquid:
      'Abre <strong>Biatec Wallet</strong>, elige <strong>Liquid Auth</strong> y escanea este código. Aprobarás la conexión con la clave de acceso de tu dispositivo, sin servidor de relay.',
    direct:
      'Haz clic en <strong>Abrir Biatec Wallet</strong>. Biatec Wallet se abre en una ventana emergente donde apruebas la conexión, sin código QR ni servidor de relay. Si tu navegador la bloquea, permite las ventanas emergentes para este sitio.'
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
  waitingForWallet: 'Esperando a Biatec Wallet… Aprueba la conexión en la ventana emergente.'
}

const hu: BiatecTranslation = {
  title: 'Biatec Wallet csatlakoztatása',
  subtitle: 'Válassz módszert, majd olvasd be a kódot',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Relay alapú párosítás',
    liquid: 'Egyenrangú, jelszókulcs',
    direct: 'Előugró ablak, relay nélkül'
  },
  methodInstructions: {
    walletconnect:
      'Nyisd meg a <strong>Biatec Wallet</strong>-et a telefonodon, koppints a beolvasás ikonra, és irányítsd a kamerát erre a kódra.',
    liquid:
      'Nyisd meg a <strong>Biatec Wallet</strong>-et, válaszd a <strong>Liquid Auth</strong> lehetőséget, és olvasd be ezt a kódot. A kapcsolatot az eszköz jelszókulcsával hagyod jóvá, relay szerver nélkül.',
    direct:
      'Kattints a <strong>Biatec Wallet megnyitása</strong> gombra. A Biatec Wallet egy előugró ablakban nyílik meg, ahol jóváhagyod a kapcsolatot — QR-kód és relay szerver nélkül. Ha a böngésző blokkolja, engedélyezd az előugró ablakokat ezen az oldalon.'
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
  waitingForWallet: 'Várakozás a Biatec Wallet-re… Hagyd jóvá a kapcsolatot az előugró ablakban.'
}

const it: BiatecTranslation = {
  title: 'Connetti Biatec Wallet',
  subtitle: 'Scegli un metodo, poi scansiona il codice',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Accoppiamento tramite relay',
    liquid: 'Peer-to-peer, passkey',
    direct: 'Finestra popup, senza relay'
  },
  methodInstructions: {
    walletconnect:
      "Apri <strong>Biatec Wallet</strong> sul telefono, tocca l'icona di scansione e inquadra questo codice con la fotocamera.",
    liquid:
      'Apri <strong>Biatec Wallet</strong>, scegli <strong>Liquid Auth</strong> e scansiona questo codice. Approverai la connessione con la passkey del dispositivo, senza alcun server relay.',
    direct:
      'Fai clic su <strong>Apri Biatec Wallet</strong>. Biatec Wallet si apre in una finestra popup in cui approvi la connessione, senza codice QR né server relay. Se il browser la blocca, consenti i popup per questo sito.'
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
  waitingForWallet: 'In attesa di Biatec Wallet… Approva la connessione nella finestra popup.'
}

const nl: BiatecTranslation = {
  title: 'Biatec Wallet verbinden',
  subtitle: 'Kies een methode en scan de code',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Koppelen via relay',
    liquid: 'Peer-to-peer, toegangssleutel',
    direct: 'Pop-upvenster, geen relay'
  },
  methodInstructions: {
    walletconnect:
      'Open <strong>Biatec Wallet</strong> op je telefoon, tik op het scanicoon en richt je camera op deze code.',
    liquid:
      'Open <strong>Biatec Wallet</strong>, kies <strong>Liquid Auth</strong> en scan deze code. Je keurt de verbinding goed met de toegangssleutel van je apparaat, zonder relayserver.',
    direct:
      'Klik op <strong>Biatec Wallet openen</strong>. Biatec Wallet opent in een pop-upvenster waar je de verbinding goedkeurt, zonder QR-code en zonder relayserver. Blokkeert je browser dit, sta dan pop-ups toe voor deze site.'
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
  waitingForWallet: 'Wachten op Biatec Wallet… Keur de verbinding goed in het pop-upvenster.'
}

const ru: BiatecTranslation = {
  title: 'Подключить Biatec Wallet',
  subtitle: 'Выберите способ и отсканируйте код',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Подключение через relay',
    liquid: 'Одноранговое, ключ доступа',
    direct: 'Всплывающее окно, без relay'
  },
  methodInstructions: {
    walletconnect:
      'Откройте <strong>Biatec Wallet</strong> на телефоне, нажмите значок сканирования и наведите камеру на этот код.',
    liquid:
      'Откройте <strong>Biatec Wallet</strong>, выберите <strong>Liquid Auth</strong> и отсканируйте этот код. Вы подтвердите подключение ключом доступа устройства — без relay-сервера.',
    direct:
      'Нажмите <strong>Открыть Biatec Wallet</strong>. Biatec Wallet откроется во всплывающем окне, где вы подтвердите подключение — без QR-кода и relay-сервера. Если браузер блокирует окно, разрешите всплывающие окна для этого сайта.'
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
  waitingForWallet: 'Ожидание Biatec Wallet… Подтвердите подключение во всплывающем окне.'
}

const tr: BiatecTranslation = {
  title: "Biatec Wallet'ı bağla",
  subtitle: 'Bir yöntem seç, ardından kodu tara',
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Röle tabanlı eşleştirme',
    liquid: 'Eşler arası, geçiş anahtarı',
    direct: 'Açılır pencere, röle yok'
  },
  methodInstructions: {
    walletconnect:
      "Telefonunda <strong>Biatec Wallet</strong>'ı aç, tarama simgesine dokun ve kamerayı bu koda doğrult.",
    liquid:
      "<strong>Biatec Wallet</strong>'ı aç, <strong>Liquid Auth</strong>'u seç ve bu kodu tara. Bağlantıyı cihazının geçiş anahtarıyla onaylarsın — röle sunucusu olmadan.",
    direct:
      "<strong>Biatec Wallet'ı aç</strong> düğmesine tıkla. Biatec Wallet, bağlantıyı onayladığın bir açılır pencerede açılır — QR kodu ve röle sunucusu olmadan. Tarayıcın engellerse bu site için açılır pencerelere izin ver."
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
  waitingForWallet: 'Biatec Wallet bekleniyor… Bağlantıyı açılır pencerede onayla.'
}

const af: BiatecTranslation = {
  title: 'Koppel Biatec Wallet',
  subtitle: "Kies 'n metode en skandeer dan die kode",
  methodLabel: { walletconnect: 'WalletConnect', liquid: 'Liquid Auth', direct: 'Biatec Direct' },
  methodHint: {
    walletconnect: 'Relay-gebaseerde koppeling',
    liquid: 'Eweknie-tot-eweknie, wagsleutel',
    direct: 'Opspringvenster, geen relay'
  },
  methodInstructions: {
    walletconnect:
      'Maak <strong>Biatec Wallet</strong> op jou foon oop, tik op die skandeerikoon en rig jou kamera op hierdie kode.',
    liquid:
      "Maak <strong>Biatec Wallet</strong> oop, kies <strong>Liquid Auth</strong>, en skandeer hierdie kode. Jy keur die verbinding goed met jou toestel se wagsleutel — sonder 'n relay-bediener.",
    direct:
      "Klik op <strong>Maak Biatec Wallet oop</strong>. Biatec Wallet maak in 'n opspringvenster oop waar jy die verbinding goedkeur — sonder QR-kode en sonder relay-bediener. Laat opspringvensters vir hierdie werf toe as jou blaaier dit blokkeer."
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
  waitingForWallet: 'Wag vir Biatec Wallet… Keur die verbinding goed in die opspringvenster.'
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
