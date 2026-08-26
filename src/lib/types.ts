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
export type AdvanceType = "DEPOSIT" | "REFUND";
export type ReceiptMethod = "ADVANCE" | "DIRECT_CASH" | "LEASING_DISBURSAL";

export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  ADVANCE: "Advance",
  DIRECT_CASH: "Direct Cash",
  LEASING_DISBURSAL: "Leasing Disbursal",
};

export type Supplier = {
  id: string;
  name: string;
  country: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
};

export type CostHead = {
  id: string;
  name: string;
  group_name: string;
};

export type Vehicle = {
  chassis_number: string;
  supplier_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  target_listing_price: number;
  purchase_date: string | null;
  expected_clearance_date: string | null;
  vehicle_status: VehicleStatus;
  notes: string | null;
  created_at: string;
  suppliers?: Supplier | null;
};

export type VehicleExpense = {
  id: string;
  chassis_number: string;
  cost_head_id: string;
  amount: number;
  date_recorded: string;
  remarks: string | null;
  cost_heads?: CostHead | null;
};

export type SupplierAdvance = {
  id: string;
  supplier_id: string;
  type: AdvanceType;
  amount: number;
  currency: string;
  bank_reference: string | null;
  exchange_rate: number | null;
  transfer_date: string;
  notes: string | null;
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

export type SupplierBalance = {
  supplier_id: string;
  name: string;
  total_deposits: number;
  total_refunds: number;
  total_deducted: number;
  available_balance: number;
};

export type ExecutiveSummary = {
  total_capital_invested: number;
  total_cash_received: number;
  total_realized_profit: number;
  outstanding_receivables: number;
};

export function formatMoney(amount: number, currency: string = "LKR") {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency }).format(amount);
}
