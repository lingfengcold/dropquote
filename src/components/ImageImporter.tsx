import React, { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Loader2, Upload, Check, X } from 'lucide-react';

interface ImageImporterProps {
  numColumns: number;
  onImport: (columns: string[][]) => void;
  onClose: () => void;
}

export function ImageImporter({ numColumns, onImport, onClose }: ImageImporterProps) {
  const [image, setImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async () => {
    if (!image) return;

    setProcessing(true);
    setError(null);

    try {
      // 1. Recognize Text
      const result = await Tesseract.recognize(
        image,
        'eng',
        { 
          logger: m => console.log(m) 
        }
      );
      
      const text = result.data.text;
      setPreviewText(text);

      // 2. Parse Logic
      // Assumption: Input is the letter grid.
      // Tesseract reads Row by Row.
      // A B C
      // D E F
      //
      // We need to split by lines, then by whitespace to get a grid.
      // Then Transpose.
      
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      
      // Attempt to tokenize lines into characters/blocks
      // Filter out non-alpha characters just in case, but keep structure?
      // Actually, simple split by space usually works for spaced letters.
      
      const rows: string[][] = lines.map(line => {
          // Remove all non-alpha chars except spaces to preserve separation? 
          // Or just take all alpha chars.
          // Let's match all single letters.
          const matches = line.match(/[A-Za-z]/g);
          return matches || [];
      });

      // Find max width to pad
      const maxWidth = Math.max(...rows.map(r => r.length), 0);
      
      // If detected width matches numColumns, great.
      // If not, we might have issues. 
      
      if (maxWidth === 0) {
          throw new Error("No letters detected.");
      }

      // Transpose
      const newColumns: string[][] = Array.from({ length: numColumns }, () => []);

      // We only take up to numColumns from each row
      rows.forEach(row => {
          row.forEach((char, colIndex) => {
              if (colIndex < numColumns) {
                  newColumns[colIndex].push(char.toUpperCase());
              }
          });
      });

      onImport(newColumns);
      
    } catch (err) {
      console.error(err);
      setError("Failed to process image. Please try a clearer image or manual entry.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Import from Image</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800">
            <strong>Instructions:</strong>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>Upload an image containing <strong>only the letter grid</strong> (the top part of the drop quote).</li>
              <li>Ensure the image is clear and upright.</li>
              <li>The tool will try to detect letters row-by-row and place them into columns.</li>
              <li>You can review and edit the results afterwards.</li>
            </ul>
          </div>

          {!image ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Upload size={48} className="text-gray-400 mb-2" />
              <span className="text-gray-600">Click to upload image</span>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageUpload}
              />
            </div>
          ) : (
            <div className="space-y-4">
               <div className="relative border rounded-lg overflow-hidden max-h-64 bg-gray-100 flex justify-center">
                  <img src={image} alt="Preview" className="object-contain h-full" />
                  <button 
                    onClick={() => setImage(null)}
                    className="absolute top-2 right-2 bg-white/80 p-1 rounded-full shadow hover:bg-white"
                  >
                    <X size={16} />
                  </button>
               </div>
               
               {processing ? (
                 <div className="flex flex-col items-center justify-center py-8">
                   <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                   <span className="text-gray-600">Reading text... This may take a moment.</span>
                 </div>
               ) : (
                 <div className="flex justify-end gap-2">
                    <button 
                      onClick={processImage}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Check size={18} />
                      Process & Fill
                    </button>
                 </div>
               )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          
          {previewText && !processing && (
             <div className="mt-4">
                 <h3 className="text-sm font-semibold mb-1">Detected Text (Raw):</h3>
                 <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32 whitespace-pre-wrap">
                     {previewText}
                 </pre>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
