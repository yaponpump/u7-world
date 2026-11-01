import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import { keypairFrom, chain } from '../src/chain.js';

test('keypair dari base58 atau array JSON', () => {
  const kp = Keypair.generate();
  assert.equal(keypairFrom(bs58.encode(kp.secretKey)).publicKey.toBase58(), kp.publicKey.toBase58());
  assert.equal(keypairFrom(JSON.stringify([...kp.secretKey])).publicKey.toBase58(), kp.publicKey.toBase58());
});

test('signSwap nandatangan transaksi Jupiter pakai wallet bot', () => {
  const kp = Keypair.generate();
  const c = chain({ rpcUrl: 'http://127.0.0.1:1', secret: bs58.encode(kp.secretKey), mint: Keypair.generate().publicKey.toBase58(), network: 'devnet' });
  const msg = new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: bs58.encode(new Uint8Array(32).fill(7)), instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(Keypair.generate().publicKey), lamports: 1 })] }).compileToV0Message();
  const unsigned = Buffer.from(new VersionedTransaction(msg).serialize()).toString('base64');
  const signed = VersionedTransaction.deserialize(Buffer.from(c.signSwap(unsigned), 'base64'));
  assert.equal(c.wallet, kp.publicKey.toBase58());
  assert.ok(signed.signatures[0].some((b) => b !== 0));
});
