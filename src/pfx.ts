import forge from "node-forge";

/**
 * This is quite a pain. App proxy requires a pfx file with a password, but Azure Key Vault strips password on import.
 * Node.js has no support for pfx natively except for running a https server. This lib was the only one I could find that works.
 *
 * Hopefully this works for all cases, but the pfx could be structured differently, it depends on if Azure Key Vault normalizes it
 * or if it just strips the password.
 */
export function setPasswordOnPfx(pfx: string, password: string) {
  const p12Der = forge.util.decode64(pfx);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  // Use non-strict mode and empty password for Azure Key Vault certificates
  // Azure Key Vault strips passwords from PFX but leaves macData intact
  // node-forge 1.3.2+ (CVE-2025-12816 fix) requires this to handle such certificates
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, '');

  const certificates = getCertificates(p12);
  const key = getKey(p12);

  const pfxNewAs1 = forge.pkcs12.toPkcs12Asn1(key as forge.pki.rsa.PrivateKey, certificates, password);

  const pfxNewDer = forge.asn1.toDer(pfxNewAs1).getBytes();
  return forge.util.encode64(pfxNewDer);
}

function getCertificates(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.Certificate[] {
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const certs = certBags[forge.pki.oids.certBag];
  if (!certs) {
    throw new Error("No certificate found");
  }
  return certs.map((cert) => cert.cert) as forge.pki.Certificate[];
}

function getKey(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.PrivateKey | null {
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keys = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  if (!keys) {
    throw new Error("No key found");
  }
  const theKeys = keys[0];
  const key = theKeys.key;
  if (!key) {
    throw new Error("No key found");
  }
  return key;
}