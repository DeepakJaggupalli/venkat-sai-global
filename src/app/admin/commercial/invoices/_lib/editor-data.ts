import "server-only";

import { getCommercialConfig, getSellerDetails } from "@/modules/commercial/config";
import type { StaffContext } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { listActiveTaxRatesForPreview, listBuyerTaxProfiles } from "../../_lib/queries";

/** Everything the manual invoice editor needs for its live tax preview (serialisable). */
export async function loadInvoiceEditorData(staff: StaffContext) {
  const [buyers, currencies, seller, rates, config] = await Promise.all([
    listBuyerTaxProfiles(staff),
    currencyOptions(),
    getSellerDetails(),
    listActiveTaxRatesForPreview(staff),
    getCommercialConfig(),
  ]);
  return {
    buyers,
    currencies,
    seller: { countryCode: seller.countryCode, stateCode: seller.stateCode, taxId: seller.taxId },
    rates,
    exportZeroRated: config["commercial.export_zero_rated"],
    defaultTaxCode: config["commercial.default_tax_code"],
  };
}
