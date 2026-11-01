// Satu tempat buat setting project. Isi pas token udah launch.
export const CONFIG = {
  name: '7POD',
  ticker: '7POD',

  // Token on-chain (kosong = belum launch, semua wallet yang connect dihitung "sinyal").
  token: {
    chain: 'solana',    // 'solana' | 'evm'
    network: 'devnet',  // 'devnet' | 'mainnet'. Selain mainnet, game + web nampilin label "Testnet" dan tombol beli nonaktif.
    address: '',        // mint (Solana) atau contract (EVM). Kosong = belum launch.
    decimals: 9,
    evmChainId: '',     // cuma buat EVM: contoh '0x1' mainnet, '0x2105' Base
    rpc: '',            // RPC Solana buat cek saldo. Kosong = public RPC sesuai network.
    holdersUrl: '',     // endpoint server/holders, kosong = belum ada data live
  },

  // Market feed buat cuaca. Kosong = demo mode (cuaca ikut siklus palsu yang pelan).
  market: {
    coingeckoId: '',    // contoh 'solana'
    dexscreener: '',    // contoh 'solana/<pairAddress>'
    pollSeconds: 120,
  },

  // Evolusi robot dari total burn (persen supply). Pratinjau sebelum launch: tambah ?level=3 atau ?burn=0.8 di URL.
  evolution: {
    initialSupply: 1_000_000_000,
    thresholds: [0.09, 0.3, 0.6, 1.1, 1.6], // Awake, Aware, Learning, Reasoning, Superintelligence
    step: 0.5,                               // tiap tambahan ini setelah Superintelligence = Evolution +1
    pollSeconds: 180,
  },

  // Tier holder: saldo minimal (dalam token utuh) buat buka skin.
  tiers: [
    { id: 'signal', min: 0, label: 'Signal' },
    { id: 'spark', min: 1_000, label: 'Spark' },
    { id: 'beacon', min: 100_000, label: 'Beacon' },
    { id: 'core', min: 1_000_000, label: 'Core' },
  ],
};

// Override dari public/launch.js (diisi lewat panel admin). Field kosong = pakai nilai di atas.
const L = (typeof window !== 'undefined' && window.POD_LAUNCH) || {};
export const LAUNCH = L;
if (L.mint) CONFIG.token.address = String(L.mint).trim();
if (L.network === 'mainnet' || L.network === 'devnet') CONFIG.token.network = L.network;
if (L.holdersUrl) CONFIG.token.holdersUrl = L.holdersUrl;
