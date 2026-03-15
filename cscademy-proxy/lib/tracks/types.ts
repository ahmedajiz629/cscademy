/** Language supported by a track */
export interface Language {
  id: string;           // CSAcademy programmingLanguageId (e.g. "1")
  name: string;         // display name (e.g. "C++ 17")
  codemirrorLang: string; // which codemirror extension to use: "cpp"|"c"|"java"|"python"|"javascript"
}

/** A single problem within a track */
export interface TrackProblem {
  id: string;            // stable slug, e.g. "sequence-decomposition"
  name: string;
  description: string;
  points: number;
  order: number;
  sampleInput?: string;
  sampleOutput?: string;
  /** starter code per language id */
  starterCode: Record<string, string>;
  // CSAcademy-specific fields (other track types will have their own)
  contestTaskId?: number;
  referer?: string;
}

/**
 * A track module. Each track is a code unit — not a DB entry.
 * Different tracks can have entirely different backend logic
 * (CSAcademy proxy, CTF engine, git challenges, etc.)
 */
export interface TrackModule {
  id: string;            // stable slug, e.g. "algorithmics"
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  order: number;
  problems: TrackProblem[];
  languages: Language[];
  /** API endpoints for running / submitting code */
  runEndpoint: string;
  submitEndpoint: string;
}
