import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, ScanLine } from 'lucide-react';
import { ImageImporter } from './ImageImporter';

interface InputLettersProps {
  cols: number;
  onNext: (columnLetters: string[][]) => { isValid: boolean, message?: string }; // Updated signature to allow validation feedback
  onBack: () => void;
  initialLetters: string[][];
}

export const InputLetters: React.FC<InputLettersProps> = ({ cols, onNext, onBack, initialLetters }) => {
  const [letters, setLetters] = useState<string[][]>(() => {
    // Ensure we have an array of arrays of the correct length
    if (initialLetters && initialLetters.length === cols) {
      return initialLetters;
    }
    return Array.from({ length: cols }, () => []);
  });

  const [showImporter, setShowImporter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state if cols changes (though typically this component unmounts on back)
  useEffect(() => {
    setLetters(prev => {
        if (prev.length === cols) return prev;
        return Array.from({ length: cols }, () => []);
    });
  }, [cols]);

  const handleInputChange = (index: number, value: string) => {
    // Only allow letters
    const cleanValue = value.toUpperCase().replace(/[^A-Z]/g, '');
    setLetters(prev => {
        const newLetters = [...prev];
        newLetters[index] = cleanValue.split('');
        return newLetters;
    });
  };

  const handleImport = (importedCols: string[][]) => {
      // importedCols might be shorter or longer than expected cols
      // We map them to our current state
      setLetters(prev => {
          const newLetters = [...prev];
          importedCols.forEach((colData, index) => {
              if (index < newLetters.length) {
                  newLetters[index] = colData;
              }
          });
          return newLetters;
      });
      setShowImporter(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = onNext(letters);
    if (result && !result.isValid) {
        setError(result.message || "Please check your inputs.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-md max-w-6xl mx-auto mt-10">
      <div className="flex justify-between items-center w-full mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Enter Letters</h2>
        
        <button 
            onClick={() => setShowImporter(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors border border-indigo-200"
        >
            <ScanLine size={18} />
            <span className="hidden sm:inline">Fill from Image</span>
        </button>
      </div>

      <p className="text-gray-600 mb-6 text-center max-w-lg">
        Type the available letters for each column. Or upload an image of the letter grid to auto-fill.
      </p>
      
      {error && (
          <div className="w-full bg-red-50 text-red-600 p-3 mb-4 rounded-md text-sm text-center border border-red-200">
              {error}
          </div>
      )}

      <form onSubmit={handleSubmit} className="w-full">
        <div className="overflow-x-auto pb-4">
            <div className="flex gap-2 min-w-max justify-center px-4">
            {Array.from({ length: cols }).map((_, i) => (
                <div key={i} className="flex flex-col w-12 sm:w-16">
                <label className="text-xs font-medium text-gray-500 mb-1 text-center">Col {i + 1}</label>
                <div className="relative">
                    <input
                        type="text"
                        value={letters[i] ? letters[i].join('') : ''}
                        onChange={(e) => handleInputChange(i, e.target.value)}
                        className="w-full h-32 sm:h-40 px-2 py-2 border border-gray-300 rounded-md text-center font-mono text-lg uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 writing-vertical-lr"
                        style={{ writingMode: 'vertical-lr', textOrientation: 'upright', letterSpacing: '0.5em' }}
                        placeholder="..."
                    />
                </div>
                <div className="text-xs text-gray-400 mt-1 text-center font-mono">
                    {letters[i]?.length || 0}
                </div>
                </div>
            ))}
            </div>
        </div>

        <div className="flex justify-between w-full mt-8 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-4 py-2 hover:bg-gray-50 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          
          <button
            type="submit"
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-8 rounded-md transition-colors shadow-sm"
          >
            <span>Next: Grid Setup</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {showImporter && (
          <ImageImporter 
            numColumns={cols}
            onImport={handleImport}
            onClose={() => setShowImporter(false)}
          />
      )}
    </div>
  );
};
