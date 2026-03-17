/**
 * A track module. Each track is a code unit — not a DB entry.
 * Different tracks can have entirely different backend logic
 * (CSAcademy proxy, CTF engine, git challenges, etc.)
 *
 * Track content (problems, languages) lives in the database
 * and is populated by the seeder.
 */
export interface TrackModule {
  id: string;            // stable slug, e.g. "algorithmics"
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  order: number;
  /** API endpoints for running / submitting code */
  runEndpoint: string;
  submitEndpoint: string;
}
