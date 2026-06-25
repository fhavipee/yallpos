import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { DianCertificateService } from "./dian-certificate.service";

/**
 * Firma XML para DIAN (XAdES-EPES simplificado).
 * Producción: validar contra XSD y política de firma DIAN vigente.
 */
@Injectable()
export class DianXmlSigner {
  constructor(private certService: DianCertificateService) {}

  signXml(xml: string): { signedXml: string; signatureValue: string; digestValue: string } {
    const digestValue = createHash("sha256").update(xml, "utf8").digest("base64");
    const signedInfo = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  <ds:Reference URI="">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${digestValue}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`;

    const signatureValue = this.certService.sign(signedInfo) ?? "UNSIGNED_NO_CERT";
    const certPem = this.certService.getCertificatePem() ?? "";
    const certB64 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\n/g, "");

    const signatureBlock = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  ${signedInfo}
  <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>${certB64}</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
</ds:Signature>`;

    const signedXml = xml.replace("</Invoice>", `${signatureBlock}</Invoice>`);
    return { signedXml, signatureValue, digestValue };
  }
}
