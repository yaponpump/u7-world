// Satu tempat buat setting project. Isi pas token udah launch.
export const CONFIG = {
  name: 'VUZZ',
  ticker: '$VUZZ',

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

  // Tier holder: saldo minimal (dalam token utuh) buat buka skin.
  tiers: [
    { id: 'signal', min: 0, label: 'Signal' },
    { id: 'spark', min: 1_000, label: 'Spark' },
    { id: 'beacon', min: 100_000, label: 'Beacon' },
    { id: 'core', min: 1_000_000, label: 'Core' },
  ],
};
