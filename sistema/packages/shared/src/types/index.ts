export type ID = string;
export type ISODate = string;

/* ───────── Mesas ───────── */
export type Zone = 'rooftop' | 'piscina' | 'sala-principal';
export type TableStatus = 'free' | 'occupied' | 'reserved';

export interface Table {
  id: ID;
  code: string;                 // ex.: "Mesa-04-Rooftop" (conteúdo do QR Code)
  zone: Zone;
  seats: number;
  status: TableStatus;
  mapPosition: { x: number; y: number }; // % no mapa interactivo
}

/* ───────── Menu ───────── */
export type MenuCategory = 'sushi' | 'marisco' | 'cocktails' | 'principais' | 'sobremesas';

export interface MenuItem {
  id: ID;
  category: MenuCategory;
  name: string;
  sensoryDescription: string;
  ingredients: string[];
  allergens: string[];
  winePairing?: string;
  priceMzn: number;
  photoUrl: string;
  available: boolean;
}

/* ───────── Pedidos ───────── */
export type OrderStatus = 'received' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

export interface OrderLine {
  menuItemId: ID;
  name: string;           // snapshot do nome no momento do pedido
  unitPriceMzn: number;   // snapshot do preço
  quantity: number;
  notes?: string;         // "sem cebola", "molho à parte"
}

export interface Order {
  id: ID;
  tableId: ID;
  customerId: ID;
  lines: OrderLine[];
  status: OrderStatus;
  totalMzn: number;
  assignedWaiterId?: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ───────── Chamadas de garçom ───────── */
export type WaiterCallReason = 'request_bill' | 'menu_question' | 'new_order' | 'urgent_other';
export type WaiterCallStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

export interface WaiterCall {
  id: ID;
  tableId: ID;
  tableCode: string;
  zone: Zone;
  reason: WaiterCallReason;
  note?: string;
  status: WaiterCallStatus;
  createdAt: ISODate;
  acceptedAt?: ISODate;
  completedAt?: ISODate;
  acceptedBy?: { id: ID; name: string };
}

/* ───────── Utilizadores ───────── */
export type Role = 'customer' | 'waiter' | 'admin';
export interface User { id: ID; name: string; role: Role; email?: string; phone?: string; }

/* ───────── Analytics ───────── */
export interface WaiterPerformance {
  waiterId: ID;
  waiterName: string;
  callsHandled: number;
  avgResponseSeconds: number;
  salesMzn: number;
  avgRating: number;
}

export interface PopularItem { menuItemId: ID; name: string; category: MenuCategory; unitsSold: number; revenueMzn: number; }
export interface HourlyOccupancy { hour: number; rooftop: number; piscina: number; salaPrincipal: number; } // 0–100 %
export interface SatisfactionStats { average: number; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number>; }

export interface Analytics {
  range: { from: ISODate; to: ISODate };
  kpis: { occupiedTables: number; totalTables: number; avgServiceSeconds: number; revenueTodayMzn: number; openCalls: number };
  waiters: WaiterPerformance[];
  popularItems: PopularItem[];
  occupancyByHour: HourlyOccupancy[];
  satisfaction: SatisfactionStats;
}
