import { useEffect, useState } from 'react';
import { getDashboardMetrics } from '../../lib/services/analytics';
import { formatCurrency } from '../../lib/utils';

// Importar componentes de UI
import Card from '../../components/Card';
import LineChart from '../../components/LineChart';
import Table from '../../components/Table';
import AlertWidget from '../../components/AlertWidget';

const DashboardPage = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [salesData, setSalesData] = useState<any[]>([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      const companyId = 'yourCompanyId'; // Reemplazar con el companyId del usuario en sesión
      const metrics = await getDashboardMetrics(companyId);
      setMetrics(metrics);
      setSalesData(metrics.salesTrend);
    };

    fetchMetrics();
  }, []);

  return (
    <div className="p-4">
      <div className="grid grid-cols-4 gap-4">
        <Card title="Ventas Netas del Mes" value={formatCurrency(metrics?.netSales)} />
        <Card title="Margen de Ganancia" value={`${metrics?.grossMarginPercentage}%`} />
        <Card title="IVA Débito Fiscal" value={formatCurrency(metrics?.accumulatedTax)} />
        <Card title="Valor del Inventario" value={formatCurrency(metrics?.totalInventoryValue)} />
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold">Tendencia de Ventas Netas vs Costo de Venta</h2>
        <LineChart data={salesData} />
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold">Últimas Ventas Emitidas</h2>
        <Table data={[]} columns={[]} /> {/* Reemplazar con datos reales */}
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold">Alertas de Stock Bajo</h2>
        <AlertWidget alerts={metrics?.criticalStockAlerts} />
      </div>
    </div>
  );
};

export default DashboardPage;