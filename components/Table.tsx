import React from 'react';

interface TableColumn {
  key: string;
  label: string;
}

interface TableProps {
  data: any[];
  columns: TableColumn[];
}

const Table: React.FC<TableProps> = ({ data, columns }) => {
  return (
    <table className="min-w-full divide-y divide-white/[0.08]">
      <thead className="bg-white/[0.03]">
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className="px-6 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.06]">
        {data.map((row, index) => (
          <tr key={index} className="transition-colors hover:bg-white/[0.03]">
            {columns.map((column) => (
              <td key={column.key} className="whitespace-nowrap px-6 py-4 text-sm text-zinc-300">
                {row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Table;