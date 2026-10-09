import { AdminDashboard } from './admin/AdminDashboard';
import { CustomerPage } from './CustomerPage';

export function App() {
  return location.pathname.startsWith('/admin') ? <AdminDashboard /> : <CustomerPage />;
}
