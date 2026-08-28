export type VehicleStatus =
  | "BOUGHT_NOT_RECEIVED"
  | "IN_STOCK"
  | "SOLD_PENDING_PAYMENT"
  | "SOLD_FULLY_CLOSED";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  BOUGHT_NOT_RECEIVED: "Bought - Not Received",
  IN_STOCK: "In Stock",
  SOLD_PENDING_PAYMENT: "Sold - Pending Payment",
  SOLD_FULLY_CLOSED: "Sold - Fully Closed",
};

export type PaymentType = "DIRECT_CASH" | "LEASING" | "HYBRID";
export type LeasingStatus = "NOT_APPLICABLE" | "PENDING" | "RECEIVED";
export type ReceiptMethod = "ADVANCE" | "DIRECT_CASH" | "LEASING_DISBURSAL";

export type SpareKeyStatus = "AVAILABLE" | "PENDING" | "NOT_AVAILABLE" | "RECEIVED";

export const SPARE_KEY_STATUS_LABEL: Record<SpareKeyStatus, string> = {
  AVAILABLE: "Available",
  PENDING: "Not Received (Pending)",
  NOT_AVAILABLE: "Not Available",
  RECEIVED: "Received",
};

export function landedAgeTone(days: number | null): "green" | "yellow" | "amber" | "red" | null {
  if (days == null) return null;
  if (days < 30) return "green";
  if (days < 60) return "yellow";
  if (days < 75) return "amber";
  return "red";
}

export const LANDED_AGE_TONE_CLASSES: Record<"green" | "yellow" | "amber" | "red", string> = {
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  ADVANCE: "Advance",
  DIRECT_CASH: "Direct Cash",
  LEASING_DISBURSAL: "Leasing Disbursal",
};

export const CURRENCIES = ["LKR", "JPY", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type CashEntityType =
  | "GOVERNMENT"
  | "PORT"
  | "SUPPLIER"
  | "DRIVER"
  | "MECHANIC"
  | "INVESTOR"
  | "BANK"
  | "CLEARING_AGENT"
  | "CASH"
  | "LEASING_COMPANY"
  | "CUSTOMER"
  | "OTHER";

export const CASH_ENTITY_TYPE_LABEL: Record<CashEntityType, string> = {
  GOVERNMENT: "Government",
  PORT: "Port",
  SUPPLIER: "Supplier",
  DRIVER: "Driver",
  MECHANIC: "Mechanic",
  INVESTOR: "Investor",
  BANK: "Bank",
  CLEARING_AGENT: "Clearing Agent",
  CASH: "Cash",
  LEASING_COMPANY: "Leasing Company",
  CUSTOMER: "Customer",
  OTHER: "Other",
};

export type TransferMethod = "TT" | "LC" | "CASH" | "BANK_TRANSFER" | "OTHER";

export const TRANSFER_METHOD_LABEL: Record<TransferMethod, string> = {
  TT: "TT",
  LC: "LC",
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

export type CashEntityCategory = "CASH_ACCOUNT" | "CASH_ENTITY" | "INVESTOR" | "LEASING_COMPANY";

export const CASH_ENTITY_CATEGORY_LABEL: Record<CashEntityCategory, string> = {
  CASH_ACCOUNT: "Cash Account",
  CASH_ENTITY: "Cash Entity",
  INVESTOR: "Investor",
  LEASING_COMPANY: "Leasing Company",
};

export type CashEntity = {
  id: string;
  name: string;
  type: CashEntityType;
  category: CashEntityCategory;
  logo_path: string | null;
  primary_currency: string;
  supplier_id: string | null;
};

export type CashTransfer = {
  id: string;
  source_entity_id: string;
  destination_entity_id: string;
  amount: number;
  currency: string;
  exchange_rate_to_lkr: number;
  amount_lkr: number;
  transfer_date: string;
  method: TransferMethod;
  purpose: string | null;
  notes: string | null;
  bank_reference: string | null;
  receipt_path: string | null;
  lc_document_path: string | null;
  source_entity?: CashEntity | null;
  destination_entity?: CashEntity | null;
};

export type CashEntityBalance = {
  entity_id: string;
  name: string;
  type: CashEntityType;
  category: CashEntityCategory;
  logo_path: string | null;
  primary_currency: string;
  supplier_id: string | null;
  total_in_lkr: number;
  total_out_lkr: number;
  balance_lkr: number;
  total_in_native: number;
  total_out_native: number;
  balance_native: number;
};

export type Supplier = {
  id: string;
  name: string;
  country: string;
  primary_currency: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  logo_path: string | null;
};

export type SupplierBalanceHold = {
  id: string;
  supplier_id: string;
  amount: number;
  exchange_rate_to_lkr: number;
  amount_lkr: number;
  reason: string | null;
  created_at: string;
};

export type CostHead = {
  id: string;
  name: string;
  group_name: string;
};

export type VehicleModel = {
  id: string;
  make: string;
  name: string;
  chassis_code: string | null;
};

export type Vehicle = {
  chassis_number: string;
  supplier_id: string;
  model_id: string;
  year: number | null;
  color: string | null;
  target_listing_price: number;
  auction_price: number | null;
  auction_price_currency: string;
  cif_price: number | null;
  cif_price_currency: string;
  purchase_date: string | null;
  lc_open_date: string | null;
  landed_date: string | null;
  cleared_date: string | null;
  spare_key_status: SpareKeyStatus;
  vehicle_status: VehicleStatus;
  notes: string | null;
  created_at: string;
  suppliers?: Supplier | null;
  vehicle_models?: VehicleModel | null;
};

export type VehiclePhoto = {
  id: string;
  chassis_number: string;
  storage_path: string;
  created_at: string;
};

export type VehicleDocument = {
  id: string;
  chassis_number: string;
  storage_path: string;
  file_name: string;
  created_at: string;
};

export type VehicleExpense = {
  id: string;
  chassis_number: string;
  cost_head_id: string;
  cash_transfer_id: string;
  remarks: string | null;
  cost_heads?: CostHead | null;
  cash_transfers?: CashTransfer | null;
};

export type OverheadCategory = {
  id: string;
  name: string;
};

export type OverheadExpense = {
  id: string;
  category_id: string;
  cash_transfer_id: string;
  remarks: string | null;
  overhead_categories?: OverheadCategory | null;
  cash_transfers?: CashTransfer | null;
};

export type Resource = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  logo_path: string | null;
};

export type AppSettings = {
  id: number;
  app_name: string;
  logo_path: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type Customer = {
  id: string;
  full_name: string;
  nic_passport: string;
  phone: string;
  address: string | null;
  email: string | null;
};

export type Sale = {
  id: string;
  chassis_number: string;
  customer_id: string;
  agreed_sale_price: number;
  payment_type: PaymentType;
  leasing_company_id: string | null;
  leasing_amount_approved: number;
  leasing_status: LeasingStatus;
  release_order_status: string | null;
  sale_date: string;
  notes: string | null;
  customers?: Customer | null;
  vehicles?: Vehicle | null;
  leasing_company?: CashEntity | null;
};

export type SaleReceipt = {
  id: string;
  sale_id: string;
  amount: number;
  payment_method: ReceiptMethod;
  cash_transfer_id: string | null;
  received_date: string;
  reference: string | null;
  notes: string | null;
  sales?: Sale | null;
};

export type Invoice = {
  id: string;
  invoice_no: number;
  sale_receipt_id: string;
  chassis_number: string;
  invoiced_amount: number;
  issue_date: string;
  notes: string | null;
  sale_receipts?: SaleReceipt | null;
  vehicles?: Vehicle | null;
};

export function formatInvoiceNo(invoiceNo: number) {
  return `INV-${String(invoiceNo).padStart(6, "0")}`;
}

export type VehiclePnl = {
  chassis_number: string;
  make: string;
  model: string;
  year: number | null;
  vehicle_status: VehicleStatus;
  supplier_id: string;
  target_listing_price: number;
  landed_date: string | null;
  days_since_landed: number | null;
  total_landed_cost: number;
  sale_id: string | null;
  agreed_sale_price: number | null;
  total_cash_collected: number;
  balance_due: number | null;
  net_profit: number | null;
  profit_margin_percent: number | null;
  projected_profit: number | null;
};

export type ModelSummary = {
  model_id: string;
  model: string;
  total_vehicles: number;
  available_count: number;
  pending_payment_count: number;
  sold_count: number;
  total_landed_cost: number;
  total_realized_profit: number;
};

export type ExecutiveSummary = {
  total_capital_invested: number;
  total_cash_received: number;
  total_realized_profit: number;
  outstanding_receivables: number;
  total_capital_injected: number;
  total_overhead_expenses: number;
};

export function formatMoney(amount: number, currency: string = "LKR") {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency }).format(amount);
}
