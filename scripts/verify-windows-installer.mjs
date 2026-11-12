import { open, stat } from "node:fs/promises";

const [applicationPath, installerPath] = process.argv.slice(2);
if (!applicationPath || !installerPath) {
  throw new Error(
    "Usage: node scripts/verify-windows-installer.mjs <application.exe> <installer.exe>",
  );
}
async function peMachine(filename) {
  const { size } = await stat(filename);
  if (size < 1024)
    throw new Error(`Executable is unexpectedly small: ${filename}`);
  const file = await open(filename, "r");
  try {
    const dos = Buffer.alloc(64);
    await file.read(dos, 0, dos.length, 0);
    if (dos.readUInt16LE(0) !== 0x5a4d)
      throw new Error(`Missing MZ header: ${filename}`);
    const offset = dos.readUInt32LE(0x3c);
    if (offset < 64 || offset > size - 24)
      throw new Error(`Invalid PE header offset: ${filename}`);
    const pe = Buffer.alloc(24);
    await file.read(pe, 0, pe.length, offset);
    if (pe.readUInt32LE(0) !== 0x00004550)
      throw new Error(`Missing PE signature: ${filename}`);
    return { size, machine: pe.readUInt16LE(4) };
  } finally {
    await file.close();
  }
}
const application = await peMachine(applicationPath);
const installer = await peMachine(installerPath);
if (application.machine !== 0x8664)
  throw new Error("Application payload is not Windows AMD64.");
// NSIS commonly uses an x86 bootstrapper even when the application payload is x64.
if (![0x014c, 0x8664].includes(installer.machine))
  throw new Error("Unexpected installer PE architecture.");
console.log(
  JSON.stringify({
    application,
    installer,
    payloadArchitecture: "x86_64",
    installerVerified: true,
  }),
);
