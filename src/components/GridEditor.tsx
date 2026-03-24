import React, { useState } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '../utils/cn';

interface GridEditorProps {
  rows: number;
  cols: number;
  columnLetters: string[][];
  initialBlocks: boolean[][];
  onNext: (blocks: boolean[][]) => void;
  onBack: () => void;
}

export const GridEditor: React.FC<GridEditorProps> = ({ 
  rows, 
  cols, 
  columnLetters,
  initialBlocks, 
  onNext, 
  onBack 
}) => {
  const [blocks, setBlocks] = useState<boolean[][]>(() => {
    if (initialBlocks.length === rows && initialBlocks[0]?.length === cols) {
      return initialBlocks;
    }
    return Array.from({ length: rows }, () => Array(cols).fill(false));
  });

  const toggleBlock = (r: number, c: number) => {
    const newBlocks = blocks.map(row => [...row]);
    newBlocks[r][c] = !newBlocks[r][c];
    setBlocks(newBlocks);
  };

  const handleNext = () => {
    // Validate? Maybe check if there are enough empty spots for letters?
    // Count total letters vs total empty spots?
    // Total letters available = sum of lengths of columnLetters
    // Total empty spots = sum of !blocks cells
    // For a Drop Quote, typically the counts must match exactly per column!
    // But sometimes user might make a mistake. We should warn or just let them proceed.
    // Let's just proceed. The solver will handle mismatches (by failing or partial fill).
    
    // Actually, solver requires exact match per column? 
    // My solver implementation assumes:
    // "We must assign each letter from the column input exactly once to a valid cell in that column."
    // So if empty cells in col C != letters in col C, it's impossible.
    // We should show a warning or validation error.
    
    onNext(blocks);
  };

  // Calculate discrepancies
  const getColumnStatus = (c: number) => {
    if (!blocks.length) return { valid: true, diff: 0 };
    const letterCount = columnLetters[c]?.length || 0;
    let emptyCount = 0;
    for (let r = 0; r < rows; r++) {
      if (!blocks[r]?.[c]) emptyCount++;
    }
    return { valid: letterCount === emptyCount, diff: emptyCount - letterCount };
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-md max-w-5xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-2 text-gray-800">Set Black Squares</h2>
      <p className="text-gray-600 mb-6 text-center">
        Click on cells to toggle black squares.
        <br/>
        <span className="text-sm text-red-500 font-medium">
          Make sure the number of white squares in each column matches the number of letters provided!
        </span>
      </p>

      <div className="overflow-x-auto max-w-full">
        {/* Column Headers (Letter Counts) */}
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))` }}>
           {Array.from({ length: cols }).map((_, c) => {
             const { valid, diff } = getColumnStatus(c);
             return (
               <div key={c} className="flex flex-col items-center text-xs">
                 <span className="font-bold text-gray-700">{columnLetters[c]?.length || 0}</span>
                 <span className={cn(
                   "text-[10px] font-mono",
                   valid ? "text-green-600" : "text-red-600 font-bold"
                 )}>
                   {valid ? "OK" : diff > 0 ? `+${diff}` : diff}
                 </span>
               </div>
             );
           })}
        </div>

        {/* Grid */}
        <div 
            className="grid gap-1 bg-gray-300 p-1 border-2 border-gray-800"
            style={{ 
                gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))` 
            }}
        >
          {blocks.map((row, r) => (
            row.map((isBlock, c) => (
              <div
                key={`${r}-${c}`}
                onClick={() => toggleBlock(r, c)}
                className={cn(
                  "aspect-square cursor-pointer flex items-center justify-center text-lg font-bold select-none transition-colors",
                  isBlock ? "bg-black" : "bg-white hover:bg-gray-100"
                )}
              />
            ))
          ))}
        </div>
      </div>

      <div className="flex justify-between w-full mt-8 max-w-md">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-4 py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        
        <button
          onClick={handleNext}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors"
        >
          <span>Solve</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
