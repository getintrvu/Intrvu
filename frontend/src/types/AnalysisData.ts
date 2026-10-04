/** Response of POST /api/v1/analyze (see Backend/app/schemas.py and app/scoring.py). */

export interface OverallScore {
  total_points: number;
  percentage: number;
  label: string;
  symbol: string;
}

export interface ScoreBlock {
  pointsAwarded: number;
  maxPoints: number;
  rating: string;
  ratingSymbol: string;
}

interface Component<S, A> {
  score: ScoreBlock & S;
  analysis: A & { suggestedImprovements: string };
}

// Items are produced by the backend scoring module; the UI only reads the fields it displays.
export type Item = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type KeywordMatch = Component<{ matchPercentage: number }, {
  strongMatches: Item[]; partialMatches: Item[]; missingKeywords: Item[]; keywordStuffing: Item[];
}>;

export type JobExperience = Component<
  { alignmentPercentage: number; rawScore: number; expectedMax: number; numberOfRelevantRoles: number },
  { strongMatches: Item[]; partialMatches: Item[]; misalignedRoles: Item[] }
>;

export type EducationCertifications = Component<{ passed: boolean }, {
  status: string; degreeFound: string; degreeType: string; fieldOfStudy: string;
  educationMatch: Item[]; certificationMatches: Item[]; missingCredentials: Item[];
}>;

export type SkillsTools = Component<{ matchPercentage: number }, {
  hardSkillMatches: Item[]; softSkillMatches: Item[]; missingSkills: Item[]; doubleCountReductions: Item[];
}>;

export type ResumeStructure = Component<
  { completedMustHave: number; totalMustHave: number; completedNiceToHave: number; totalNiceToHave: number; bonusPoints: number },
  { sectionStatus: Item[]; missingRequiredSections: string[] }
>;

export type ActionWords = Component<{ actionVerbPercentage: number }, {
  strongActionVerbs: Item[]; weakActionVerbs: Item[]; clichesAndBuzzwords: Item[];
}>;

export type MeasurableResults = Component<{ measurableResultsCount: number }, {
  measurableResults: Item[]; opportunitiesForMetrics: Item[];
}>;

export type BulletEffectiveness = Component<{ effectiveBulletPercentage: number }, {
  effectiveBullets: Item[]; ineffectiveBullets: Item[];
}>;

export interface AnalysisData {
  version: string;
  job_context: { title: string; company: string; description_length: number };
  job_fit_score: OverallScore;
  resume_quality_score: OverallScore;
  detailed_analysis: {
    keyword_match: KeywordMatch;
    job_experience: JobExperience;
    education_certifications: EducationCertifications;
    skills_tools: SkillsTools;
    resume_structure: ResumeStructure;
    action_words: ActionWords;
    measurable_results: MeasurableResults;
    bullet_point_effectiveness: BulletEffectiveness;
  };
  process_time_seconds: number;
}
