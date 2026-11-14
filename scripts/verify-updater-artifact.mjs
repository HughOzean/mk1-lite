// Match Tauri updater's minisign verification without production dependencies.
// Source reference: tauri-plugin-updater/src/updater.rs::verify_signature and
// minisign-verify/src/lib.rs::PublicKey::verify / verify_ed25519.
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function decodeBase64(value, label) {
  const text = value.trim();
  if (
    !text ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      text,
    )
  ) {
    throw new Error(`Invalid ${label} base64.`);
  }
  return Buffer.from(text, "base64");
}
function decodeText(value, label) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    decodeBase64(value, label),
  );
}

/** Verifies payload, signing key ID, global signature/trusted comment, and version. */
export function verifyUpdaterArtifact(
  payload,
  encodedSignature,
  encodedPublicKey,
  expectedVersion,
) {
  const keyLines = decodeText(encodedPublicKey, "public key")
    .trim()
    .split(/\r?\n/);
  const sigLines = decodeText(encodedSignature, "signature")
    .trim()
    .split(/\r?\n/);
  if (
    keyLines.length !== 2 ||
    sigLines.length !== 4 ||
    !sigLines[2].startsWith("trusted comment: ")
  ) {
    throw new Error("Malformed minisign key or signature text.");
  }
  const key = decodeBase64(keyLines[1], "Ed25519 key");
  const signature = decodeBase64(sigLines[1], "payload signature");
  const globalSignature = decodeBase64(sigLines[3], "global signature");
  if (
    key.length !== 42 ||
    signature.length !== 74 ||
    globalSignature.length !== 64
  ) {
    throw new Error("Invalid minisign key/signature length.");
  }
  if (!["Ed", "ED"].includes(key.subarray(0, 2).toString("ascii")))
    throw new Error("Unsupported public key algorithm.");
  const algorithm = signature.subarray(0, 2).toString("ascii");
  if (!["Ed", "ED"].includes(algorithm))
    throw new Error("Unsupported signature algorithm.");
  if (!key.subarray(2, 10).equals(signature.subarray(2, 10)))
    throw new Error("Updater signing key ID mismatch.");
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      key.subarray(10),
    ]),
    format: "der",
    type: "spki",
  });
  const signedPayload =
    algorithm === "ED"
      ? createHash("blake2b512").update(payload).digest()
      : payload;
  const payloadSignature = signature.subarray(10);
  if (!verify(null, signedPayload, publicKey, payloadSignature))
    throw new Error("Invalid updater payload signature.");
  const trustedComment = sigLines[2].slice("trusted comment: ".length);
  const signedComment = Buffer.concat([
    payloadSignature,
    Buffer.from(trustedComment, "utf8"),
  ]);
  if (!verify(null, signedComment, publicKey, globalSignature))
    throw new Error("Invalid updater trusted-comment signature.");
  // Read the version only after its trusted comment has been authenticated.
  const signedVersion = trustedComment
    .split("\t")
    .find((field) => field.startsWith("version:"))
    ?.slice("version:".length);
  if (
    !signedVersion ||
    signedVersion.replace(/^v/, "") !== expectedVersion.replace(/^v/, "")
  ) {
    throw new Error(
      `Updater signed version mismatch: expected ${expectedVersion}.`,
    );
  }
  return { algorithm, version: signedVersion };
}

async function main() {
  const artifact = process.argv[2];
  if (!artifact)
    throw new Error(
      "Usage: node scripts/verify-updater-artifact.mjs <artifact> [signature-file] [expected-version]",
    );
  const root = fileURLToPath(new URL("../", import.meta.url));
  const config = JSON.parse(
    await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const payload = await readFile(artifact);
  const signature = await readFile(
    process.argv[3] || `${artifact}.sig`,
    "utf8",
  );
  const publicKey = config.plugins.updater.pubkey;
  const version = process.argv[4] || config.version;
  const result = verifyUpdaterArtifact(payload, signature, publicKey, version);
  const tampered = payload.length ? Buffer.from(payload) : Buffer.from([1]);
  if (payload.length) tampered[Math.floor(tampered.length / 2)] ^= 1;
  let tamperRejected = false;
  try {
    verifyUpdaterArtifact(tampered, signature, publicKey, version);
  } catch {
    tamperRejected = true;
  }
  if (!tamperRejected) throw new Error("Verifier accepted a tampered payload.");
  console.log(
    `PASS: ${path.basename(artifact)} authenticated against configured public key (${result.algorithm}, version ${result.version}); one-byte payload tampering rejected.`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
