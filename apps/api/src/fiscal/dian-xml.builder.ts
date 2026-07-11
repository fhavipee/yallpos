import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";

/**
 * Genera CUFE/CUDE según Anexo Técnico DIAN (simplificado para habilitación).
 * En producción: implementar algoritmo completo con campos obligatorios.
 */
@Injectable()
export class DianXmlBuilder {
  buildPosEquivalent(params: {
    nit: string;
    prefix: string;
    docNumber: string;
    issueDate: string;
    issueTime: string;
    subtotal: number;
    tax: number;
    total: number;
    customerDoc?: string;
    customerName?: string;
    customerDocTypeCode?: string;
    customerEmail?: string;
    customerAddress?: string;
    customerCity?: string;
    softwareId: string;
    pin: string;
  }) {
    const uuid = randomUUID();
    const buyerDoc = params.customerDoc ?? "222222222222";
    const buyerName = this.escapeXml(params.customerName ?? "Consumidor final");
    const buyerDocType = params.customerDocTypeCode ?? "13";
    const cude = this.generateCude({
      numFac: `${params.prefix}${params.docNumber}`,
      fecFac: params.issueDate,
      horFac: params.issueTime,
      valFac: params.subtotal,
      codImp: "01",
      valImp: params.tax,
      valTot: params.total,
      nitOFE: params.nit,
      numAdq: buyerDoc,
      softwareId: params.softwareId,
      pin: params.pin,
      ambiente: process.env.FISCAL_ENV === "produccion" ? "1" : "2",
    });

    const emailXml = params.customerEmail
      ? `\n    <cbc:ElectronicMail>${this.escapeXml(params.customerEmail)}</cbc:ElectronicMail>`
      : "";
    const addressXml =
      params.customerAddress || params.customerCity
        ? `\n    <cac:PhysicalLocation>
      <cac:Address>
        <cbc:CityName>${this.escapeXml(params.customerCity ?? "")}</cbc:CityName>
        <cac:AddressLine><cbc:Line>${this.escapeXml(params.customerAddress ?? "")}</cbc:Line></cac:AddressLine>
      </cac:Address>
    </cac:PhysicalLocation>`
        : "";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1">
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:ID>${params.prefix}${params.docNumber}</cbc:ID>
  <cbc:IssueDate>${params.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${params.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>20</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cbc:RegistrationName>${this.escapeXml(params.nit)}</cbc:RegistrationName>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>${buyerDocType}</cbc:AdditionalAccountID>
    <cbc:RegistrationName>${buyerName}</cbc:RegistrationName>
    <cbc:CompanyID>${buyerDoc}</cbc:CompanyID>${emailXml}${addressXml}
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${params.subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${params.total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${params.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <ext:UBLExtensions>
    <ext:ExtensionContent>
      <sts:DianExtensions>
        <sts:SoftwareSecurityCode>${cude}</sts:SoftwareSecurityCode>
      </sts:DianExtensions>
    </ext:ExtensionContent>
  </ext:UBLExtensions>
</Invoice>`;

    return { xml, cude, uuid };
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private generateCude(fields: Record<string, string | number>): string {
    const seed = Object.values(fields).join("");
    return createHash("sha384").update(seed).digest("hex");
  }
}
