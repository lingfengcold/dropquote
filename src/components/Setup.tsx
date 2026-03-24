import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface SetupProps {
  onNext: (rows: number, cols: number) => void;
}

export const Setup: React.FC<SetupProps> = ({ onNext }) => {
  const [rows, setRows] = useState<number>(5);
  const [cols, setCols] = useState<number>(5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rows > 0 && cols > 0) {
      onNext(rows, cols);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-md max-w-md mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Set Grid Size</h2>
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rows</label>
          <input
            type="number"
            min="1"
            value={rows}
            onChange={(e) => setRows(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Columns</label>
          <input
            type="number"
            min="1"
            value={cols}
            onChange={(e) => setCols(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
        >
          <span>Next</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
