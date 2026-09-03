import React, { useState } from 'react';
import { CSVLink } from 'react-csv';

interface DownloadButtonProps {
  data: Array<any>;
  filename: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({ data, filename }) => {
  return (
    <CSVLink data={data} filename={filename} className="bg-blue-500 text-white py-2 px-4 rounded">
      Descargar CSV
    </CSVLink>
  );
};

export default DownloadButton;