import nacl from "tweetnacl";

const alice = nacl.box.keyPair();
const bob = nacl.box.keyPair();

const aliceShared = nacl.box.before(bob.publicKey, alice.secretKey);
const bobShared = nacl.box.before(alice.publicKey, bob.secretKey);

if (alice.publicKey.byteLength !== 32 || alice.secretKey.byteLength !== 32) {
    throw new Error("tweetnacl.box.keyPair() did not produce a 32-byte X25519 keypair");
}

if (Buffer.compare(Buffer.from(aliceShared), Buffer.from(bobShared)) !== 0) {
    throw new Error("X25519 ECDH shared secrets differ");
}

console.log(`X25519 ECDH spike passed; shared secret bytes=${aliceShared.byteLength}`);
