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
export type AdvanceType = "TT_DEPOSIT" | "LC_TRANSFER" | "REFUND";
export type ReceiptMethod = "ADVANCE" | "DIRECT_CASH" | "LEASING_DISBURSAL";

export const ADVANCE_TYPE_LABEL: Record<AdvanceType, string> = {
  TT_DEPOSIT: "TT Deposit",
  LC_TRANSFER: "LC Transfer",
  REFUND: "Refund",
};

export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  ADVANCE: "Advance",
  DIRECT_CASH: "Direct Cash",
  LEASING_DISBURSAL: "Leasing Disbursal",
};

export const CURRENCIES = ["LKR", "JPY", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

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

export type CostHead = {
  id: string;
  name: string;
  group_name: string;
};

export type VehicleModel = {
  id: string;
  name: string;
};

export type Vehicle = {
  chassis_number: string;
  supplier_id: string;
  make: string;
  model_id: string;
  year: number | null;
  color: string | null;
  target_listing_price: number;
  auction_price: number | null;
  cif_price: number | null;
  purchase_date: string | null;
  expected_clearance_date: string | null;
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
  amount: number;
  currency: string;
  exchange_rate_to_lkr: number;
  amount_lkr: number;
  date_recorded: string;
  remarks: string | null;
  attachment_path: string | null;
  cost_heads?: CostHead | null;
};

export type SupplierAdvance = {
  id: string;
  supplier_id: string;
  type: AdvanceType;
  amount: number;
  currency: string;
  exchange_rate_to_lkr: number;
  amount_lkr: number;
  bank_reference: string | null;
  transfer_date: string;
  notes: string | null;
  receipt_path: string | null;
  lc_document_path: string | null;
};

export type CapitalInjection = {
  id: string;
  amount: number;
  currency: string;
  exchange_rate_to_lkr: number;
  amount_lkr: number;
  storage_location: string;
  source: string | null;
  injection_date: string;
  notes: string | null;
};

export type OverheadCategory = {
  id: string;
  name: string;
};

export type OverheadExpense = {
  id: string;
  category_id: string;
  amount: number;
  currency: string;
  exchange_rate_to_lkr: number;
  amount_lkr: number;
  expense_date: string;
  remarks: string | null;
  attachment_path: string | null;
  overhead_categories?: OverheadCategory | null;
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
  leasing_company_name: string | null;
  leasing_amount_approved: number;
  leasing_status: LeasingStatus;
  release_order_status: string | null;
  sale_date: string;
  notes: string | null;
  customers?: Customer | null;
  vehicles?: Vehicle | null;
};

export type SaleReceipt = {
  id: string;
  sale_id: string;
  amount: number;
  payment_method: ReceiptMethod;
  received_date: string;
  reference: string | null;
  notes: string | null;
};

export type VehiclePnl = {
  chassis_number: string;
  make: string;
  model: string;
  year: number | null;
  vehicle_status: VehicleStatus;
  supplier_id: string;
  target_listing_price: number;
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

export type SupplierBalance = {
  supplier_id: string;
  name: string;
  primary_currency: string;
  total_deposits_lkr: number;
  total_refunds_lkr: number;
  total_deducted_lkr: number;
  available_balance_lkr: number;
  total_deposits_native: number;
  total_refunds_native: number;
  total_deducted_native: number;
  available_balance_native: number;
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
