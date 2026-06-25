export enum Role {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
  ACCOUNTANT = 'ACCOUNTANT',
  CUSTOMER = 'CUSTOMER',
}

export enum Metal {
  GOLD = 'GOLD',
  SILVER = 'SILVER',
  PLATINUM = 'PLATINUM',
}

export enum Purity {
  GOLD_24K = 'GOLD_24K',
  GOLD_22K = 'GOLD_22K',
  GOLD_18K = 'GOLD_18K',
  GOLD_14K = 'GOLD_14K',
  SILVER_999 = 'SILVER_999',
  SILVER_925 = 'SILVER_925',
  PLATINUM_950 = 'PLATINUM_950',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  IRN_PENDING = 'IRN_PENDING',
  IRN_REGISTERED = 'IRN_REGISTERED',
  CANCELLED = 'CANCELLED',
}

export enum OrderType {
  PRE_ORDER = 'PRE_ORDER',
  CUSTOM = 'CUSTOM',
  REPAIR = 'REPAIR',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  MAKING = 'MAKING',
  READY = 'READY',
  INVOICED = 'INVOICED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMode {
  CASH = 'CASH',
  UPI = 'UPI',
  CARD = 'CARD',
  NET_BANKING = 'NET_BANKING',
  CHEQUE = 'CHEQUE',
  OLD_GOLD_EXCHANGE = 'OLD_GOLD_EXCHANGE',
}

export enum RegisterType {
  SALES = 'SALES',
  PURCHASE = 'PURCHASE',
  OLD_GOLD_EXCHANGE = 'OLD_GOLD_EXCHANGE',
  KARIGAR = 'KARIGAR',
  KYC = 'KYC',
  EXPENSE = 'EXPENSE',
}

export enum KarigarEntryType {
  ISSUED = 'ISSUED',
  RETURNED = 'RETURNED',
}
