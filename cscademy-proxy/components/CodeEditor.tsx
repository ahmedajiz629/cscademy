"use client";

import { useCallback, useState, useEffect } from "react";

let CodeMirrorComponent: any = null;
let oneDarkTheme: any = null;

// Language extension loaders
const langLoaders: Record<string, () => Promise<any>> = {
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  python: () => import("@codemirror/lang-python").then((m) => m.python()),
  javascript: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
};

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string; // "cpp" | "java" | "python" | "javascript"
}

export default function CodeEditor({
  value,
  onChange,
  language = "cpp",
}: CodeEditorProps) {
  const [loaded, setLoaded] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([]);

  // Load CodeMirror core + theme once
  useEffect(() => {
    if (CodeMirrorComponent) {
      setLoaded(true);
      return;
    }
    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/theme-one-dark"),
    ]).then(([cm, theme]) => {
      CodeMirrorComponent = cm.default;
      oneDarkTheme = theme.oneDark;
      setLoaded(true);
    });
  }, []);

  // Load language extension when language prop changes
  useEffect(() => {
    if (!loaded) return;
    const loader = langLoaders[language] || langLoaders.cpp;
    loader().then((ext) => setExtensions([ext]));
  }, [loaded, language]);

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange]
  );

  if (!loaded || !CodeMirrorComponent) {
    return (
      <div className="h-full w-full min-w-0 max-w-full overflow-auto rounded-lg bg-[#282c34] p-4 font-mono text-sm text-gray-400">
        <pre className="break-all whitespace-pre-wrap">{value}</pre>
      </div>
    );
  }

  return (
    <CodeMirrorComponent
      value={value}
      height="100%"
      theme={oneDarkTheme}
      extensions={extensions}
      onChange={handleChange}
      className="h-full min-w-0 max-w-full overflow-auto rounded-lg text-sm"
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: true,
        closeBrackets: true,
        indentOnInput: true,
        foldGutter: true,
      }}
    />
  );
}
