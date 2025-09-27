export async function loadLucid() {
  const { Lucid, Blockfrost, fromHex, toHex } = await import("lucid-cardano");
  return { Lucid, Blockfrost, fromHex, toHex };
}
