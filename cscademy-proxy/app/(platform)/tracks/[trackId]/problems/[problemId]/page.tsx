"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import OutputPanel from "@/components/OutputPanel";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-[#1e1e2e] flex items-center justify-center text-gray-500">
      Loading editor...
    </div>
  ),
});

export default function ProblemIDEPage() {
  const params = useParams();
  const router = useRouter();
  const trackId = params.trackId as string;
  const problemId = params.problemId as string;

  const problem = useQuery(api.trackProblems.getById, {
    id: problemId as Id<"trackProblems">,
  });
  const track = useQuery(api.tracks.getById, {
    id: trackId as Id<"tracks">,
  });

  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  // Initialize code with starter code
  useEffect(() => {
    if (problem?.starterCode && !code) {
      setCode(problem.starterCode);
    } else if (!code) {
      setCode(
        '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n'
      );
    }
  }, [problem, code]);

  // Initialize input with sample
  useEffect(() => {
    if (problem?.sampleInput && !input) {
      setInput(problem.sampleInput);
    }
  }, [problem, input]);

  const runCode = useCallback(async () => {
    if (!problem) return;
    setIsRunning(true);
    setOutput("");
    setIsError(false);
    setScore(null);

    try {
      const referer =
        problem.referer ||
        `https://csacademy.com/contest/archive/task/${problem.slug}/`;
      const res = await fetch("/api/csacademy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestTaskId: problem.contestTaskId,
          sourceCode: code,
          input,
          referer,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setOutput(data.error);
        setIsError(true);
      } else if (data.results) {
        const results = data.results;
        if (results.error) {
          setOutput(results.error);
          setIsError(true);
        } else {
          const stdout = results.stdout || "";
          const stderr = results.stderr || "";
          setOutput(stdout + (stderr ? "\n--- stderr ---\n" + stderr : ""));
          setIsError(!!stderr && !stdout);
        }
      }
    } catch (err: any) {
      setOutput(err.message);
      setIsError(true);
    } finally {
      setIsRunning(false);
    }
  }, [problem, code, input]);

  const submitCode = useCallback(async () => {
    if (!problem) return;
    setIsSubmitting(true);
    setOutput("");
    setIsError(false);
    setScore(null);

    try {
      const referer =
        problem.referer ||
        `https://csacademy.com/contest/archive/task/${problem.slug}/`;
      const res = await fetch("/api/csacademy/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestTaskId: problem.contestTaskId,
          sourceCode: code,
          referer,
          trackId,
          problemId,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setOutput(data.error);
        setIsError(true);
      } else if (data.results) {
        const results = data.results;
        const sc =
          results.score !== undefined && results.score !== null
            ? results.score
            : null;
        setScore(sc);

        // Build output
        const lines: string[] = [];
        if (sc !== null) lines.push(`Score: ${sc.toFixed(0)}/100`);
        if (results.tests && Array.isArray(results.tests)) {
          lines.push(`Tests: ${results.tests.length}`);
          results.tests.forEach((t: any, i: number) => {
            const verdict =
              t.checkerScore === 1
                ? "✓ PASS"
                : t.checkerScore === 0
                  ? "✗ FAIL"
                  : `~ ${(t.checkerScore * 100).toFixed(0)}%`;
            const time = t.time ? ` (${t.time}ms)` : "";
            const mem = t.maxMemory
              ? ` [${(t.maxMemory / 1024).toFixed(0)}KB]`
              : "";
            lines.push(`  Test ${i + 1}: ${verdict}${time}${mem}`);
          });
        }
        setOutput(lines.join("\n") || "Submitted successfully");
      }
    } catch (err: any) {
      setOutput(err.message);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [problem, code, trackId, problemId]);

  if (!problem || !track) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading problem...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#111127]">
        <div className="flex items-center gap-3">
          <Link
            href={`/tracks/${trackId}`}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← {track.name}
          </Link>
          <span className="text-gray-600">|</span>
          <span className="text-white font-medium">{problem.name}</span>
          <span className="text-gray-500 text-xs">{problem.points} pts</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runCode}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-colors"
          >
            {isRunning ? "Running..." : "Run ▶"}
          </button>
          <button
            onClick={submitCode}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit ✓"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Problem description */}
        <div className="w-80 border-r border-gray-800 overflow-auto p-4">
          <h2 className="text-lg font-semibold text-white mb-3">
            {problem.name}
          </h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-gray-300 whitespace-pre-wrap text-sm">
              {problem.description}
            </p>
          </div>

          {problem.sampleInput && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Sample Input
              </h4>
              <pre className="bg-[#1a1a2e] p-2 rounded text-xs text-gray-300 overflow-auto">
                {problem.sampleInput}
              </pre>
            </div>
          )}
          {problem.sampleOutput && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Sample Output
              </h4>
              <pre className="bg-[#1a1a2e] p-2 rounded text-xs text-gray-300 overflow-auto">
                {problem.sampleOutput}
              </pre>
            </div>
          )}
        </div>

        {/* Middle: Editor */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={code} onChange={setCode} />
          </div>

          {/* Input */}
          <div className="h-28 border-t border-gray-800">
            <div className="px-3 py-1 border-b border-gray-800">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Input
              </span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-[calc(100%-28px)] bg-[#1e1e2e] text-gray-200 font-mono text-sm p-2 resize-none focus:outline-none"
              placeholder="Custom input..."
            />
          </div>
        </div>

        {/* Right: Output */}
        <div className="w-72 border-l border-gray-800 flex flex-col">
          <OutputPanel
            output={output}
            isError={isError}
            isLoading={isRunning || isSubmitting}
            loadingText={
              isRunning ? "Running code..." : "Evaluating submission..."
            }
            score={score}
          />
        </div>
      </div>
    </div>
  );
}
