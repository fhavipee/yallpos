import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import AdmZip from "adm-zip";

export type DianSendResult = {
  success: boolean;
  statusCode: string;
  message: string;
  trackId?: string;
  rawResponse?: string;
};

const DIAN_ENDPOINTS = {
  habilitacion: "https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc",
  produccion: "https://vpfe.dian.gov.co/WcfDianCustomerServices.svc",
};

@Injectable()
export class DianClient {
  private readonly logger = new Logger(DianClient.name);

  getEndpoint(): string {
    const env = process.env.FISCAL_ENV ?? "habilitacion";
    return env === "produccion" ? DIAN_ENDPOINTS.produccion : DIAN_ENDPOINTS.habilitacion;
  }

  async sendDocument(signedXml: string, docType: string, fileName: string): Promise<DianSendResult> {
    const env = process.env.FISCAL_ENV ?? "simulacion";

    if (env === "simulacion") {
      return this.simulate(docType, signedXml);
    }

    return this.sendBillSync(signedXml, fileName);
  }

  /** SendBillSync — envío individual de documento firmado */
  async sendBillSync(signedXml: string, fileName: string): Promise<DianSendResult> {
    const endpoint = this.getEndpoint();
    const zipB64 = this.xmlToZipBase64(signedXml, fileName);
    const testSetId = process.env.FISCAL_TEST_SET_ID ?? "";

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wcf="http://wcf.dian.colombia">
  <soap:Header/>
  <soap:Body>
    <wcf:SendBillSync>
      <wcf:fileName>${fileName}</wcf:fileName>
      <wcf:contentFile>${zipB64}</wcf:contentFile>
    </wcf:SendBillSync>
  </soap:Body>
</soap:Envelope>`;

    try {
      const { data } = await axios.post(endpoint, soapBody, {
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          SOAPAction: "http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync",
        },
        timeout: 30000,
      });

      const accepted = String(data).includes("Accepted") || String(data).includes("Aceptado") || String(data).includes("00");
      const trackMatch = String(data).match(/<ZipKey>([^<]+)<\/ZipKey>/i);
      const trackId = trackMatch?.[1] ?? `DIAN-${Date.now()}`;

      this.logger.log(`DIAN SendBillSync → ${accepted ? "ACEPTADO" : "RESPUESTA"} (${trackId})`);

      return {
        success: accepted,
        statusCode: accepted ? "00" : "99",
        message: accepted ? "Documento aceptado por DIAN" : "Respuesta DIAN — revisar XML",
        trackId,
        rawResponse: String(data).slice(0, 2000),
      };
    } catch (err: any) {
      this.logger.error(`DIAN error: ${err.message}`);
      throw new Error(`DIAN no disponible: ${err.message}`);
    }
  }

  /** SendTestSetAsync — habilitación con set de pruebas DIAN */
  async sendTestSetAsync(signedXml: string, fileName: string): Promise<DianSendResult> {
    const testSetId = process.env.FISCAL_TEST_SET_ID;
    if (!testSetId) {
      throw new Error("Configure FISCAL_TEST_SET_ID para habilitación DIAN");
    }

    const endpoint = this.getEndpoint();
    const zipB64 = this.xmlToZipBase64(signedXml, fileName);

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wcf="http://wcf.dian.colombia">
  <soap:Header/>
  <soap:Body>
    <wcf:SendTestSetAsync>
      <wcf:fileName>${fileName}</wcf:fileName>
      <wcf:contentFile>${zipB64}</wcf:contentFile>
      <wcf:testSetId>${testSetId}</wcf:testSetId>
    </wcf:SendTestSetAsync>
  </soap:Body>
</soap:Envelope>`;

    try {
      const { data } = await axios.post(endpoint, soapBody, {
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          SOAPAction: "http://wcf.dian.colombia/IWcfDianCustomerServices/SendTestSetAsync",
        },
        timeout: 60000,
      });

      const trackMatch = String(data).match(/<ZipKey>([^<]+)<\/ZipKey>/i);
      return {
        success: true,
        statusCode: "00",
        message: "Set de pruebas enviado a DIAN",
        trackId: trackMatch?.[1] ?? testSetId,
        rawResponse: String(data).slice(0, 2000),
      };
    } catch (err: any) {
      throw new Error(`Error enviando set de pruebas: ${err.message}`);
    }
  }

  async getStatusZip(zipKey: string): Promise<DianSendResult> {
    const endpoint = this.getEndpoint();
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wcf="http://wcf.dian.colombia">
  <soap:Body>
    <wcf:GetStatusZip>
      <wcf:trackId>${zipKey}</wcf:trackId>
    </wcf:GetStatusZip>
  </soap:Body>
</soap:Envelope>`;

    const { data } = await axios.post(endpoint, soapBody, {
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      timeout: 30000,
    });

    return {
      success: String(data).includes("Aceptado") || String(data).includes("Accepted"),
      statusCode: "00",
      message: String(data).slice(0, 500),
      trackId: zipKey,
    };
  }

  private xmlToZipBase64(xml: string, fileName: string): string {
    const zip = new AdmZip();
    zip.addFile(fileName.endsWith(".xml") ? fileName : `${fileName}.xml`, Buffer.from(xml, "utf8"));
    return zip.toBuffer().toString("base64");
  }

  private async simulate(docType: string, xml: string): Promise<DianSendResult> {
    this.logger.log(`[SIMULACIÓN] ${docType} (${xml.length} bytes)`);
    await new Promise((r) => setTimeout(r, 300));
    return {
      success: true,
      statusCode: "00",
      message: "Documento aceptado (simulación)",
      trackId: `SIM-${Date.now()}`,
    };
  }
}
