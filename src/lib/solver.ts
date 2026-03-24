export interface GridCell {
  row: number;
  col: number;
  isBlock: boolean;
  char: string | null;
}

export interface SolverResult {
  grid: string[][];
  score: number;
  validWords: string[];
}

export interface WordSlot {
  cells: {r: number, c: number}[];
  index: number;
}

export class DropQuoteSolver {
  private dictionary: Set<string>;
  private commonWords: Set<string>;
  private maxSolutions: number = 200; // Cap to prevent freezing

  constructor(dictionaryWords: string[], commonWords: Set<string> = new Set()) {
    this.dictionary = new Set();
    this.commonWords = commonWords;
    const singles = new Set(['A', 'I', 'O']);
    
    for (const w of dictionaryWords) {
        const up = w.toUpperCase();
        // Allow all words in dictionary for validity, but we will score them differently
        this.dictionary.add(up);
    }
    // Ensure singles are present
    singles.forEach(s => this.dictionary.add(s));
  }

  solve(
    rows: number,
    cols: number,
    columnLetters: string[][],
    blocks: boolean[][]
  ): SolverResult[] {
    const results: SolverResult[] = [];
    
    // 1. Prepare Column Counts (Available letters)
    // We need to track available letters per column
    const columnCounts: Map<string, number>[] = [];
    for (let c = 0; c < cols; c++) {
      const counts = new Map<string, number>();
      for (const char of columnLetters[c]) {
        if (!char || char.trim() === '') continue;
        const C = char.toUpperCase();
        counts.set(C, (counts.get(C) || 0) + 1);
      }
      columnCounts.push(counts);
    }

    // 2. Identify Word Slots (Wrapping Logic)
    const wordSlots: WordSlot[] = [];
    let currentCells: {r: number, c: number}[] = [];
    let slotIndexCounter = 0;
    
    // The grid is treated as a continuous stream of text wrapping from line to line
    // Iterate strictly by row then col
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (blocks[r][c]) {
          // Block ends current word
          if (currentCells.length > 0) {
            wordSlots.push({ cells: [...currentCells], index: slotIndexCounter++ });
            currentCells = [];
          }
        } else {
          // Letter continues current word
          currentCells.push({ r, c });
        }
      }
    }
    // Handle end of grid - close the last word if exists
    if (currentCells.length > 0) {
      wordSlots.push({ cells: [...currentCells], index: slotIndexCounter++ });
    }

    // 3. Map each cell (r,c) to its slot index for quick lookup
    const slotMap: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(-1));
    for (const slot of wordSlots) {
        for (const cell of slot.cells) {
            slotMap[cell.r][cell.c] = slot.index;
        }
    }

    // 4. Identify Cells to Fill (only non-block cells)
    const cellsToFill: {r: number, c: number}[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!blocks[r][c]) {
          cellsToFill.push({r, c});
        }
      }
    }

    // Grid state
    const grid: string[][] = Array(rows).fill(null).map(() => Array(cols).fill(""));

    // 5. Backtracking Function
    const backtrack = (index: number) => {
      if (results.length >= this.maxSolutions) return;

      if (index === cellsToFill.length) {
        // Solution complete
        const finalGrid = grid.map(row => [...row]);
        const scoreResult = this.evaluate(finalGrid, wordSlots);
        results.push({ grid: finalGrid, ...scoreResult });
        return;
      }

      const { r, c } = cellsToFill[index];
      const availableMap = columnCounts[c];
      
      // Get unique available characters to try for this column
      const charsToTry = Array.from(availableMap.keys()).filter(k => (availableMap.get(k) || 0) > 0);
      
      // Heuristic: Just lexical sort for stability.
      charsToTry.sort();

      for (const char of charsToTry) {
        // Place char
        grid[r][c] = char;
        availableMap.set(char, availableMap.get(char)! - 1);

        // Check constraints immediately (pruning)
        if (this.isValidPartial(r, c, grid, wordSlots, slotMap)) {
            backtrack(index + 1);
        }

        // Backtrack
        availableMap.set(char, availableMap.get(char)! + 1);
        grid[r][c] = "";
        
        if (results.length >= this.maxSolutions) return;
      }
    };

    try {
        backtrack(0);
    } catch (e) {
        console.error("Backtracking error", e);
    }

    // Sort results by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  // Checks if the placement at (r, c) violates any completed word constraints
  private isValidPartial(r: number, c: number, grid: string[][], wordSlots: WordSlot[], slotMap: number[][]): boolean {
      const slotIndex = slotMap[r][c];
      if (slotIndex === -1) return true; // Should not happen for letter cells

      const slot = wordSlots[slotIndex];
      const lastCell = slot.cells[slot.cells.length - 1];

      // Check if we just filled the LAST cell of this slot
      if (lastCell.r === r && lastCell.c === c) {
          // Verify full word
          let word = "";
          for (const cell of slot.cells) {
              word += grid[cell.r][cell.c];
          }
          
          if (!this.dictionary.has(word)) {
              return false; 
          }
      }
      
      return true;
  }

  private evaluate(grid: string[][], wordSlots: WordSlot[]): { score: number, validWords: string[] } {
      let score = 0;
      const validWords: string[] = [];

      for (const slot of wordSlots) {
          let word = "";
          for (const cell of slot.cells) {
              word += grid[cell.r][cell.c];
          }
          
          if (this.dictionary.has(word)) {
              validWords.push(word);

              // --- SCORING LOGIC ---

              // 1. SPECIFIC PENALTY FOR 'THY'
              // User requested to penalize this word specifically
              if (word === 'THY') {
                  score -= 5000;
                  continue; // Skip other scoring logic for this word
              }

              // 2. COMMON WORD BONUS
              if (this.commonWords.has(word)) {
                  // Massive bonus for common words (e.g. THE, IS, AND)
                  score += (word.length * 100);
              } 
              // 3. OBSCURITY PENALTY
              else {
                  // Not in common list
                  if (word.length <= 4) {
                      // Heavy Penalty for short obscure words (e.g. IC, WS, WT, II, AA)
                      // This filters out "technically valid" but nonsense solutions
                      score -= 1000;
                  } else {
                      // Small bonus for longer valid words that might be proper nouns or rare
                      score += word.length * 10;
                  }
              }
          } else {
              // Should not happen with current logic, but penalty if so
              score -= 10000;
          }
      }

      return { score, validWords };
  }
}
