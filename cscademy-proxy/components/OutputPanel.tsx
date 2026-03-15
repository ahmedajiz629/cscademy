"use client";

interface TestResult {
  checkerScore?: number;
  time?: number;
  maxMemory?: number;
}

interface OutputPanelProps {
  output: string;
  isError: boolean;
  isLoading: boolean;
  loadingText?: string;
  score?: number | null;
  testResults?: TestResult[] | null;
}

export default function OutputPanel({
  output,
  isError,
  isLoading,
  loadingText = "Running...",
  score,
  testResults,
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
          <>
            {/* Summary text */}
            <pre
              className={`text-sm font-mono whitespace-pre-wrap leading-relaxed ${
                isError ? "text-red-400" : "text-gray-200"
              }`}
            >
              {output || "No output yet"}
            </pre>

            {/* Test case table */}
            {testResults && testResults.length > 0 && (
              <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800/80">
                      <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">#</th>
                      <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Verdict</th>
                      <th className="text-right px-2 py-1.5 text-gray-400 font-semibold">Time</th>
                      <th className="text-right px-2 py-1.5 text-gray-400 font-semibold">Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResults.map((t, i) => {
                      const passed = t.checkerScore === 1;
                      const partial =
                        t.checkerScore !== undefined &&
                        t.checkerScore > 0 &&
                        t.checkerScore < 1;
                      return (
                        <tr
                          key={i}
                          className="border-t border-gray-800/50 hover:bg-gray-800/30"
                        >
                          <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                          <td className="px-2 py-1">
                            {passed ? (
                              <span className="text-green-400">PASS</span>
                            ) : partial ? (
                              <span className="text-yellow-400">
                                {((t.checkerScore ?? 0) * 100).toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-red-400">FAIL</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-right text-gray-400">
                            {t.time !== undefined ? `${t.time}ms` : "—"}
                          </td>
                          <td className="px-2 py-1 text-right text-gray-400">
                            {t.maxMemory !== undefined
                              ? `${(t.maxMemory / 1024).toFixed(0)}KB`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
