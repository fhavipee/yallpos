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
    softwareId: string;
    pin: string;
  }) {
    const uuid = randomUUID();
    const cude = this.generateCude({
      numFac: `${params.prefix}${params.docNumber}`,
      fecFac: params.issueDate,
      horFac: params.issueTime,
      valFac: params.subtotal,
      codImp: "01",
      valImp: params.tax,
      valTot: params.total,
      nitOFE: params.nit,
      numAdq: params.customerDoc ?? "222222222222",
      softwareId: params.softwareId,
      pin: params.pin,
      ambiente: process.env.FISCAL_ENV === "produccion" ? "1" : "2",
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:ID>${params.prefix}${params.docNumber}</cbc:ID>
  <cbc:IssueDate>${params.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${params.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>20</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cbc:RegistrationName>${params.nit}</cbc:RegistrationName>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cbc:RegistrationName>${params.customerName ?? "Consumidor final"}</cbc:RegistrationName>
    <cbc:CompanyID>${params.customerDoc ?? "222222222222"}</cbc:CompanyID>
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

  private generateCude(fields: Record<string, string | number>): string {
    const seed = Object.values(fields).join("");
    return createHash("sha384").update(seed).digest("hex");
  }
}
