/**
 * The roadmap node tree.
 *
 * The roadmap page has two faces. The classic one is a journey of five stages
 * shown as cards; the other is a node tree in the shape of roadmap.sh, where
 * every stage is a spine node and the knowledge underneath it branches left and
 * right.
 *
 * The spine is the journey itself, so the tree is built from
 * `shared/roadmapJourney.ts` instead of from a second list that could drift.
 * The topics hanging off each stage are the Data/BI curriculum for the role the
 * platform targets: SQL, data visualisation, spreadsheets, Python, statistics
 * and business communication, with the warehouse and the experimentation topics
 * marked as the alternative path.
 *
 * Everything here is pure. The same input always produces the same tree, so a
 * node state can be reasoned about and tested without a browser.
 */

import type { RoadmapJourneyStage, RoadmapJourneyStageId } from './roadmapJourney.ts';

/** The states a node can be in, following the roadmap.sh vocabulary. */
export type RoadmapNodeState = 'done' | 'inProgress' | 'recommended' | 'optional';

/** How a branch is drawn: a solid line for required work, a dashed one for an alternative path. */
export type RoadmapBranchStyle = 'solid' | 'dashed';

/** Which side of the spine a node branches to, in reading order. */
export type RoadmapNodeSide = 'start' | 'end';

/** A learning resource attached to a node. */
export interface RoadmapTreeResource {
  title: string;
  url: string;
  kind: 'free' | 'paid';
}

/** What the candidate does to prove a topic is learned, and where they do it. */
export interface RoadmapPractice {
  /** The practice itself, written so the candidate can act on it today. */
  target: string;
  /** The view of the application where the practice happens. */
  view: string;
}

/** The curriculum definition of a topic, before the candidate's own data is applied. */
export interface RoadmapTopicSeed {
  id: string;
  title: string;
  description: string;
  /** True when the target role expects this topic; false for an alternative path. */
  required: boolean;
  /** The platform skill this topic tracks, when there is one. */
  skillName: string | null;
  /** The level the role expects on this topic, from 1 to 5. */
  targetLevel: number;
  practice: RoadmapPractice;
  resources: RoadmapTreeResource[];
}

/** A topic in the tree, with the candidate's own progress applied to it. */
export interface RoadmapTreeNode extends RoadmapTopicSeed {
  stageId: RoadmapJourneyStageId;
  side: RoadmapNodeSide;
  /** The level the candidate has reached, from 0 to 5. */
  currentLevel: number;
  state: RoadmapNodeState;
}

/** A spine node: one journey stage and the topics that branch off it. */
export interface RoadmapTreeStage {
  id: RoadmapJourneyStageId;
  order: number;
  title: string;
  objective: string;
  /** What the stage is made of, built from the journey's own actions. */
  description: string;
  /** How the stage is recognised as finished. */
  criteria: string[];
  /** The share of the stage the plan has finished, as a percentage. */
  progress: number;
  /** The stage's current progress represented on the same 0-5 scale as topics. */
  currentLevel: number;
  /** A finished stage is level 5. */
  targetLevel: number;
  /** Learning links aggregated from this stage's topics. */
  resources: RoadmapTreeResource[];
  /** A stage-specific action and destination for practice. */
  practice: RoadmapPractice;
  state: RoadmapNodeState;
  children: RoadmapTreeNode[];
}

/** The whole tree. */
export interface RoadmapTree {
  stages: RoadmapTreeStage[];
}

/** The changes the candidate made inside the tree itself. */
export interface RoadmapNodeOverrides {
  [nodeId: string]: { done?: boolean; level?: number } | undefined;
}

/** What the product knows about the candidate's progress. */
export interface RoadmapTreeProgress {
  /** The level of every skill the candidate has rated, keyed by skill name. */
  skillLevels: Record<string, { currentLevel: number; targetLevel: number }>;
  /** How far the plan has got in every journey stage, keyed by stage id. */
  stageProgress: Record<string, { pct: number; complete: boolean }>;
  /** The stage the candidate is standing in, when there is one. */
  currentStageId: RoadmapJourneyStageId | null;
}

/* -------------------------------------------------------------------------- */
/* The curriculum                                                              */
/* -------------------------------------------------------------------------- */

const SQL_BOLT: RoadmapTreeResource = {
  title: 'SQLBolt — interactive SQL lessons',
  url: 'https://sqlbolt.com/',
  kind: 'free',
};

const MODE_SQL: RoadmapTreeResource = {
  title: 'Mode SQL Tutorial — real business questions',
  url: 'https://mode.com/sql-tutorial/',
  kind: 'free',
};

const PG_SQL_TUTORIAL: RoadmapTreeResource = {
  title: 'PostgreSQL Tutorial — querying data',
  url: 'https://www.postgresql.org/docs/current/tutorial-sql.html',
  kind: 'free',
};

const PG_JOIN_TUTORIAL: RoadmapTreeResource = {
  title: 'PostgreSQL Tutorial — joins between tables',
  url: 'https://www.postgresql.org/docs/current/tutorial-join.html',
  kind: 'free',
};

const PG_WINDOW_FUNCTIONS: RoadmapTreeResource = {
  title: 'PostgreSQL Docs — window functions',
  url: 'https://www.postgresql.org/docs/current/functions-window.html',
  kind: 'free',
};

const PG_CTES: RoadmapTreeResource = {
  title: 'PostgreSQL Docs — common table expressions',
  url: 'https://www.postgresql.org/docs/current/queries-with.html',
  kind: 'free',
};

const PG_QUERIES: RoadmapTreeResource = {
  title: 'PostgreSQL Docs — the query chapter',
  url: 'https://www.postgresql.org/docs/current/queries.html',
  kind: 'free',
};

const PG_EXPLAIN: RoadmapTreeResource = {
  title: 'PostgreSQL Docs — using EXPLAIN',
  url: 'https://www.postgresql.org/docs/current/using-explain.html',
  kind: 'free',
};

const PG_PERFORMANCE: RoadmapTreeResource = {
  title: 'PostgreSQL Docs — performance tips',
  url: 'https://www.postgresql.org/docs/current/performance-tips.html',
  kind: 'free',
};

const PG_HOME: RoadmapTreeResource = {
  title: 'PostgreSQL Documentation',
  url: 'https://www.postgresql.org/docs/current/index.html',
  kind: 'free',
};

const SUPABASE_DB: RoadmapTreeResource = {
  title: 'Supabase Docs — the Postgres database',
  url: 'https://supabase.com/docs/guides/database/overview',
  kind: 'free',
};

const MS_ANALYTICS: RoadmapTreeResource = {
  title: 'Microsoft Learn — get started with data analytics',
  url: 'https://learn.microsoft.com/en-us/training/paths/data-analytics-microsoft/',
  kind: 'free',
};

const KAGGLE_SQL: RoadmapTreeResource = {
  title: 'Kaggle Learn — Intro to SQL',
  url: 'https://www.kaggle.com/learn/intro-to-sql',
  kind: 'free',
};

const KAGGLE_PANDAS: RoadmapTreeResource = {
  title: 'Kaggle Learn — Pandas',
  url: 'https://www.kaggle.com/learn/pandas',
  kind: 'free',
};

const FCC_DATAVIZ: RoadmapTreeResource = {
  title: 'freeCodeCamp — data visualisation with D3',
  url: 'https://www.freecodecamp.org/learn/data-visualization/',
  kind: 'free',
};

const FCC_PYTHON_DATA: RoadmapTreeResource = {
  title: 'freeCodeCamp — data analysis with Python',
  url: 'https://www.freecodecamp.org/learn/data-analysis-with-python/',
  kind: 'free',
};

const FCC_RELATIONAL: RoadmapTreeResource = {
  title: 'freeCodeCamp — relational database',
  url: 'https://www.freecodecamp.org/learn/relational-database/',
  kind: 'free',
};

const PYTHON_TUTORIAL: RoadmapTreeResource = {
  title: 'Python Tutorial — the official documentation',
  url: 'https://docs.python.org/3/tutorial/',
  kind: 'free',
};

const PANDAS_DOCS: RoadmapTreeResource = {
  title: 'pandas User Guide',
  url: 'https://pandas.pydata.org/docs/',
  kind: 'free',
};

const EXCEL_SUPPORT: RoadmapTreeResource = {
  title: 'Microsoft Excel — official support and learning',
  url: 'https://support.microsoft.com/en-us/excel',
  kind: 'free',
};

const NIST_HANDBOOK: RoadmapTreeResource = {
  title: 'NIST/SEMATECH e-Handbook of Statistical Methods',
  url: 'https://www.itl.nist.gov/div898/handbook/',
  kind: 'free',
};

const KHAN_STATISTICS: RoadmapTreeResource = {
  title: 'Khan Academy — statistics and probability',
  url: 'https://www.khanacademy.org/math/statistics-probability',
  kind: 'free',
};

const COURSERA_LINEAR_REGRESSION: RoadmapTreeResource = {
  title: 'Coursera — Linear Regression (audit free)',
  url: 'https://www.coursera.org/learn/linear-regression',
  kind: 'paid',
};

const GOOGLE_DATA_ANALYTICS: RoadmapTreeResource = {
  title: 'Coursera — Google Data Analytics Professional Certificate',
  url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
  kind: 'paid',
};

const TABLEAU_TRAINING: RoadmapTreeResource = {
  title: 'Tableau — free training and learning',
  url: 'https://www.tableau.com/learn/training',
  kind: 'free',
};

const GITHUB_START: RoadmapTreeResource = {
  title: 'GitHub Docs — get started',
  url: 'https://docs.github.com/en/get-started',
  kind: 'free',
};

const DBT_INTRO: RoadmapTreeResource = {
  title: 'dbt Docs — introduction',
  url: 'https://docs.getdbt.com/docs/introduction',
  kind: 'free',
};

/**
 * The topics of every stage.
 *
 * The stage ids are the journey's own ids, so a stage can never appear in the
 * tree without its journey behind it.
 */
export const ROADMAP_TOPIC_CATALOGUE: Readonly<Record<RoadmapJourneyStageId, readonly RoadmapTopicSeed[]>> = {
  foundation: [
    {
      id: 'sql-basics',
      title: 'SQL basics: SELECT, WHERE, ORDER BY',
      description:
        'Every analysis starts by pulling rows out of a table, and this is the smallest useful set of commands for doing it. Filtering with WHERE, sorting with ORDER BY and limiting the result are the verbs behind every interview question and every dashboard you will build.',
      required: true,
      skillName: 'SQL',
      targetLevel: 3,
      practice: {
        target: 'Finish ten SQLBolt exercises in order and write one sentence for each explaining what the query returns.',
        view: 'learning',
      },
      resources: [SQL_BOLT, MODE_SQL, PG_SQL_TUTORIAL],
    },
    {
      id: 'spreadsheet-modelling',
      title: 'Spreadsheet modelling for analysts',
      description:
        'Spreadsheets are still where a metric definition is born and where a quick sanity check happens before a query is ever written. Clean tables, consistent formats and formulas that survive a copied row are what separate a usable model from a fragile one.',
      required: true,
      skillName: 'Excel / Spreadsheets Modeling',
      targetLevel: 3,
      practice: {
        target: 'Rebuild a messy sales spreadsheet into a clean table and add a pivot that answers one real question.',
        view: 'learning',
      },
      resources: [EXCEL_SUPPORT, FCC_RELATIONAL],
    },
    {
      id: 'metric-definitions',
      title: 'Metric definitions and data literacy',
      description:
        'Two analysts can run the same query and disagree about the answer when the metric means two different things. Writing the definition, the grain and the source for every metric you touch is what makes an analysis defensible in front of the business.',
      required: true,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Write definitions for five metrics with their grain, filters and source table, then ask a colleague to repeat one back to you.',
        view: 'projects',
      },
      resources: [GOOGLE_DATA_ANALYTICS, NIST_HANDBOOK],
    },
    {
      id: 'diagnostic-baseline',
      title: 'Diagnostic assessment and gap baseline',
      description:
        'A roadmap built on guesses produces work that is already done. Measuring every core skill first gives the plan a real starting point, so its hours are spent on what is actually missing rather than on what felt missing.',
      required: true,
      skillName: null,
      targetLevel: 2,
      practice: {
        target: 'Rate every core skill of the target role before and after one week of study, and record the difference.',
        view: 'assessment',
      },
      resources: [KAGGLE_SQL, NIST_HANDBOOK],
    },
  ],
  core_skills: [
    {
      id: 'sql-joins-aggregations',
      title: 'SQL joins and aggregations',
      description:
        'Joins turn a normalised database into an answer, and aggregations turn many rows into a single number. Inner, left and anti joins each answer a different question, and GROUP BY with HAVING is where most analyst errors are made.',
      required: true,
      skillName: 'SQL',
      targetLevel: 4,
      practice: {
        target: 'Join customers, orders and products on a public dataset and reconcile the row count against the base tables.',
        view: 'learning',
      },
      resources: [PG_JOIN_TUTORIAL, SQL_BOLT, MODE_SQL],
    },
    {
      id: 'sql-window-functions',
      title: 'SQL window functions',
      description:
        'Window functions calculate across rows without collapsing them, which is how running totals, rankings, period comparisons and retention cohorts are produced. They are the most requested technique in analytics interviews, and the most commonly reinvented badly.',
      required: true,
      skillName: 'SQL',
      targetLevel: 4,
      practice: {
        target: 'Compute a thirty-day rolling average and a customer retention cohort from one transaction table.',
        view: 'learning',
      },
      resources: [PG_WINDOW_FUNCTIONS, MODE_SQL],
    },
    {
      id: 'sql-ctes-subqueries',
      title: 'CTEs and subqueries',
      description:
        'A readable query is a query a reviewer can trust, and common table expressions are the clearest way to stage a calculation step by step. They also keep the logic testable, because every stage can be inspected on its own.',
      required: true,
      skillName: 'SQL',
      targetLevel: 4,
      practice: {
        target: 'Rewrite a nested subquery as three named CTEs and write down what each stage produces.',
        view: 'learning',
      },
      resources: [PG_CTES, PG_QUERIES],
    },
    {
      id: 'sql-query-optimisation',
      title: 'Query optimisation and indexing',
      description:
        'A query that runs in thirty seconds instead of three changes how a dashboard feels to the business. Reading an EXPLAIN plan and knowing which index helps which access pattern is what separates an analyst who ships from one who waits.',
      required: true,
      skillName: 'SQL',
      targetLevel: 4,
      practice: {
        target: 'Run EXPLAIN ANALYZE on one slow query, then add an index or rewrite it and record the before and after timing.',
        view: 'learning',
      },
      resources: [PG_EXPLAIN, PG_PERFORMANCE],
    },
    {
      id: 'postgresql-supabase',
      title: 'PostgreSQL and Supabase foundations',
      description:
        'PostgreSQL is the database most modern analytics projects are built on, and Supabase is the quickest way to get one with authentication, storage and an API attached. Data types, constraints and row-level security are what let you own a project end to end.',
      required: true,
      skillName: 'SQL',
      targetLevel: 4,
      practice: {
        target: 'Create a Supabase project, load a public CSV into a table and query it through both the SQL editor and the API.',
        view: 'learning',
      },
      resources: [SUPABASE_DB, PG_HOME],
    },
    {
      id: 'data-visualisation',
      title: 'Data visualisation with Tableau and Power BI',
      description:
        'The chart is the argument, and the wrong encoding makes a correct analysis useless. Tableau and Power BI compete for the same jobs, so learning one of them properly and understanding how the other thinks beats half-learning both.',
      required: true,
      skillName: 'Data Visualization (Tableau/Power BI)',
      targetLevel: 4,
      practice: {
        target: 'Build one dashboard with three views of the same metric and justify each chart type you chose.',
        view: 'learning',
      },
      resources: [MS_ANALYTICS, TABLEAU_TRAINING, FCC_DATAVIZ],
    },
    {
      id: 'python-for-analysis',
      title: 'Python for data analysis with pandas',
      description:
        'Python is where an analysis becomes reproducible: the same script cleans the file, joins the tables and draws the chart without anyone repeating the work by hand. pandas is the tool you will use most, and it is where the analysis stops being a spreadsheet.',
      required: true,
      skillName: 'Python for Data Analysis',
      targetLevel: 3,
      practice: {
        target: 'Turn one of your SQL analyses into a notebook that loads the data, computes the metric and plots the result.',
        view: 'learning',
      },
      resources: [KAGGLE_PANDAS, PANDAS_DOCS, FCC_PYTHON_DATA, PYTHON_TUTORIAL],
    },
    {
      id: 'statistical-analysis',
      title: 'Statistical analysis and hypothesis testing',
      description:
        'Telling a real effect apart from noise is what makes an analyst trusted. Distributions, confidence intervals and p-values let you say how sure you are, and a p-value without that context is worse than no p-value at all.',
      required: true,
      skillName: 'Statistical Analysis',
      targetLevel: 3,
      practice: {
        target: 'Run an A/B comparison on a public dataset and write the conclusion together with its confidence interval.',
        view: 'learning',
      },
      resources: [NIST_HANDBOOK, KHAN_STATISTICS, COURSERA_LINEAR_REGRESSION],
    },
    {
      id: 'business-communication',
      title: 'Business communication for analysts',
      description:
        'An analysis nobody acts on is a hobby, not a job. Framing the question, choosing the right level of detail and naming the decision the evidence supports is the skill that turns analysis into commercial impact.',
      required: true,
      skillName: 'Business Communication',
      targetLevel: 4,
      practice: {
        target: 'Write a one-page brief for a non-technical manager: the question, the finding and the decision you recommend.',
        view: 'projects',
      },
      resources: [GOOGLE_DATA_ANALYTICS, MS_ANALYTICS],
    },
    {
      id: 'data-warehousing',
      title: 'Data warehousing with BigQuery or Snowflake',
      description:
        'A warehouse separates storage from compute, which is what makes a large scan cheap and repeatable. It is a preferred rather than a required skill, so it is worth learning when a role asks for it or when a project outgrows a single database.',
      required: false,
      skillName: 'Data Warehousing (BigQuery/Snowflake)',
      targetLevel: 3,
      practice: {
        target: 'Load one dataset into BigQuery and compare a partitioned query with an unpartitioned one.',
        view: 'learning',
      },
      resources: [GOOGLE_DATA_ANALYTICS, DBT_INTRO],
    },
    {
      id: 'ab-testing',
      title: 'A/B testing methodology',
      description:
        'An experiment answers whether a change caused an outcome, and the design carries as much weight as the statistics. Sample size, guardrail metrics and reading a result honestly are the parts most candidates skip.',
      required: false,
      skillName: 'A/B Testing Methodology',
      targetLevel: 3,
      practice: {
        target: 'Design an experiment for a pricing page change with a primary metric, a guardrail metric and a stopping rule.',
        view: 'learning',
      },
      resources: [NIST_HANDBOOK, COURSERA_LINEAR_REGRESSION],
    },
  ],
  practice: [
    {
      id: 'churn-analysis-project',
      title: 'Churn analysis mini-project',
      description:
        'Churn analysis is the classic portfolio project because it has a real question, a real dataset and a real conclusion. The value sits in the reasoning from symptom to cause, not in the chart at the end of it.',
      required: true,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Publish one churn analysis with a stated hypothesis, the query behind it and the decision it supports.',
        view: 'projects',
      },
      resources: [SQL_BOLT, KAGGLE_SQL],
    },
    {
      id: 'kpi-dashboard',
      title: 'Executive KPI dashboard',
      description:
        'An executive dashboard answers a small number of questions repeatedly, for people who will never read your code. It needs a clear metric definition, a sensible default date range and a layout that survives being read on a laptop.',
      required: true,
      skillName: 'Data Visualization (Tableau/Power BI)',
      targetLevel: 3,
      practice: {
        target: 'Build a three-metric dashboard with one filter and publish it with a note on what each tile answers.',
        view: 'projects',
      },
      resources: [MS_ANALYTICS, TABLEAU_TRAINING],
    },
    {
      id: 'reproducible-notebook',
      title: 'Reproducible analysis notebook',
      description:
        'Reproducibility is what makes an analysis reviewable: the same input has to produce the same output on someone else’s machine. Version-controlled code, pinned data and a README that states the assumptions are what make that true.',
      required: true,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Publish a repository with a README, a clean run from scratch and the assumptions written down.',
        view: 'projects',
      },
      resources: [GITHUB_START, DBT_INTRO],
    },
    {
      id: 'open-source-contribution',
      title: 'Open-source dataset contribution',
      description:
        'Contributing to an open dataset or notebook is visible proof that you work in public, which many hiring managers value more than another certificate. It is optional, so it belongs after the core projects are finished.',
      required: false,
      skillName: null,
      targetLevel: 2,
      practice: {
        target: 'Open one pull request on a public analysis repository and describe the change you made.',
        view: 'projects',
      },
      resources: [GITHUB_START, KAGGLE_PANDAS],
    },
  ],
  job_prep: [
    {
      id: 'cv-alignment',
      title: 'A CV written for the target role',
      description:
        'The CV is the first filter and it is written for a specific role rather than for you. Keyword coverage, measurable impact and a structure that matches the job description are what get it read rather than skimmed.',
      required: true,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Rewrite your CV for one target role and record the alignment score before and after.',
        view: 'cv-studio',
      },
      resources: [GOOGLE_DATA_ANALYTICS, MS_ANALYTICS],
    },
    {
      id: 'sql-interview-prep',
      title: 'SQL and analytics interview preparation',
      description:
        'Analysts are asked for SQL, for statistics and for the reasoning behind a metric, and the same questions come back at every company. Practising out loud against realistic questions is worth more than reading the answers.',
      required: true,
      skillName: 'SQL',
      targetLevel: 4,
      practice: {
        target: 'Answer twenty SQL questions and five case questions on a timer, then review the ones you could not finish.',
        view: 'assessment',
      },
      resources: [MODE_SQL, PG_QUERIES, SQL_BOLT],
    },
    {
      id: 'behavioural-answers',
      title: 'Behavioural and business case answers',
      description:
        'Behavioural questions are about how you worked, not what you know, and a structured answer is what makes them sound like evidence instead of adjectives. Business case questions test the same thing with a scenario attached.',
      required: true,
      skillName: 'Business Communication',
      targetLevel: 4,
      practice: {
        target: 'Write five structured answers, each with a decision you made and a number that moved.',
        view: 'learning',
      },
      resources: [GOOGLE_DATA_ANALYTICS, MS_ANALYTICS],
    },
    {
      id: 'application-pipeline',
      title: 'Application pipeline and tracking',
      description:
        'Most candidates lose momentum after the fifth application because nothing tracks them. A simple pipeline — role, date, stage, next action — turns applying from a burst into a routine.',
      required: true,
      skillName: null,
      targetLevel: 2,
      practice: {
        target: 'Set up a tracker with ten rows and update it for every application you send this week.',
        view: 'jobs',
      },
      resources: [GOOGLE_DATA_ANALYTICS, GITHUB_START],
    },
    {
      id: 'analytics-certification',
      title: 'Analytics certification',
      description:
        'A certification is a signal rather than a substitute for proof of work, and it helps most where a recruiter uses it as a filter. It is optional here because a strong portfolio and an interview-ready SQL level are worth more in most markets.',
      required: false,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Compare two certifications against the roles you are targeting and pick one with a deadline.',
        view: 'learning',
      },
      resources: [GOOGLE_DATA_ANALYTICS, COURSERA_LINEAR_REGRESSION],
    },
  ],
  job_ready: [
    {
      id: 'interview-tracking',
      title: 'Track every application through interview stages',
      description:
        'Once you are applying, the pipeline is the product you are managing. Stage, date and next action for every application is what keeps a good month from collapsing into a silent one.',
      required: true,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Update every open application with its current stage and the date of your next action.',
        view: 'jobs',
      },
      resources: [GOOGLE_DATA_ANALYTICS, DBT_INTRO],
    },
    {
      id: 'feedback-loop',
      title: 'Turn interview feedback into the next learning step',
      description:
        'Feedback only helps if it changes what you do next. Turning each interview into one specific skill gap and one concrete action is what makes the next application stronger than the last one.',
      required: true,
      skillName: null,
      targetLevel: 3,
      practice: {
        target: 'Write down the last three interview questions you could not answer and map each to a skill gap.',
        view: 'assessment',
      },
      resources: [NIST_HANDBOOK, KHAN_STATISTICS],
    },
    {
      id: 'portfolio-currency',
      title: 'Keep the portfolio and skills current',
      description:
        'The market moves while you are applying, so a portfolio that was strong six months ago may no longer be. A monthly review of the skills, the projects and the CV keeps the evidence aligned with the role you are chasing.',
      required: true,
      skillName: null,
      targetLevel: 2,
      practice: {
        target: 'Re-read one project README and update it with the decision it informed and the result it produced.',
        view: 'projects',
      },
      resources: [GITHUB_START, FCC_DATAVIZ],
    },
    {
      id: 'analytics-community',
      title: 'Analytics community and mentoring',
      description:
        'Analysts who explain their work in public get more opportunities than analysts who keep it private, and mentoring a beginner is the fastest way to find out what you actually understand.',
      required: false,
      skillName: 'Stakeholder Management',
      targetLevel: 3,
      practice: {
        target: 'Publish one write-up of an analysis and answer one question somebody else asked.',
        view: 'projects',
      },
      resources: [GITHUB_START, GOOGLE_DATA_ANALYTICS],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Keeps a level inside the 0 to 5 range the platform uses. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(5, Math.round(level)));
}

/** Normalises a skill name so the tree can match it to the platform's skill. */
export function normalizeSkillKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Finds the platform skill a topic tracks.
 *
 * The match is exact on the normalised name first, because a topic that names
 * one of the role's own skills should only follow that skill. The looser
 * contains-match is the fallback for a platform that stores the skill with
 * slightly different punctuation.
 */
export function findSkillLevel(
  skillName: string | null,
  skillLevels: Record<string, { currentLevel: number; targetLevel: number }>
): { currentLevel: number; targetLevel: number } | null {
  if (!skillName) return null;
  const wanted = normalizeSkillKey(skillName);
  if (!wanted) return null;
  for (const [name, level] of Object.entries(skillLevels)) {
    if (normalizeSkillKey(name) === wanted) return level;
  }
  for (const [name, level] of Object.entries(skillLevels)) {
    const key = normalizeSkillKey(name);
    if (key.includes(wanted) || wanted.includes(key)) return level;
  }
  return null;
}

/**
 * The state of a node, in the roadmap.sh vocabulary.
 *
 * The order matters. A node the candidate has already reached is done even if
 * it belongs to the current stage. An optional topic stays optional even inside
 * the current stage, because it is an alternative path rather than the core
 * work. Everything else in the current stage is in progress, and everything
 * further along is recommended.
 */
export function resolveNodeState(
  node: {
    required: boolean;
    stageId: RoadmapJourneyStageId;
    currentLevel: number;
    targetLevel: number;
    done: boolean;
  },
  context: { currentStageId: RoadmapJourneyStageId | null }
): RoadmapNodeState {
  if (node.done) return 'done';
  if (!node.required) return 'optional';
  if (context.currentStageId && node.stageId === context.currentStageId) return 'inProgress';
  return 'recommended';
}

/** How a branch is drawn: required work is solid, an alternative path is dashed. */
export function connectorStyle(node: Pick<RoadmapTopicSeed, 'required'>): RoadmapBranchStyle {
  return node.required ? 'solid' : 'dashed';
}

/** Every node of the tree, in reading order. */
export function flattenTree(tree: RoadmapTree): RoadmapTreeNode[] {
  return tree.stages.flatMap((stage) => stage.children);
}

/** Finds a node by its id. */
export function findNode(tree: RoadmapTree, nodeId: string): RoadmapTreeNode | null {
  return flattenTree(tree).find((node) => node.id === nodeId) ?? null;
}

const STAGE_PRACTICE_VIEWS: Record<RoadmapJourneyStageId, string> = {
  foundation: 'assessment',
  core_skills: 'learning',
  practice: 'projects',
  job_prep: 'cv-studio',
  job_ready: 'jobs',
};

/**
 * Builds the tree from the journey's stages and the candidate's own data.
 *
 * The spine is the journey, in the journey's order. The topics come from the
 * curriculum catalogue, and each one takes its level from the platform skill it
 * tracks, unless the candidate has set a level inside the tree itself.
 */
export function buildRoadmapTree(
  stages: readonly RoadmapJourneyStage[],
  options: {
    progress: RoadmapTreeProgress;
    overrides?: RoadmapNodeOverrides;
  }
): RoadmapTree {
  const { progress, overrides = {} } = options;

  return {
    stages: stages.map((stage) => {
      const seeds = ROADMAP_TOPIC_CATALOGUE[stage.id] ?? [];
      const stageProgress = progress.stageProgress[stage.id];

      const children: RoadmapTreeNode[] = seeds.map((seed, index) => {
        const override = overrides[seed.id];
        const skill = findSkillLevel(seed.skillName, progress.skillLevels);
        const currentLevel = clampLevel(
          override?.level !== undefined ? override.level : skill ? skill.currentLevel : 0
        );
        const targetLevel = clampLevel(skill ? skill.targetLevel : seed.targetLevel) || seed.targetLevel;
        const done = override?.done ?? (targetLevel > 0 && currentLevel >= targetLevel);

        const node: RoadmapTreeNode = {
          ...seed,
          stageId: stage.id,
          side: index % 2 === 0 ? 'start' : 'end',
          currentLevel,
          targetLevel: Math.max(1, Math.min(5, targetLevel)),
          state: 'recommended',
        };
        node.state = resolveNodeState(
          { ...node, done },
          { currentStageId: progress.currentStageId }
        );
        return node;
      });

      const stageOverride = overrides[stage.id];
      const stagePercent = Math.max(0, Math.min(100, stageProgress?.pct ?? 0));
      const stageLevel = clampLevel(
        stageOverride?.level !== undefined ? stageOverride.level : Math.round(stagePercent / 20)
      );
      const stageDone = stageOverride?.done ?? Boolean(stageProgress?.complete || stageLevel === 5);
      const stageResources = Array.from(
        new Map(children.flatMap((child) => child.resources).map((resource) => [resource.url, resource])).values()
      );

      return {
        id: stage.id,
        order: stage.order,
        title: stage.label,
        objective: stage.objective,
        description: stage.actions.join(' → '),
        criteria: stage.completionCriteria,
        progress: stageDone ? 100 : stageOverride?.level !== undefined ? stageLevel * 20 : stagePercent,
        currentLevel: stageDone ? 5 : stageLevel,
        targetLevel: 5,
        resources: stageResources,
        practice: {
          target: stage.actions[0] ?? stage.objective,
          view: STAGE_PRACTICE_VIEWS[stage.id],
        },
        state: stageDone
          ? ('done' as const)
          : progress.currentStageId === stage.id
            ? ('inProgress' as const)
            : ('recommended' as const),
        children,
      };
    }),
  };
}

/**
 * Sets the level of one node and returns the tree with the change applied.
 *
 * The states are recomputed from the new level, so a node that reached its
 * target becomes done and the node is no longer in progress.
 */
export function withNodeLevel(
  tree: RoadmapTree,
  nodeId: string,
  level: number,
  context: { currentStageId: RoadmapJourneyStageId | null }
): RoadmapTree {
  const next = clampLevel(level);
  return {
    stages: tree.stages.map((stage) => {
      if (stage.id === nodeId) {
        return {
          ...stage,
          currentLevel: next,
          progress: next * 20,
          state:
            next >= stage.targetLevel
              ? 'done'
              : stage.id === context.currentStageId
                ? 'inProgress'
                : 'recommended',
        };
      }
      return {
        ...stage,
        children: stage.children.map((node) => {
          if (node.id !== nodeId) return node;
          const updated: RoadmapTreeNode = {
            ...node,
            currentLevel: next,
            state: resolveNodeState(
              { ...node, currentLevel: next, done: next >= node.targetLevel },
              context
            ),
          };
          return updated;
        }),
      };
    }),
  };
}

/** Marks a node as finished, or takes the mark back. */
export function withNodeDone(
  tree: RoadmapTree,
  nodeId: string,
  done: boolean,
  context: { currentStageId: RoadmapJourneyStageId | null }
): RoadmapTree {
  return {
    stages: tree.stages.map((stage) => {
      if (stage.id === nodeId) {
        return {
          ...stage,
          currentLevel: done ? 5 : stage.currentLevel,
          progress: done ? 100 : stage.progress,
          state: done
            ? 'done'
            : stage.id === context.currentStageId
              ? 'inProgress'
              : 'recommended',
        };
      }
      return {
        ...stage,
        children: stage.children.map((node) => {
          if (node.id !== nodeId) return node;
          const updated: RoadmapTreeNode = { ...node };
          updated.state = resolveNodeState({ ...node, done }, context);
          return updated;
        }),
      };
    }),
  };
}

/** How many nodes are in each state. */
export function summarizeTree(tree: RoadmapTree): {
  done: number;
  inProgress: number;
  recommended: number;
  optional: number;
  total: number;
} {
  const nodes = flattenTree(tree);
  return {
    done: nodes.filter((node) => node.state === 'done').length,
    inProgress: nodes.filter((node) => node.state === 'inProgress').length,
    recommended: nodes.filter((node) => node.state === 'recommended').length,
    optional: nodes.filter((node) => node.state === 'optional').length,
    total: nodes.length,
  };
}

/* -------------------------------------------------------------------------- */
/* The Arabic edition                                                           */
/* -------------------------------------------------------------------------- */

/*
 * The topic content is translated through the application's own catalogue, in
 * the same way the journey's stages are: every title, explanation and
 * practice is an English source string with an Arabic entry in
 * `src/translations/parts/roadmap.ts`.
 *
 * The entries are generated by `scripts/write-roadmap-tree-ar.ts` from
 * `shared/roadmapTreeAr.ts`, so a key can never drift away from the
 * catalogue it belongs to.
 */
