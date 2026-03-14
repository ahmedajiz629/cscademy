"use client";

interface Problem {
  _id?: string;
  slug: string;
  name: string;
  description: string;
  sampleInput: string;
  sampleOutput: string;
  contestTaskId: number;
  referer: string;
  starterCode: string;
}

interface ProblemPanelProps {
  problems: Problem[];
  selectedProblem: Problem | null;
  onSelectProblem: (problem: Problem) => void;
}

export default function ProblemPanel({
  problems,
  selectedProblem,
  onSelectProblem,
}: ProblemPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Problem selector */}
      <div className="p-3 border-b border-gray-700">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Problem
        </label>
        <select
          value={selectedProblem?.slug || ""}
          onChange={(e) => {
            const p = problems.find((p) => p.slug === e.target.value);
            if (p) onSelectProblem(p);
          }}
          className="w-full bg-gray-800 text-white border border-gray-600 rounded-md px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     cursor-pointer transition-all"
        >
          <option value="">-- Select a Problem --</option>
          {problems.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Problem description */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedProblem ? (
          <>
            <h2 className="text-lg font-bold text-white mb-3">
              {selectedProblem.name}
            </h2>
            <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mb-4">
              {selectedProblem.description}
            </div>

            {/* Sample I/O */}
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Sample Input
                </h3>
                <pre className="bg-gray-800 rounded-md p-3 text-sm text-green-400 font-mono overflow-x-auto">
                  {selectedProblem.sampleInput}
                </pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Sample Output
                </h3>
                <pre className="bg-gray-800 rounded-md p-3 text-sm text-green-400 font-mono overflow-x-auto">
                  {selectedProblem.sampleOutput}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Select a problem to see its description
          </div>
        )}
      </div>
    </div>
  );
}
