// Isi ini pas launch. Yang kosong otomatis disembunyiin atau nampil "at launch".
window.VUZZ_SITE = {
  playUrl: '../',
  mint: '',          // mint address Solana
  network: 'devnet', // ganti 'mainnet' pas launch, tombol Buy baru aktif di mainnet
  buyUrl: '',        // contoh https://jup.ag/swap/SOL-<mint>
  holdersUrl: '',    // endpoint dari server/holders, contoh https://vuzz-holders.example.workers.dev/holders
  burnsUrl: '',      // endpoint /burns dari server/holders, contoh https://<worker>.workers.dev/burns
  burnWallet: '',    // alamat publik wallet bot burn, buat link 'semua burn' ke Solscan
  links: [],         // contoh [{ label: 'X', url: 'https://x.com/...' }]
};
