import React from 'react';

interface AlertProps {
  alerts: Array<{ productId: string; productName: string; currentStock: number; minStock: number };
}

const AlertWidget: React.FC<AlertProps> = ({ alerts }) => {
  return (
    <div className="bg-white p-4 shadow-md rounded-lg">
      <h3 className="text-xl font-bold mb-2">Alertas de Stock Bajo</h3>
      <ul>
        {alerts.map((alert) => (
          <li key={alert.productId} className="flex items-center justify-between mb-2">
            <span>{alert.productName}</span>
            <span className="text-red-500 font-bold">{alert.currentStock} / {alert.minStock}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AlertWidget;