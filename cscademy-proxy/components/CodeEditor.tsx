"use client";

import { useCallback, useRef, useEffect, useState } from "react";

// Lazy-load CodeMirror (it's a large library)
let CodeMirrorComponent: any = null;
let cppLang: any = null;
let oneDarkTheme: any = null;

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
}

export default function CodeEditor({
  value,
  onChange,
  language = "cpp",
}: CodeEditorProps) {
  const [loaded, setLoaded] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([]);

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/lang-cpp"),
      import("@codemirror/theme-one-dark"),
    ]).then(([cm, cpp, theme]) => {
      CodeMirrorComponent = cm.default;
      cppLang = cpp.cpp;
      oneDarkTheme = theme.oneDark;
      setExtensions([cppLang()]);
      setLoaded(true);
    });
  }, []);

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange]
  );

  if (!loaded || !CodeMirrorComponent) {
    return (
      <div className="w-full h-full bg-[#282c34] rounded-lg p-4 font-mono text-sm text-gray-400">
        <pre className="whitespace-pre-wrap">{value}</pre>
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
      className="h-full overflow-auto rounded-lg text-sm"
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
