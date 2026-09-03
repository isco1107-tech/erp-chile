import { useEffect, useState } from 'react';
import { getSalesBook, getTaxSummaryF29 } from '../../lib/services/analytics';
import { formatCurrency } from '../../lib/utils';
import Tab from '../../components/Tab';
import Table from '../../components/Table';
import DownloadButton from '../../components/DownloadButton';

const ReportsPage = () => {
  const [salesBook, setSalesBook] = useState<any[]>([]);
  const [taxSummary, setTaxSummary] = useState<any>(null);
  const [period, setPeriod] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

  useEffect(() => {
    const fetchReports = async () => {
      const companyId = 'yourCompanyId'; // Reemplazar con el companyId del usuario en sesión
      const book = await getSalesBook(companyId, period.month, period.year);
      const summary = await getTaxSummaryF29(companyId, period.month, period.year);
      setSalesBook(book);
      setTaxSummary(summary);
    };

    fetchReports();
  }, [period]);

  const handlePeriodChange = (month: number, year: number) => {
    setPeriod({ month, year });
  };

  const salesBookColumns = [
    { key: 'type', label: 'Tipo Doc' },
    { key: 'folioNumber', label: 'N° Folio' },
    { key: 'issueDate', label: 'Fecha Emisión' },
    { key: 'recipientRut', label: 'RUT Receptor' },
    { key: 'recipientName', label: 'Razón Social' },
    { key: 'exemptAmount', label: 'Monto Exento' },
    { key: 'netAmount', label: 'Monto Neto' },
    { key: 'vatAmount', label: 'IVA (19%)' },
    { key: 'totalAmount', label: 'Monto Total' },
    { key: 'status', label: 'Estado' },
  ];

  const taxSummaryColumns = [
    { key: 'electronicInvoices', label: 'Facturas Electrónicas (Código 33)' },
    { key: 'electronicBills', label: 'Boletas Electrónicas (Código 39)' },
    { key: 'creditDebitNotes', label: 'Notas de Crédito / Débito (Códigos 61 / 56)' },
    { key: 'netTaxableBase', label: 'Base Imponible Neta' },
    { key: 'totalVat', label: 'IVA Débito Fiscal' },
    { key: 'exemptSales', label: 'Total Ventas Exentas' },
  ];

  return (
    <div className="p-4">
      <div className="mb-4">
        <label htmlFor="month">Mes:</label>
        <select id="month" value={period.month} onChange={(e) => handlePeriodChange(Number(e.target.value), period.year)}>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}> {i + 1} </option>
          ))}
        </select>
        <label htmlFor="year">Año:</label>
        <input type="number" id="year" value={period.year} onChange={(e) => handlePeriodChange(period.month, Number(e.target.value))} />
      </div>

      <Tab title="Libro de Ventas & DTEs">
        <Table data={salesBook} columns={salesBookColumns} />
        <DownloadButton data={salesBook} filename="sales_book.csv" />
      </Tab>

      <Tab title="Pre-Liquidación F29 (IVA)unas">
        <Table data={[taxSummary]} columns={taxSummaryColumns} />
      </Tab>

      <Tab title="Rentabilidad por Producto">
        <Table data={[]} columns={[]} /> {/* Reemplazar con datos reales */}
      </Tab>
    </div>
  );
};

export default ReportsPage;