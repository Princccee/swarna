/** The shop's state when Settings has none (Settings → Shop details → State). */
export const DEFAULT_SHOP_STATE = 'Bihar';

export interface ShopAddressParts {
  /** Street / locality as typed in Settings → Shop address */
  street: string;
  district: string;
  state: string;
  pinCode: string;
  /** "Dist. Vaishali, Bihar - 843114" */
  placeLine: string;
  /** street + place line on one line, for headers */
  oneLine: string;
}

/**
 * Shop address for invoices and receipts, from Settings: shopAddress, shopDistrict,
 * shopState (falls back to the older stateName, then Bihar) and shopPinCode.
 */
export function shopAddressParts(settings: Record<string, string | undefined>): ShopAddressParts {
  const clean = (v?: string) => (v ?? '').trim();
  const street = clean(settings.shopAddress);
  const district = clean(settings.shopDistrict);
  const state = clean(settings.shopState) || clean(settings.stateName) || DEFAULT_SHOP_STATE;
  const pinCode = clean(settings.shopPinCode);

  const statePin = pinCode ? `${state} - ${pinCode}` : state;
  const placeLine = [district ? `Dist. ${district}` : '', statePin].filter(Boolean).join(', ');
  const oneLine = [street, placeLine].filter(Boolean).join(', ');
  return { street, district, state, pinCode, placeLine, oneLine };
}
