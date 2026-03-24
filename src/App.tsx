import { useState, useEffect } from 'react';
import { Setup } from './components/Setup';
import { InputLetters } from './components/InputLetters';
import { GridEditor } from './components/GridEditor';
import { DropQuoteSolver, SolverResult } from './lib/solver';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';

type Step = 'setup' | 'letters' | 'grid' | 'solving' | 'results';

const DICTIONARY_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
const COMMON_WORDS_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';

function App() {
  const [step, setStep] = useState<Step>('setup');
  
  // State
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [columnLetters, setColumnLetters] = useState<string[][]>([]);
  const [blocks, setBlocks] = useState<boolean[][]>([]);
  
  // Solver
  const [dictionary, setDictionary] = useState<string[]>([]);
  const [commonWords, setCommonWords] = useState<Set<string>>(new Set());
  const [isLoadingDictionary, setIsLoadingDictionary] = useState(true);
  const [results, setResults] = useState<SolverResult[]>([]);
  const [solverError, setSolverError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
        fetch(DICTIONARY_URL).then(res => res.text()),
        fetch(COMMON_WORDS_URL).then(res => res.text())
    ])
      .then(([dictText, commonText]) => {
        // Process Main Dictionary
        const words = dictText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
        
        // Process Common Words
        const common = new Set(
            commonText.split('\n')
            .map(w => w.trim().toUpperCase())
            .filter(w => w.length > 0)
        );

        // Add common abbreviations and names not always in standard lists
        const extras = [
            "TV", "OK", "AM", "PM", "US", "UK", "EU", "ID", "IQ", "PC", "CD", "DVD",
            "MR", "MS", "DR", "ST", "RD", "AVE", "BLVD", "GOV", "GEN", "CAPT",
            "LT", "SGT", "CPL", "PVT", "CO", "CORP", "INC", "LTD", "EST", "DEPT",
            "VS", "ETC", "EG", "IE", "NB", "PS", "PHD", "MD", "BA", "MA", "BSC", "MSC",
            "JAN", "FEB", "MAR", "APR", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
            "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
            "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", 
            "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", 
            "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", 
            "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", 
            "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
            "TENN", "FLA", "CALIF", "MICH", "WASH", "COLO", "CONN", "MASS",
            // Specific words from user examples to ensure coverage
            "WASTREL", "INHERITANCE", "EXHAUST", "EXPERIENCES", "SAVINGS", "MISER", "WISDOM",
            "ADVERSITY", "CONTROLLED", "REACT"
        ];
        
        // Add extras to both dictionary and common words (to ensure they are prioritized)
        const fullDictionary = [...words, ...extras];
        extras.forEach(w => common.add(w));

        setDictionary(fullDictionary);
        setCommonWords(common);
        setIsLoadingDictionary(false);
      })
      .catch(err => {
        console.error("Failed to load dictionary", err);
        // Fallback
        setDictionary(["THE", "AND", "IS", "TO", "IN"]); 
        setCommonWords(new Set(["THE", "AND", "IS", "TO", "IN"]));
        setIsLoadingDictionary(false);
      });
  }, []);

  useEffect(() => {
    if (step === 'solving') {
      const timeoutId = setTimeout(() => {
        try {
            const solver = new DropQuoteSolver(dictionary, commonWords);
            const found = solver.solve(rows, cols, columnLetters, blocks);
            setResults(found);
            setStep('results');
        } catch (e: any) {
            console.error(e);
            setSolverError(e.message || "Unknown error occurred during solving");
            setStep('results');
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [step, rows, cols, columnLetters, blocks, dictionary, commonWords]);

  const handleSetupNext = (r: number, c: number) => {
    setRows(r);
    setCols(c);
    setColumnLetters(Array.from({ length: c }, () => []));
    setStep('letters');
  };

  const handleLettersNext = (letters: string[][]): { isValid: boolean, message?: string } => {
    // Basic validation
    const totalLetters = letters.reduce((acc, col) => acc + col.length, 0);
    if (totalLetters === 0) {
        return { isValid: false, message: "Please enter at least one letter." };
    }

    setColumnLetters(letters);
    // Initialize blocks if dimensions changed or first time
    if (blocks.length !== rows || blocks[0]?.length !== cols) {
        setBlocks(Array.from({ length: rows }, () => Array(cols).fill(false)));
    }
    setStep('grid');
    return { isValid: true };
  };

  const handleGridNext = (finalBlocks: boolean[][]) => {
    setBlocks(finalBlocks);
    setStep('solving');
  };

  const handleRestart = () => {
    setStep('setup');
    setResults([]);
    setSolverError(null);
  };

  const handleBackToGrid = () => {
    setStep('grid');
    setResults([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Drop Quote Solver
          </h1>
          {isLoadingDictionary && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading Dictionary...
            </span>
          )}
          {!isLoadingDictionary && dictionary.length > 0 && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Dictionary Ready ({dictionary.length} words)
            </span>
          )}
        </div>
      </header>

      <main className="p-4">
        {step === 'setup' && <Setup onNext={handleSetupNext} />}
        
        {step === 'letters' && (
          <InputLetters 
            cols={cols} 
            initialLetters={columnLetters} 
            onNext={handleLettersNext} 
            onBack={() => setStep('setup')} 
          />
        )}

        {step === 'grid' && (
          <GridEditor 
            rows={rows} 
            cols={cols} 
            columnLetters={columnLetters}
            initialBlocks={blocks} 
            onNext={handleGridNext} 
            onBack={() => setStep('letters')}
          />
        )}

        {step === 'solving' && (
          <div className="flex flex-col items-center justify-center mt-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <h2 className="text-xl font-semibold">Solving...</h2>
            <p className="text-gray-500">Exploring permutations...</p>
          </div>
        )}

        {step === 'results' && (
          <div className="max-w-5xl mx-auto">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Results ({results.length})</h2>
                <div className="space-x-4">
                    <button onClick={handleBackToGrid} className="text-blue-600 hover:underline">Adjust Grid</button>
                    <button onClick={handleRestart} className="text-gray-600 hover:underline">New Puzzle</button>
                </div>
             </div>

             {solverError && (
                 <div className="p-4 bg-red-100 text-red-700 rounded-md mb-6">
                     Error: {solverError}
                 </div>
             )}

             {results.length === 0 && !solverError && (
                 <div className="text-center p-10 bg-white rounded-lg shadow">
                     <p className="text-lg text-gray-600">No solutions found.</p>
                     <p className="text-sm text-gray-400 mt-2">Try checking your letter counts or black square positions.</p>
                 </div>
             )}

             <div className="grid gap-8">
                 {results.slice(0, 20).map((res, idx) => (
                     <div key={idx} className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
                         <div className="flex justify-between items-start mb-4">
                             <div>
                                 <h3 className="text-lg font-bold text-gray-800">Option #{idx + 1}</h3>
                                 <p className="text-sm text-gray-500">Score: {Math.round(res.score)}</p>
                             </div>
                             <div className="text-right">
                                 <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                                     {res.validWords.length} valid words
                                 </span>
                             </div>
                         </div>
                         
                         <div 
                            className="grid gap-1 bg-gray-800 p-1 w-fit mx-auto"
                            style={{ 
                                gridTemplateColumns: `repeat(${cols}, minmax(30px, 1fr))` 
                            }}
                         >
                            {res.grid.map((row, r) => (
                                row.map((char, c) => {
                                    const isBlock = blocks[r][c];
                                    return (
                                        <div 
                                            key={`${r}-${c}`}
                                            className={`
                                                aspect-square flex items-center justify-center text-lg font-bold select-none
                                                ${isBlock ? 'bg-black' : 'bg-white'}
                                            `}
                                        >
                                            {!isBlock ? char : ''}
                                        </div>
                                    );
                                })
                            ))}
                         </div>
                         
                         <div className="mt-4 pt-4 border-t border-gray-100">
                             <p className="text-sm text-gray-600 font-mono break-all">
                                 {res.validWords.join(' • ')}
                             </p>
                         </div>
                     </div>
                 ))}
                 {results.length > 20 && (
                     <div className="text-center text-gray-500 py-4">
                         ... and {results.length - 20} more solutions.
                     </div>
                 )}
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;