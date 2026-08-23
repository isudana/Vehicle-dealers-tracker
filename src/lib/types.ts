export type Car = {
  id: string;
  make: string;
  model: string;
  year: number | null;
  chassis_no: string | null;
  purchase_date: string | null;
  purchase_price: number;
  currency: string;
  status: "in_stock" | "sold";
  notes: string | null;
  created_at: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact_info: string | null;
  notes: string | null;
};

export type Expense = {
  id: string;
  car_id: string;
  category_id: string | null;
  supplier_id: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  description: string | null;
  expense_categories?: ExpenseCategory | null;
  suppliers?: Supplier | null;
};

export type SupplierPayment = {
  id: string;
  supplier_id: string;
  car_id: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  method: string | null;
  notes: string | null;
  cars?: { make: string; model: string } | null;
  suppliers?: { id: string; name: string } | null;
};

export type Sale = {
  id: string;
  car_id: string;
  sale_date: string;
  sale_price: number;
  currency: string;
  buyer_name: string | null;
  buyer_contact: string | null;
  notes: string | null;
};

export type CarProfit = {
  car_id: string;
  make: string;
  model: string;
  year: number | null;
  status: "in_stock" | "sold";
  purchase_price: number;
  total_expenses: number;
  sale_price: number | null;
  profit: number | null;
};

export function formatMoney(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
