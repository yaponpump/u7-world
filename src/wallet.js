import { CONFIG } from './config.js';

// Wallet connect tanpa library: pakai provider yang di-inject browser.
// Solana: Phantom / Solflare / Backpack (window.solana atau window.phantom.solana).
// EVM: MetaMask, Rabby, Coinbase (window.ethereum).
// Nggak ada signing, cuma baca alamat dan (kalau token diisi di config) saldo.

const LS_KEY = 'vuzz-wallet';

export function createWallet({ onChange = () => {} } = {}) {
  const state = {
    status: 'idle',   // idle | connecting | connected | error
    chain: null,      // 'solana' | 'evm'
    address: null,
    balance: null,    // saldo token utuh (number) atau null kalau token belum diisi
    tier: null,
    error: null,
    providerName: null,
  };
  let evmProvider = null;
  let solProvider = null;

  const short = () => state.address ? `${state.address.slice(0, 4)}…${state.address.slice(-4)}` : '';
  const emit = () => onChange({ ...state, short: short(), isHolder: !!state.address });

  function detect() {
    const sol = window.phantom?.solana || window.solana || window.solflare || window.backpack;
    const eth = window.ethereum;
    return {
      solana: sol && (sol.isPhantom || sol.isSolflare || sol.isBackpack || typeof sol.connect === 'function') ? sol : null,
      evm: eth && typeof eth.request === 'function' ? eth : null,
    };
  }

  function nameOf(p, chain) {
    if (chain === 'solana') return p.isPhantom ? 'Phantom' : p.isSolflare ? 'Solflare' : p.isBackpack ? 'Backpack' : 'Solana wallet';
    return p.isRabby ? 'Rabby' : p.isCoinbaseWallet ? 'Coinbase' : p.isMetaMask ? 'MetaMask' : 'EVM wallet';
  }

  function tierFor(balance) {
    if (balance == null) return CONFIG.tiers[0];
    let t = CONFIG.tiers[0];
    for (const tier of CONFIG.tiers) if (balance >= tier.min) t = tier;
    return t;
  }

  async function refreshBalance() {
    const tok = CONFIG.token;
    if (!tok.address || !state.address) { state.balance = null; state.tier = tierFor(null); return; }
    try {
      if (state.chain === 'evm' && evmProvider) {
        // balanceOf(address) selector 0x70a08231
        const data = '0x70a08231' + state.address.slice(2).padStart(64, '0');
        const hex = await evmProvider.request({ method: 'eth_call', params: [{ to: tok.address, data }, 'latest'] });
        state.balance = Number(BigInt(hex)) / 10 ** tok.decimals;
      } else if (state.chain === 'solana') {
        const rpc = tok.rpc || 'https://api.mainnet-beta.solana.com';
        const r = await fetch(rpc, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [state.address, { mint: tok.address }, { encoding: 'jsonParsed' }] }),
        });
        const j = await r.json();
        state.balance = (j.result?.value || []).reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
      }
    } catch (e) {
      console.warn('[wallet] gagal baca saldo', e);
      state.balance = null;
    }
    state.tier = tierFor(state.balance);
  }

  function attachListeners() {
    if (evmProvider && !evmProvider.__vuzzBound) {
      evmProvider.__vuzzBound = true;
      evmProvider.on?.('accountsChanged', (acc) => { if (!acc?.length) api.disconnect(); else { state.address = acc[0]; refreshBalance().then(emit); } });
      evmProvider.on?.('chainChanged', () => refreshBalance().then(emit));
    }
    if (solProvider && !solProvider.__vuzzBound) {
      solProvider.__vuzzBound = true;
      solProvider.on?.('disconnect', () => api.disconnect());
      solProvider.on?.('accountChanged', (pk) => { if (pk) { state.address = pk.toString(); refreshBalance().then(emit); } else api.disconnect(); });
    }
  }

  async function connectSolana(p, { silent = false } = {}) {
    solProvider = p;
    const res = await p.connect(silent ? { onlyIfTrusted: true } : undefined);
    const pk = res?.publicKey || p.publicKey;
    if (!pk) throw new Error('Wallet nggak ngasih alamat');
    state.chain = 'solana';
    state.address = pk.toString();
    state.providerName = nameOf(p, 'solana');
  }
  async function connectEvm(p, { silent = false } = {}) {
    evmProvider = p;
    const accounts = await p.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' });
    if (!accounts?.length) throw new Error(silent ? 'no-eager' : 'Wallet nggak ngasih alamat');
    if (CONFIG.token.evmChainId && !silent) {
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CONFIG.token.evmChainId }] }); } catch { /* biarin, saldo aja yang kosong */ }
    }
    state.chain = 'evm';
    state.address = accounts[0];
    state.providerName = nameOf(p, 'evm');
  }

  const api = {
    get state() { return { ...state, short: short(), isHolder: !!state.address }; },
    available() {
      const d = detect();
      return { solana: !!d.solana, evm: !!d.evm, any: !!(d.solana || d.evm) };
    },
    // chain opsional: 'solana' | 'evm'. Kalau dua-duanya ada dan nggak dipilih, prefer yang sesuai CONFIG.token.chain, lalu Solana.
    async connect(chain) {
      const d = detect();
      if (!d.solana && !d.evm) {
        state.status = 'error';
        state.error = 'no-wallet';
        emit();
        return false;
      }
      const pick = chain || (CONFIG.token.chain && d[CONFIG.token.chain] ? CONFIG.token.chain : d.solana ? 'solana' : 'evm');
      state.status = 'connecting'; state.error = null; emit();
      try {
        if (pick === 'solana') await connectSolana(d.solana); else await connectEvm(d.evm);
        attachListeners();
        await refreshBalance();
        state.status = 'connected';
        try { localStorage.setItem(LS_KEY, pick); } catch {}
        emit();
        return true;
      } catch (e) {
        state.status = 'error';
        state.error = e?.code === 4001 || /reject|User rejected/i.test(e?.message || '') ? 'rejected' : (e?.message || 'gagal');
        state.address = null; state.chain = null;
        emit();
        return false;
      }
    },
    // coba nyambung diam-diam kalau sebelumnya pernah connect
    async eager() {
      let last = null;
      try { last = localStorage.getItem(LS_KEY); } catch {}
      if (!last) return false;
      const d = detect();
      if (!d[last]) return false;
      try {
        if (last === 'solana') await connectSolana(d.solana, { silent: true }); else await connectEvm(d.evm, { silent: true });
        attachListeners();
        await refreshBalance();
        state.status = 'connected';
        emit();
        return true;
      } catch { return false; }
    },
    async disconnect() {
      try { await solProvider?.disconnect?.(); } catch {}
      state.status = 'idle'; state.address = null; state.chain = null; state.balance = null; state.tier = null; state.providerName = null;
      try { localStorage.removeItem(LS_KEY); } catch {}
      emit();
    },
    refreshBalance: () => refreshBalance().then(emit),
  };
  return api;
}
