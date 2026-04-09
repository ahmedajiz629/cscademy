"use client";

import { Fragment, type CSSProperties } from "react";

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

interface AnsiState {
  color: string;
  backgroundColor?: string;
  fontWeight?: CSSProperties["fontWeight"];
  fontStyle?: CSSProperties["fontStyle"];
  textDecorationLine?: CSSProperties["textDecorationLine"];
  opacity?: number;
}

interface StyledTextSegment {
  text: string;
  style: CSSProperties;
}

const ANSI_PATTERN = /\u001b\[([0-9;]*)m/g;
const DEFAULT_OUTPUT_COLOR = "#e5e7eb";
const DEFAULT_ERROR_COLOR = "#f87171";

const ANSI_FOREGROUND_COLORS: Record<number, string> = {
  30: "#111827",
  31: "#f87171",
  32: "#4ade80",
  33: "#facc15",
  34: "#60a5fa",
  35: "#f472b6",
  36: "#22d3ee",
  37: "#f3f4f6",
  90: "#9ca3af",
  91: "#fca5a5",
  92: "#86efac",
  93: "#fde047",
  94: "#93c5fd",
  95: "#f9a8d4",
  96: "#67e8f9",
  97: "#ffffff",
};

const ANSI_BACKGROUND_COLORS: Record<number, string> = {
  40: "#111827",
  41: "#7f1d1d",
  42: "#14532d",
  43: "#713f12",
  44: "#1e3a8a",
  45: "#831843",
  46: "#155e75",
  47: "#e5e7eb",
  100: "#374151",
  101: "#991b1b",
  102: "#166534",
  103: "#854d0e",
  104: "#1d4ed8",
  105: "#9d174d",
  106: "#0e7490",
  107: "#ffffff",
};

function getBaseAnsiState(isError: boolean): AnsiState {
  return {
    color: isError ? DEFAULT_ERROR_COLOR : DEFAULT_OUTPUT_COLOR,
    fontWeight: 400,
    opacity: 1,
  };
}

function xtermColorToCss(index: number): string {
  if (index < 16) {
    const baseMap = [
      "#111827",
      "#f87171",
      "#4ade80",
      "#facc15",
      "#60a5fa",
      "#f472b6",
      "#22d3ee",
      "#f3f4f6",
      "#9ca3af",
      "#fca5a5",
      "#86efac",
      "#fde047",
      "#93c5fd",
      "#f9a8d4",
      "#67e8f9",
      "#ffffff",
    ];

    return baseMap[index] || DEFAULT_OUTPUT_COLOR;
  }

  if (index >= 16 && index <= 231) {
    const normalized = index - 16;
    const blue = normalized % 6;
    const green = Math.floor(normalized / 6) % 6;
    const red = Math.floor(normalized / 36) % 6;
    const levels = [0, 95, 135, 175, 215, 255];

    return `rgb(${levels[red]}, ${levels[green]}, ${levels[blue]})`;
  }

  if (index >= 232 && index <= 255) {
    const value = 8 + (index - 232) * 10;
    return `rgb(${value}, ${value}, ${value})`;
  }

  return DEFAULT_OUTPUT_COLOR;
}

function applySgrCodes(state: AnsiState, codes: number[], isError: boolean) {
  const baseState = getBaseAnsiState(isError);

  for (let index = 0; index < codes.length; index += 1) {
    const code = Number.isFinite(codes[index]) ? codes[index] : 0;

    if (code === 0) {
      state.color = baseState.color;
      state.backgroundColor = undefined;
      state.fontWeight = baseState.fontWeight;
      state.fontStyle = undefined;
      state.textDecorationLine = undefined;
      state.opacity = baseState.opacity;
      continue;
    }

    if (code === 1) {
      state.fontWeight = 700;
      state.opacity = 1;
      continue;
    }

    if (code === 2) {
      state.opacity = 0.7;
      continue;
    }

    if (code === 3) {
      state.fontStyle = "italic";
      continue;
    }

    if (code === 4) {
      state.textDecorationLine = "underline";
      continue;
    }

    if (code === 22) {
      state.fontWeight = 400;
      state.opacity = 1;
      continue;
    }

    if (code === 23) {
      state.fontStyle = undefined;
      continue;
    }

    if (code === 24) {
      state.textDecorationLine = undefined;
      continue;
    }

    if (code === 39) {
      state.color = baseState.color;
      continue;
    }

    if (code === 49) {
      state.backgroundColor = undefined;
      continue;
    }

    if (code === 38 || code === 48) {
      const mode = codes[index + 1];

      if (mode === 5 && Number.isFinite(codes[index + 2])) {
        const nextColor = xtermColorToCss(codes[index + 2]);
        if (code === 38) {
          state.color = nextColor;
        } else {
          state.backgroundColor = nextColor;
        }
        index += 2;
        continue;
      }

      if (
        mode === 2 &&
        Number.isFinite(codes[index + 2]) &&
        Number.isFinite(codes[index + 3]) &&
        Number.isFinite(codes[index + 4])
      ) {
        const nextColor = `rgb(${codes[index + 2]}, ${codes[index + 3]}, ${codes[index + 4]})`;
        if (code === 38) {
          state.color = nextColor;
        } else {
          state.backgroundColor = nextColor;
        }
        index += 4;
      }

      continue;
    }

    if (code in ANSI_FOREGROUND_COLORS) {
      state.color = ANSI_FOREGROUND_COLORS[code];
      continue;
    }

    if (code in ANSI_BACKGROUND_COLORS) {
      state.backgroundColor = ANSI_BACKGROUND_COLORS[code];
    }
  }
}

function parseAnsiText(output: string, isError: boolean): StyledTextSegment[] {
  const baseState = getBaseAnsiState(isError);
  const state: AnsiState = { ...baseState };
  const segments: StyledTextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  ANSI_PATTERN.lastIndex = 0;

  while ((match = ANSI_PATTERN.exec(output)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: output.slice(lastIndex, match.index),
        style: {
          color: state.color,
          backgroundColor: state.backgroundColor,
          fontWeight: state.fontWeight,
          fontStyle: state.fontStyle,
          textDecorationLine: state.textDecorationLine,
          opacity: state.opacity,
        },
      });
    }

    const codes = match[1]
      ? match[1].split(";").map((value) => Number.parseInt(value, 10))
      : [0];

    applySgrCodes(state, codes, isError);
    lastIndex = ANSI_PATTERN.lastIndex;
  }

  if (lastIndex < output.length) {
    segments.push({
      text: output.slice(lastIndex),
      style: {
        color: state.color,
        backgroundColor: state.backgroundColor,
        fontWeight: state.fontWeight,
        fontStyle: state.fontStyle,
        textDecorationLine: state.textDecorationLine,
        opacity: state.opacity,
      },
    });
  }

  if (segments.length === 0) {
    segments.push({
      text: output,
      style: {
        color: baseState.color,
        fontWeight: baseState.fontWeight,
        opacity: baseState.opacity,
      },
    });
  }

  return segments;
}

export default function OutputPanel({
  output,
  isError,
  isLoading,
  loadingText = "Running...",
  score,
  testResults,
}: OutputPanelProps) {
  const renderedOutput = parseAnsiText(output || "No output yet", isError);

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
              className="text-sm font-mono whitespace-pre-wrap leading-relaxed"
            >
              {renderedOutput.map((segment, index) => (
                <Fragment key={`${index}-${segment.text.length}`}>
                  <span style={segment.style}>{segment.text}</span>
                </Fragment>
              ))}
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
