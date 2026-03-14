"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import ProblemPanel from "@/components/ProblemPanel";
import OutputPanel from "@/components/OutputPanel";

// Dynamic import for CodeEditor (heavy component)
const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#282c34] rounded-lg p-4 font-mono text-sm text-gray-500">
      Loading editor...
    </div>
  ),
});

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

// Default problems (used when Convex is not configured)
const DEFAULT_PROBLEMS: Problem[] = [
  {
    slug: "addition",
    name: "Addition",
    contestTaskId: 38,
    description:
      "Given two integers a and b, output their sum.\n\nInput: Two integers a and b on a single line.\nOutput: Their sum.",
    referer: "https://csacademy.com/contest/archive/task/addition/",
    starterCode: `#include <iostream>

using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b;
    return 0;
}`,
    sampleInput: "1 2",
    sampleOutput: "3",
  },
  {
    slug: "one_letter",
    name: "One Letter",
    contestTaskId: 680,
    description: `You are given a list of N words. From each word you should keep only one letter and discard all the others. Then you should permute the N chosen letters and build a single word by concatenating them. Find the lexicographically smallest word you can obtain.

Input: The first line contains a single integer value N. Each of the following N lines contains a single string, representing one of the words.

Output: The output should contain one string of length N.

Constraints:
- 1 ≤ N ≤ 10^5
- The sum of lengths of the strings is ≤ 10^5
- The strings will contain only lower case letters of the English alphabet.`,
    referer:
      "https://csacademy.com/contest/interview-archive/task/one_letter/",
    starterCode: `#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int main() {
    int n;
    cin >> n;
    
    vector<string> words(n);
    for (int i = 0; i < n; i++) {
        cin >> words[i];
    }
    
    // Your solution here
    
    return 0;
}`,
    sampleInput: `3
cross
stop
arm`,
    sampleOutput: "aco",
  },
];

export default function Home() {
  const [problems, setProblems] = useState<Problem[]>(DEFAULT_PROBLEMS);
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [loginStatus, setLoginStatus] = useState<
    "idle" | "logging-in" | "logged-in" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");

  // Load problems from Convex if available, otherwise use defaults
  useEffect(() => {
    // Try to load from Convex via API
    // For now, use default problems
    if (problems.length > 0 && !selectedProblem) {
      selectProblem(problems[0]);
    }
  }, [problems]);

  // Auto-login on mount
  useEffect(() => {
    checkLoginStatus();
  }, []);

  async function checkLoginStatus() {
    try {
      const res = await fetch("/api/csacademy/login");
      const data = await res.json();
      if (data.loggedIn) {
        setLoginStatus("logged-in");
        const ws = data.wsConnected ? "WS: connected" : "WS: disconnected";
        setStatusMessage(
          `User: ${data.session?.userId || "?"} | Workspace: ${data.session?.workspaceId || "?"} | Session: ${data.session?.sessionId || "?"} | ${ws}`
        );
      } else {
        setStatusMessage("Not connected");
      }
    } catch {
      setStatusMessage("Server unreachable");
    }
  }

  async function handleLogin() {
    setLoginStatus("logging-in");
    setStatusMessage("Connecting to CSAcademy...");
    try {
      const res = await fetch("/api/csacademy/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // Uses env vars on server
      });
      const data = await res.json();
      if (data.success) {
        setLoginStatus("logged-in");
        const ws = data.wsConnected ? "WS: connected" : "WS: connecting...";
        setStatusMessage(
          `User: ${data.userId || "?"} | Workspace: ${data.workspaceId || "?"} | Session: ${data.sessionId || "?"} | ${ws}`
        );
      } else {
        setLoginStatus("error");
        setStatusMessage(`Error: ${data.error || "Login failed"}`);
      }
    } catch (err: any) {
      setLoginStatus("error");
      setStatusMessage(err.message || "Connection error");
    }
  }

  function selectProblem(problem: Problem) {
    setSelectedProblem(problem);
    setCode(problem.starterCode);
    setInput(problem.sampleInput);
    setOutput("");
    setIsError(false);
    setScore(null);
  }

  const handleRun = useCallback(async () => {
    if (!selectedProblem || isRunning) return;

    setIsRunning(true);
    setOutput("");
    setIsError(false);
    setScore(null);

    try {
      const res = await fetch("/api/csacademy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestTaskId: selectedProblem.contestTaskId,
          sourceCode: code,
          input,
          referer: selectedProblem.referer,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setOutput(`Compilation Error:\n${data.error}`);
        setIsError(true);
      } else if (data.results) {
        const r = data.results;
        let outputText = r.stdout || "";
        if (r.stderr) {
          outputText += (outputText ? "\n" : "") + r.stderr;
        }
        if (!outputText) outputText = "No output";

        const exitCode = r.results?.exitCode ?? 0;
        setOutput(outputText);
        setIsError(exitCode !== 0);
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      setOutput(`Error: ${err.message}`);
      setIsError(true);
    } finally {
      setIsRunning(false);
    }
  }, [selectedProblem, code, input, isRunning]);

  const handleSubmit = useCallback(async () => {
    if (!selectedProblem || isSubmitting) return;

    setIsSubmitting(true);
    setOutput("");
    setIsError(false);
    setScore(null);

    try {
      const res = await fetch("/api/csacademy/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestTaskId: selectedProblem.contestTaskId,
          sourceCode: code,
          referer: selectedProblem.referer,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setOutput(`Error: ${data.error}`);
        setIsError(true);
      } else if (data.results) {
        const r = data.results;
        const s =
          r.score !== undefined && r.score !== null ? r.score : null;
        setScore(s);

        // Format test results
        let outputText = `Score: ${s !== null ? s.toFixed(0) + "%" : "N/A"}\n`;

        if (r.tests && r.tests.length > 0) {
          outputText += `\nTests: ${r.tests.length}\n`;
          r.tests.forEach((t: any, i: number) => {
            const status = t.checkerScore === 1 ? "PASS" : "FAIL";
            outputText += `  Test ${i + 1}: ${status}`;
            if (t.time !== undefined) outputText += ` (${t.time}ms)`;
            if (t.memory !== undefined)
              outputText += ` [${(t.memory / 1024).toFixed(0)} KB]`;
            outputText += "\n";
          });
        }

        setOutput(outputText);
        setIsError(s !== null && s < 100);
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      setOutput(`Error: ${err.message}`);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedProblem, code, isSubmitting]);

  // Keyboard shortcut: Ctrl+Enter to run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          handleSubmit();
        } else {
          handleRun();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun, handleSubmit]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-white">
            <span className="text-indigo-400">CS</span> Academy Proxy
          </h1>
          <div className="flex items-center space-x-2">
            <div
              className={`h-2 w-2 rounded-full ${
                loginStatus === "logged-in"
                  ? "bg-green-500"
                  : loginStatus === "logging-in"
                    ? "bg-yellow-500 animate-pulse"
                    : loginStatus === "error"
                      ? "bg-red-500"
                      : "bg-gray-500"
              }`}
            />
            <span className="text-xs text-gray-400">
              {statusMessage || "Not connected"}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {loginStatus !== "logged-in" && (
            <button
              onClick={handleLogin}
              disabled={loginStatus === "logging-in"}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-gray-700 text-white
                         hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loginStatus === "logging-in" ? "Connecting..." : "Connect"}
            </button>
          )}

          <button
            onClick={handleRun}
            disabled={isRunning || isSubmitting || !selectedProblem}
            className="px-5 py-1.5 text-sm font-semibold rounded-md
                       bg-gradient-to-r from-indigo-600 to-purple-600 text-white
                       hover:from-indigo-500 hover:to-purple-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all shadow-lg shadow-indigo-500/20"
          >
            {isRunning ? "Running..." : "Run (Ctrl+Enter)"}
          </button>

          <button
            onClick={handleSubmit}
            disabled={isRunning || isSubmitting || !selectedProblem}
            className="px-5 py-1.5 text-sm font-semibold rounded-md
                       bg-gradient-to-r from-emerald-600 to-teal-600 text-white
                       hover:from-emerald-500 hover:to-teal-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all shadow-lg shadow-emerald-500/20"
          >
            {isSubmitting ? "Submitting..." : "Submit (Ctrl+Shift+Enter)"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Problem description */}
        <div className="w-80 border-r border-gray-700 bg-gray-900 flex flex-col shrink-0 overflow-hidden">
          <ProblemPanel
            problems={problems}
            selectedProblem={selectedProblem}
            onSelectProblem={selectProblem}
          />
        </div>

        {/* Center: Code editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-900/50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Source Code (C++)
            </span>
            <span className="text-xs text-gray-500">
              {code.split("\n").length} lines
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={code} onChange={setCode} />
          </div>
        </div>

        {/* Right panel: Input/Output */}
        <div className="w-96 border-l border-gray-700 bg-gray-900 flex flex-col shrink-0 overflow-hidden">
          {/* Input */}
          <div className="h-2/5 border-b border-gray-700 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-700">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Input
              </span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter custom input here..."
              className="flex-1 w-full bg-transparent text-gray-200 font-mono text-sm p-3
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
            />
          </div>

          {/* Output */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <OutputPanel
              output={output}
              isError={isError}
              isLoading={isRunning || isSubmitting}
              loadingText={isRunning ? "Running code..." : "Evaluating submission..."}
              score={score}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
