"use client";

interface OutputPanelProps {
  output: string;
  isError: boolean;
  isLoading: boolean;
  loadingText?: string;
  score?: number | null;
}

export default function OutputPanel({
  output,
  isError,
  isLoading,
  loadingText = "Running...",
  score,
}: OutputPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Output
        </span>
        {score !== null && score !== undefined && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              score === 100
                ? "bg-green-900/50 text-green-400"
                : "bg-yellow-900/50 text-yellow-400"
            }`}
          >
            Score: {score.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center space-x-2 text-gray-400">
            <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent" />
            <span className="text-sm">{loadingText}</span>
          </div>
        ) : (
          <pre
            className={`text-sm font-mono whitespace-pre-wrap leading-relaxed ${
              isError ? "text-red-400" : "text-gray-200"
            }`}
          >
            {output || "No output yet"}
          </pre>
        )}
      </div>
    </div>
  );
}
