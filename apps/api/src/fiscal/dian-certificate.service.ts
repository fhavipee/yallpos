import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs";
import * as forge from "node-forge";

export type CertificateInfo = {
  loaded: boolean;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  serialNumber?: string;
};

@Injectable()
export class DianCertificateService implements OnModuleInit {
  private readonly logger = new Logger(DianCertificateService.name);
  private privateKeyPem: string | null = null;
  private certificatePem: string | null = null;
  private certInfo: CertificateInfo = { loaded: false };

  onModuleInit() {
    this.loadCertificate();
  }

  loadCertificate(): CertificateInfo {
    const certPath = process.env.FISCAL_CERT_PATH;
    const password = process.env.FISCAL_CERT_PASSWORD ?? "";

    if (!certPath) {
      this.logger.warn("FISCAL_CERT_PATH no configurado — firma digital deshabilitada");
      return this.certInfo;
    }

    if (!fs.existsSync(certPath)) {
      this.logger.error(`Certificado no encontrado: ${certPath}`);
      return this.certInfo;
    }

    try {
      const p12Der = fs.readFileSync(certPath);
      const p12Asn1 = forge.asn1.fromDer(p12Der.toString("binary"));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
        ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];

      if (!certBag?.cert || !keyBag?.key) {
        throw new Error("No se encontró certificado o llave privada en el .p12");
      }

      const cert = certBag.cert as forge.pki.Certificate;
      this.certificatePem = forge.pki.certificateToPem(cert);
      this.privateKeyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.PrivateKey);

      this.certInfo = {
        loaded: true,
        subject: cert.subject.getField("CN")?.value as string,
        issuer: cert.issuer.getField("CN")?.value as string,
        validFrom: cert.validity.notBefore.toISOString(),
        validTo: cert.validity.notAfter.toISOString(),
        serialNumber: cert.serialNumber,
      };

      this.logger.log(`Certificado cargado: ${this.certInfo.subject} (vence ${this.certInfo.validTo})`);
    } catch (err: any) {
      this.logger.error(`Error cargando certificado: ${err.message}`);
      this.certInfo = { loaded: false };
    }

    return this.certInfo;
  }

  getInfo(): CertificateInfo {
    return this.certInfo;
  }

  isLoaded(): boolean {
    return this.certInfo.loaded;
  }

  getCertificatePem(): string | null {
    return this.certificatePem;
  }

  getPrivateKeyPem(): string | null {
    return this.privateKeyPem;
  }

  /** Firma SHA256 con la llave privada del certificado */
  sign(data: string): string | null {
    if (!this.privateKeyPem) return null;
    const key = forge.pki.privateKeyFromPem(this.privateKeyPem);
    const md = forge.md.sha256.create();
    md.update(data, "utf8");
    const signature = key.sign(md);
    return forge.util.encode64(signature);
  }
}
