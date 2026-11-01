// Semua yang nyentuh Solana: baca saldo, tanda tangan swap, burn.
import { Connection, Keypair, PublicKey, VersionedTransaction, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getMint, createBurnCheckedInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

export function keypairFrom(secret) {
  const s = secret.trim();
  const bytes = s.startsWith('[') ? Uint8Array.from(JSON.parse(s)) : bs58.decode(s);
  return Keypair.fromSecretKey(bytes);
}

export function chain(c) {
  const conn = new Connection(c.rpcUrl, 'confirmed');
  const kp = keypairFrom(c.secret);
  const mint = new PublicKey(c.mint);
  let mintInfo = null;

  async function mintMeta() {
    if (mintInfo) return mintInfo;
    const acc = await conn.getAccountInfo(mint);
    if (!acc) throw new Error('Mint nggak ketemu di ' + c.network);
    const programId = acc.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const m = await getMint(conn, mint, 'confirmed', programId);
    mintInfo = { programId, decimals: m.decimals, supply: m.supply };
    return mintInfo;
  }

  return {
    wallet: kp.publicKey.toBase58(),
    solBalance: () => conn.getBalance(kp.publicKey, 'confirmed'),
    async tokenBalance() {
      const { programId } = await mintMeta();
      const ata = getAssociatedTokenAddressSync(mint, kp.publicKey, false, programId);
      try { const b = await conn.getTokenAccountBalance(ata, 'confirmed'); return BigInt(b.value.amount); } catch { return 0n; }
    },
    signSwap(base64) {
      const tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
      tx.sign([kp]); // tanda tangan bot aja; tanda tangan lain (kalau ada) diisi Jupiter pas execute
      return Buffer.from(tx.serialize()).toString('base64');
    },
    async burn(amount) {
      const { programId, decimals } = await mintMeta();
      const ata = getAssociatedTokenAddressSync(mint, kp.publicKey, false, programId);
      const tx = new Transaction();
      if (c.priorityMicroLamports > 0) tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: c.priorityMicroLamports }));
      tx.add(createBurnCheckedInstruction(ata, mint, kp.publicKey, amount, decimals, [], programId));
      return sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });
    },
    decimals: async () => (await mintMeta()).decimals,
  };
}
