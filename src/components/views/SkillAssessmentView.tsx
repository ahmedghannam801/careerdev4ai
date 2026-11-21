import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Award,
  Clock,
  RotateCcw,
  BookOpen,
  ShieldCheck,
  ChevronRight,
  Database,
  Code2,
  FileSpreadsheet,
  Globe,
  MessageSquare,
  History,
  BarChart3,
  Layers,
  Server,
  Brain,
  Briefcase,
  Palette,
  Megaphone,
  ClipboardList,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useToast } from '../toast/ToastProvider';
import { CareerImage } from '../ui/CareerImage';
import {
  MorphBox,
  MorphingButton,
  MorphingMilestone,
  type MorphButtonState,
} from '../motion/Morph';
import { Stagger, StaggerItem } from '../motion/Motion';
import { getSpecificIndustryVisual } from '../../lib/imageAssets';
import { hasPracticalEvidence } from '../../../shared/skillEvidence';
import {
  ASSESSMENT_MAPPING_RULE,
  ASSESSMENT_RUBRIC,
  ASSESSMENT_RUBRIC_HEADLINE,
  ASSESSMENT_RUBRIC_RULE,
  assessmentLevelExplanationValues,
  assessmentScopeSentence,
  explainAssessmentLevel,
  levelForAssessmentScore,
} from '../../../shared/assessment';
import { assessmentsForRole } from '../../../shared/roleAssessmentMatching';
import {
  ASSESSMENT_DIFFICULTY_RULE,
  QUESTION_DIFFICULTY_DESCRIPTIONS,
  QUESTION_DIFFICULTY_LABELS,
  difficultyBreakdown,
  difficultyPercentage,
  weakestDifficulty,
  type QuestionDifficulty,
} from '../../lib/assessmentDifficulty';

export interface AssessmentQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /**
   * How demanding this question is.
   *
   * The check used to report one number, so a candidate who answered the
   * easy questions well and the hard ones badly scored exactly the same as
   * the opposite. The difficulty travels with the question, so the badge
   * the candidate reads and the breakdown in the result are the same fact.
   */
  difficulty: QuestionDifficulty;
}

export interface AssessmentCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  timeMinutes: number;
  skillName: string;
  aliases?: string[];
  /**
   * The visual that genuinely belongs to this check.
   *
   * The four checks used to share one generic photograph, which told the
   * candidate that Excel, Communication, English and SQL were the same
   * subject. A check with no visual of its own renders its own badge
   * instead, so no two cards look alike by accident.
   */
  visual?: string | null;
  questions: AssessmentQuestion[];
}

export interface PastAttempt {
  id: string;
  categoryId: string;
  categoryTitle: string;
  score: number;
  total: number;
  percentage: number;
  proficiencyLevel: number;
  date: string;
}

const ASSESSMENT_CATEGORIES: AssessmentCategory[] = [
  {
    id: 'sql',
    title: 'SQL & Query Optimization',
    description: 'Relational data modeling, multi-table joins, subqueries, aggregations and window functions.',
    icon: Database,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'SQL',
    aliases: ['SQL & Query Optimization', 'Querying', 'Relational Databases'],
    visual: 'data-analysis',
    questions: [
      {
        id: 'sql-1',
        difficulty: 'Intermediate',
        prompt:
          'You run:\n\nSELECT dept, COUNT(*) AS n\nFROM employees\nWHERE n > 5\nGROUP BY dept;\n\nWhy does the database reject WHERE n > 5?',
        options: [
          'GROUP BY cannot be combined with COUNT(*).',
          'WHERE executes before GROUP BY and aliases in SELECT are not yet evaluated — aggregate filters belong in HAVING COUNT(*) > 5.',
          'COUNT(*) does not work without ORDER BY.',
          'You must wrap WHERE in parentheses.',
        ],
        correctIndex: 1,
        explanation:
          'In SQL logical query processing, FROM and JOIN run first, followed by WHERE, GROUP BY, HAVING, SELECT, and ORDER BY. Filtering aggregated counts requires HAVING.',
      },
      {
        id: 'sql-2',
        difficulty: 'Intermediate',
        prompt:
          'An orders table has ties in revenue: 900, 800, 800, 700.\nWhat ranks does DENSE_RANK() OVER (ORDER BY revenue DESC) return vs RANK()?',
        options: [
          'RANK() skips ranks after ties (1, 2, 2, 4); DENSE_RANK() keeps consecutive ranks (1, 2, 2, 3).',
          'DENSE_RANK() requires a LIMIT clause while RANK() does not.',
          'RANK() only works on primary keys.',
          'DENSE_RANK() returns decimals when ties occur.',
        ],
        correctIndex: 0,
        explanation:
          'RANK() leaves gaps after duplicate values (1, 2, 2, 4), whereas DENSE_RANK() assigns consecutive integers with no gaps (1, 2, 2, 3).',
      },
      {
        id: 'sql-3',
        difficulty: 'Advanced',
        prompt:
          'You want EVERY customer row from customers (left) and only matching orders from orders (right), keeping customers with 0 orders. Which query works without accidentally turning the join into an INNER JOIN?',
        options: [
          'INNER JOIN orders o ON o.customer_id = c.id',
          'FULL OUTER JOIN orders o ON o.customer_id = c.id',
          'LEFT JOIN orders o ON o.customer_id = c.id AND o.status = \'paid\'',
          'CROSS JOIN orders o',
        ],
        correctIndex: 2,
        explanation:
          'A LEFT JOIN retains all rows from customers, and placing o.status = \'paid\' inside the ON clause preserves unmatched customers rather than filtering them out in WHERE.',
      },
      {
        id: 'sql-4',
        difficulty: 'Advanced',
        prompt:
          'When analyzing slow SQL queries, how does a correlated subquery differ from a standard CTE/subquery?',
        options: [
          'It runs once before the outer query starts.',
          'It references columns from the outer query and may re-evaluate per outer candidate row unless rewritten as a join or window.',
          'It cannot contain a WHERE clause.',
          'It caches results permanently across sessions.',
        ],
        correctIndex: 1,
        explanation:
          'A correlated subquery depends on values from each outer row, often causing row-by-row re-evaluation on large analytics tables.',
      },
      {
        id: 'sql-5',
        difficulty: 'Intermediate',
        prompt:
          'A dashboard pipeline starts failing after a table column is reordered and slow network I/O spikes. Why did SELECT * trigger both issues?',
        options: [
          'SELECT * blocks transactions from committing.',
          'It transfers unnecessary wide columns, prevents covering index scans, and breaks fragile positional consumers when schema shifts.',
          'SELECT * converts integers to text.',
          'It is unsupported in PostgreSQL.',
        ],
        correctIndex: 1,
        explanation:
          'Explicit column projection reduces I/O, unlocks index-only scans, and insulates downstream pipelines from schema evolution.',
      },
    ],
  },
  {
    id: 'python',
    title: 'Python for Data & Automation',
    description: 'Data structures, list comprehensions, functional constructs, and pandas manipulation.',
    icon: Code2,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Python',
    aliases: ['Python for Data Analysis', 'Pandas', 'Pandas & NumPy', 'NumPy'],
    visual: 'software-engineering',
    questions: [
      {
        id: 'py-1',
        difficulty: 'Beginner',
        prompt:
          'A sales dataset has a "revenue" column with the string "N/A" in 12 rows. Which expression converts the column to numeric and leaves the missing rows as NaN?',
        options: [
          'df["revenue"].astype(int)',
          'pd.to_numeric(df["revenue"], errors="coerce")',
          'df["revenue"].replace("N/A", 0)',
          'df.dropna(axis=0, subset=["revenue"])',
        ],
        correctIndex: 1,
        explanation:
          'pd.to_numeric with errors="coerce" converts what it can and turns the unparseable "N/A" values into NaN, so the column stays usable and the missing rows stay identifiable. astype(int) raises a ValueError on "N/A"; replacing with 0 invents a revenue of zero; dropna deletes twelve rows of real data.',
      },
      {
        id: 'py-2',
        difficulty: 'Beginner',
        prompt:
          'You need revenue per region, but each order appears on its own row. Which approach produces the total per region correctly?',
        options: [
          'df.groupby("region")["revenue"].sum()',
          'df["revenue"].groupby("region").max()',
          'df.groupby("region").apply(lambda g: g["revenue"].iloc[0])',
          'df.sort_values("region").revenue',
        ],
        correctIndex: 0,
        explanation:
          'groupby("region")["revenue"].sum() groups the rows by region and adds the revenue within each group, which is exactly the total per region. max() returns the largest single order, apply with iloc[0] returns the first order only, and sorting changes nothing.',
      },
      {
        id: 'py-3',
        difficulty: 'Beginner',
        prompt:
          'The same customer appears three times because of a repeat import. What is the safest first step before analysing the data?',
        options: [
          'Delete every customer with more than one row.',
          'Find and remove exact duplicate rows, then check whether the remaining rows genuinely differ.',
          'Leave them and average all values.',
          'Rename the customer column so the duplicates become unique.',
        ],
        correctIndex: 1,
        explanation:
          'The safe step is to remove true duplicates and then verify whether the remaining rows for that customer are real separate records. A customer with several orders is not a data error, so deleting every repeated customer destroys real information.',
      },
      {
        id: 'py-4',
        difficulty: 'Intermediate',
        prompt:
          'What does this code do?\n\nresult = df.merge(lookup, on="customer_id", how="left")',
        options: [
          'Keeps only the rows present in both dataframes.',
          'Keeps every row of df and adds the matching lookup columns where a match exists, leaving unmatched rows with nulls.',
          'Keeps every row of lookup and drops df.',
          'Counts the rows of df that have no match.',
        ],
        correctIndex: 1,
        explanation:
          'A left join keeps all rows from the left frame (df) and fills the lookup columns where a match is found, leaving NaN where there is none. inner (the default) would drop the unmatched df rows, which silently loses records.',
      },
      {
        id: 'py-5',
        difficulty: 'Intermediate',
        prompt:
          'Which filter keeps only orders placed in 2024 AND worth more than 500, for either region?',
        options: [
          'df[(df["year"] == 2024) & (df["amount"] > 500)]',
          'df[(df["year"] == 2024) or (df["amount"] > 500)]',
          'df[df["year"] == 2024 & df["amount"] > 500]',
          'df[(df["year"] == 2024) + (df["amount"] > 500)]',
        ],
        correctIndex: 0,
        explanation:
          'Each condition needs its own parentheses and the two are combined with & for "and". Without the inner parentheses, & binds to the comparison operators and raises an error; "or" would keep far too many rows; + adds booleans numerically rather than combining them logically.',
      },
    ],
  },
  {
    id: 'excel',
    title: 'Excel & Quantitative Analysis',
    description: 'Lookup formulas, dynamic arrays, PivotTables, and financial/operational metrics.',
    icon: FileSpreadsheet,
    level: 'Beginner',
    timeMinutes: 8,
    skillName: 'Microsoft Excel',
    aliases: ['Excel', 'Excel & Spreadsheets', 'Spreadsheets', 'Spreadsheet Modeling'],
    // No photograph of its own: this card renders its own badge, so it never
    // wears the same picture as the SQL check.
    visual: null,
    questions: [
      {
        id: 'xl-1',
        difficulty: 'Intermediate',
        prompt:
          'You insert a new column inside a financial lookup table and your old =VLOOKUP(A2, $B$2:$E$50, 3, FALSE) suddenly returns the wrong field. Why does XLOOKUP prevent this bug?',
        options: [
          'XLOOKUP only searches numeric cells.',
          'XLOOKUP selects lookup and return ranges explicitly, searches left or right, defaults to exact match, and adapts when columns are inserted.',
          'XLOOKUP rounds all numbers automatically.',
          'XLOOKUP relies on VBA macros.',
        ],
        correctIndex: 1,
        explanation:
          'Because XLOOKUP separates the lookup_array and return_array instead of hardcoding a column offset integer, inserting columns inside the table no longer breaks results.',
      },
      {
        id: 'xl-2',
        difficulty: 'Beginner',
        prompt:
          'A finance manager asks for monthly totals per governorate from 18,000 raw order rows in under two minutes without altering source formulas. Which tool is best?',
        options: [
          'Manual cell coloring and copy-pasting.',
          'An Excel PivotTable grouped by Date (Months) and Governorate with Sum of Revenue.',
          'Nested 10-level IF statements on every row.',
          'Converting the workbook to plain text.',
        ],
        correctIndex: 1,
        explanation:
          'PivotTables aggregate, group, and cross-tabulate thousands of transactional rows interactively without mutating raw source records.',
      },
      {
        id: 'xl-3',
        difficulty: 'Beginner',
        prompt:
          'Which formula accurately sums order totals in C2:C100 ONLY where column B equals "Cairo"?',
        options: [
          '=SUMIF(B2:B100, "Cairo", C2:C100)',
          '=COUNTIF("Cairo", B2:B100)',
          '=SUM(B2:B100 + C2:C100)',
          '=VLOOKUP("Cairo", B2:C100, 2, FALSE)',
        ],
        correctIndex: 0,
        explanation: '=SUMIF(range, criteria, [sum_range]) checks the condition in B2:B100 and sums matching rows in C2:C100.',
      },
      {
        id: 'xl-4',
        difficulty: 'Beginner',
        prompt:
          'You copy =B2*E1 down 50 rows to calculate VAT from a single tax rate stored in cell E1, and rows 2–50 calculate 0. How should the reference be written?',
        options: [
          'Format E1 as Currency.',
          '=B2*$E$1 (absolute reference anchoring column E and row 1 so the tax cell does not shift downward).',
          '=B2*E1!',
          'Wrap E1 in quotes.',
        ],
        correctIndex: 1,
        explanation: 'Adding $ anchors the row and column coordinates ($E$1) so dragging the formula down keeps pointing at the tax-rate cell.',
      },
      {
        id: 'xl-5',
        difficulty: 'Beginner',
        prompt:
          'A SKU lookup returns #N/A for discontinued products, causing downstream KPI sums to fail. Which wrapper keeps the KPI report clean and transparent?',
        options: [
          '=FORCE(A2)',
          '=IFERROR(XLOOKUP(A2, SKUList, PriceList), 0) or a clear "Discontinued" fallback.',
          '=SPELLCHECK(A2)',
          '=ROUND(A2, 0)',
        ],
        correctIndex: 1,
        explanation: 'IFERROR(value, fallback) traps #N/A or #DIV/0! safely without letting broken formula cells cascade through summary aggregations.',
      },
    ],
  },
  {
    id: 'communication',
    title: 'Professional Communication & STAR',
    description: 'Workplace alignment, technical storytelling, conflict management, and STAR interview structure.',
    icon: MessageSquare,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Communication',
    visual: null,
    questions: [
      {
        id: 'comm-1',
        difficulty: 'Beginner',
        prompt: 'What does the STAR framework stand for in competency-based interviews?',
        options: [
          'Strategy, Tactics, Action, Revenue',
          'Situation, Task, Action, Result',
          'Skills, Training, Ambition, Resilience',
          'Summary, Topic, Argument, Resolution',
        ],
        correctIndex: 1,
        explanation: 'STAR structures behavioral interview answers into Situation (context), Task (challenge), Action (your specific initiative), and Result (quantifiable outcome).',
      },
      {
        id: 'comm-2',
        difficulty: 'Beginner',
        prompt: 'In the STAR framework, which component should typically receive the MOST emphasis and detail?',
        options: [
          'Situation (background history)',
          'Task (job description)',
          'Action (your personal decisions, tools, and execution steps)',
          'None; all must have identical sentence counts',
        ],
        correctIndex: 2,
        explanation: 'Interviewers evaluate your specific competencies through the Actions you personally took, what obstacles you overcame, and how you collaborated.',
      },
      {
        id: 'comm-3',
        difficulty: 'Intermediate',
        prompt: 'When presenting technical architecture to non-technical business stakeholders, what is the best strategy?',
        options: [
          'Use advanced technical jargon to demonstrate deep expertise.',
          'Connect architectural trade-offs directly to business value, latency, user trust, and operational costs.',
          'Refuse to answer questions until code review.',
          'Only show raw database schema diagrams.',
        ],
        correctIndex: 1,
        explanation: 'Effective cross-functional communication translates technical mechanics into business outcomes, risk mitigation, and strategic capabilities.',
      },
      {
        id: 'comm-4',
        difficulty: 'Intermediate',
        prompt: 'How should you approach answering a question about a past project failure?',
        options: [
          'Deny that any failure ever occurred.',
          'Blame the client or team members.',
          'Acknowledge the setback objectively, analyze the root cause, and explain the concrete preventive systems you implemented as a result.',
          'Pivot to an unrelated personal achievement.',
        ],
        correctIndex: 2,
        explanation: 'Hiring managers test maturity, accountability, and continuous learning by examining how candidates diagnose mistakes and institutionalize improvements.',
      },
      {
        id: 'comm-5',
        difficulty: 'Beginner',
        prompt: 'What distinguishes an active listener in team collaborative environments?',
        options: [
          'Waiting silently for their turn to speak without processing.',
          'Reflecting key points, asking clarifying questions, and validating mutual understanding before proposing solutions.',
          'Interrupting immediately when an incorrect statement is uttered.',
          'Taking minutes without contributing.',
        ],
        correctIndex: 1,
        explanation: 'Active listening confirms shared understanding and builds trust by paraphrasing core points and exploring nuances before prescribing remedies.',
      },
    ],
  },
  {
    id: 'english',
    title: 'Professional English & Documentation',
    description: 'Workplace emails, technical documentation clarity, precision, and business tone.',
    icon: Globe,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'English',
    visual: null,
    questions: [
      {
        id: 'eng-1',
        difficulty: 'Beginner',
        prompt: 'Which phrase is most appropriate for a polite, professional follow-up email to a hiring team?',
        options: [
          'Why haven\'t you replied to my application yet?',
          'I am writing to politely inquire about the status of my application for the position.',
          'Check my CV again.',
          'Hoping you will hire me soon.',
        ],
        correctIndex: 1,
        explanation: 'Clear, polite, and specific phrasing reinforces professionalism and respects the recipient\'s schedule.',
      },
      {
        id: 'eng-2',
        difficulty: 'Beginner',
        prompt: 'In technical writing, why is the active voice generally preferred over the passive voice?',
        options: [
          'It makes documents longer.',
          'It clearly identifies who or what performs the action and improves sentence directness and clarity.',
          'Passive voice is grammatically illegal in software.',
          'It removes all adjectives.',
        ],
        correctIndex: 1,
        explanation: 'Active voice ("The service processes requests") is clearer, more concise, and eliminates ambiguity regarding the actor compared to passive voice ("Requests are processed").',
      },
      {
        id: 'eng-3',
        difficulty: 'Beginner',
        prompt: 'What does the idiom "on the same page" mean in a workplace setting?',
        options: [
          'Reading from the same physical sheet of paper.',
          'Having a shared understanding and agreement on objectives and plans.',
          'Working in the same office building.',
          'Sharing identical computer monitors.',
        ],
        correctIndex: 1,
        explanation: '"On the same page" is a standard professional idiom meaning all parties have reached consensus and possess the same knowledge baseline.',
      },
      {
        id: 'eng-4',
        difficulty: 'Intermediate',
        prompt: 'Which sentence demonstrates proper subject-verb agreement?',
        options: [
          'The team of data analysts are presenting their findings.',
          'The team of data analysts is presenting its findings.',
          'The data analysts is ready.',
          'Each of the servers were restarted.',
        ],
        correctIndex: 1,
        explanation: 'In formal English, collective nouns like "team" acting as a singular unit take singular verbs ("is presenting its findings").',
      },
      {
        id: 'eng-5',
        difficulty: 'Beginner',
        prompt: 'What is the purpose of an Executive Summary at the start of a business or technical proposal?',
        options: [
          'To list the names of all employees in alphabetical order.',
          'To provide a concise overview of the problem, proposed solution, and key ROI metrics for senior decision-makers.',
          'To hide technical secrets from competitors.',
          'To fulfill a legal page count requirement.',
        ],
        correctIndex: 1,
        explanation: 'An executive summary synthesizes the strategic essentials so that executive stakeholders can immediately understand the value proposition without reviewing entire technical appendices.',
      },
    ],
  },
  {
    id: 'power-bi-tableau',
    title: 'Power BI & Tableau',
    description: 'Data modeling, dashboard design, metric selection and visualization choices.',
    icon: BarChart3,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Data Visualization',
    aliases: ['Power BI', 'Tableau', 'Power BI & Tableau'],
    visual: 'data-analysis',
    questions: [
      { id: 'bi-1', difficulty: 'Intermediate', prompt: 'A report total changes unexpectedly when a dimension is added. What should you inspect first?', options: ['The chart title', 'Relationship cardinality and filter direction in the data model', 'The page background', 'The browser zoom'], correctIndex: 1, explanation: 'Model relationships and filter propagation determine how measures aggregate when dimensions are introduced.' },
      { id: 'bi-2', difficulty: 'Beginner', prompt: 'Which visual is usually best for showing a trend over monthly time periods?', options: ['Pie chart', 'Line chart', 'Gauge', 'Packed bubbles'], correctIndex: 1, explanation: 'A line chart makes ordered time trends and changes over time easy to compare.' },
      { id: 'bi-3', difficulty: 'Intermediate', prompt: 'What is the strongest first step when a dashboard is slow?', options: ['Add more visuals', 'Check model size, query performance and unnecessary high-cardinality fields', 'Use more colors', 'Increase the title font'], correctIndex: 1, explanation: 'Performance tuning starts with the data model and query workload, not decorative changes.' },
      {
        id: 'bi-4',
        difficulty: 'Advanced',
        prompt:
          'A matrix shows the same total on every row after a month column is added. Which model problem is the most likely cause?',
        options: [
          'The month column is sorted descending',
          'The relationship between the date table and the fact table is missing or inactive, so month does not filter the measure',
          'The measure uses SUM instead of COUNT',
          'The report has too many pages',
        ],
        correctIndex: 1,
        explanation:
          'A measure that ignores a column is usually not being filtered by it: the date relationship is missing, inactive or filtered in the wrong direction. Sorting cannot change a total, the aggregation choice changes the value rather than repeating it, and page count has no effect on filter context.',
      },
      {
        id: 'bi-5',
        difficulty: 'Intermediate',
        prompt:
          'Why is a star schema usually preferred over a single wide table for a BI model?',
        options: [
          'It guarantees faster refresh regardless of data volume',
          'It keeps filter directions predictable and lets conformed dimensions serve several fact tables',
          'It removes the need for measures',
          'It stores every row twice for safety',
        ],
        correctIndex: 1,
        explanation:
          'Separating facts from shared dimensions makes filter propagation explicit and avoids repeating the same descriptive columns in every table. Refresh speed still depends on volume and queries, measures are still needed, and a star schema does not duplicate rows for safety.',
      },
    ],
  },
  {
    id: 'statistics-ab-testing',
    title: 'Statistics & A/B Testing',
    description: 'Experiment design, uncertainty, statistical significance and practical impact.',
    icon: BarChart3,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Statistics & A/B Testing',
    aliases: ['Statistics', 'Experimentation', 'A/B Testing', 'Hypothesis Testing'],
    questions: [
      { id: 'stat-1', difficulty: 'Beginner', prompt: 'What is the main purpose of random assignment in an experiment?', options: ['Guarantee a positive result', 'Reduce systematic differences between treatment groups', 'Increase the sample mean', 'Remove the need for a control group'], correctIndex: 1, explanation: 'Random assignment helps balance confounders so outcome differences can be attributed more credibly to treatment.' },
      { id: 'stat-2', difficulty: 'Intermediate', prompt: 'A 95% confidence interval for a lift crosses zero. What is the safest conclusion?', options: ['The treatment definitely works', 'The data do not establish a non-zero effect at the corresponding two-sided 5% level', 'The control group is invalid', 'The effect is exactly zero'], correctIndex: 1, explanation: 'An interval crossing zero does not provide conventional evidence that the effect differs from zero; it does not prove no effect.' },
      { id: 'stat-3', difficulty: 'Advanced', prompt: 'Why should an analyst define the primary metric before inspecting experiment results?', options: ['To prevent metric switching that inflates false-positive risk', 'To ensure every metric is significant', 'To avoid checking sample size', 'To make the treatment group larger'], correctIndex: 0, explanation: 'Pre-specifying a primary metric limits selective reporting and multiple-testing bias.' },
      {
        id: 'stat-4',
        difficulty: 'Advanced',
        prompt:
          'A test was powered to detect a 2-point lift. It returns p = 0.18 with an observed 1-point lift. What is the correct reading?',
        options: [
          'The treatment has no effect',
          'There is no statistically significant evidence at this sample size, and an effect smaller than the detectable size remains plausible',
          'The experiment must be rerun until p < 0.05',
          'The control group was assigned incorrectly',
        ],
        correctIndex: 1,
        explanation:
          'A non-significant result is not proof of no effect. The study could not reliably detect an effect as small as the one observed, so the honest conclusion is uncertainty. Rerunning until significance is p-hacking, and nothing here suggests misassignment.',
      },
      {
        id: 'stat-5',
        difficulty: 'Intermediate',
        prompt:
          'You inspect 12 secondary metrics and one has p = 0.04. Why is that weak evidence?',
        options: [
          'p-values below 0.05 are always invalid',
          'Testing many metrics raises the chance of at least one false positive unless the analysis is pre-specified or adjusted',
          'The metric must be deleted',
          'Twelve is too small a number of metrics to analyse',
        ],
        correctIndex: 1,
        explanation:
          'With many comparisons, roughly one in twenty null results falls below 0.05 by chance. Pre-specifying a primary metric or applying a multiple-comparison correction keeps that risk in check. The p-value itself is not invalid, and the metric should not be deleted merely because it was one of many.',
      },
    ],
  },
  {
    id: 'typescript',
    title: 'TypeScript',
    description: 'Type narrowing, safe API boundaries, unions and maintainable type design.',
    icon: Code2,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'TypeScript',
    aliases: ['JavaScript', 'TypeScript Engineering'],
    questions: [
      { id: 'ts-1', difficulty: 'Beginner', prompt: 'A value from JSON.parse is untrusted. What is the safest type before validation?', options: ['any', 'unknown', 'never', 'object'], correctIndex: 1, explanation: 'unknown requires validation or narrowing before use, unlike any which permits unsafe access.' },
      { id: 'ts-2', difficulty: 'Intermediate', prompt: 'How should code handle a discriminated union safely?', options: ['Cast every branch to any', 'Switch on the shared literal discriminator and handle each variant', 'Use non-null assertions everywhere', 'Disable strict mode'], correctIndex: 1, explanation: 'Checking a discriminator lets TypeScript narrow the union to the correct variant.' },
      { id: 'ts-3', difficulty: 'Beginner', prompt: 'What does `strictNullChecks` help prevent?', options: ['Null or undefined values being used without checking', 'All runtime exceptions', 'Slow compilation', 'Duplicate imports'], correctIndex: 0, explanation: 'Strict null checks require code to account for null and undefined explicitly.' },
      {
        id: 'ts-4',
        difficulty: 'Intermediate',
        prompt:
          'What does `const config = { retries: 3 } satisfies Config` give you over `as Config`?',
        options: [
          'It checks the value against Config while keeping the literal type of each property',
          'It skips type checking at runtime',
          'It converts the object into a class',
          'It makes every property optional',
        ],
        correctIndex: 0,
        explanation:
          'satisfies validates the shape against Config without widening the inferred type, so `retries` stays the literal 3 where that precision matters. `as` asserts the type without checking the value, and neither form changes runtime behaviour or the class system.',
      },
      {
        id: 'ts-5',
        difficulty: 'Advanced',
        prompt:
          'Why does a `default: { const exhaustive: never = value; return exhaustive; }` branch help in a switch over a union?',
        options: [
          'It throws at runtime for every input',
          'It makes the compiler fail when a new union member is not handled',
          'It narrows the union to any',
          'It removes the need for a default branch',
        ],
        correctIndex: 1,
        explanation:
          'If every member is handled, the default branch is unreachable and `value` is never, which is assignable. When a new member is added and left unhandled, the assignment fails to compile, so the gap is caught at build time rather than in production.',
      },
    ],
  },
  {
    id: 'react',
    title: 'React & Component Design',
    description: 'State ownership, effects, rendering and reusable component boundaries.',
    icon: Layers,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'React',
    aliases: ['React.js', 'ReactJS', 'Frontend Engineering'],
    questions: [
      { id: 'react-1', difficulty: 'Beginner', prompt: 'When should a value usually be derived during render instead of mirrored in state?', options: ['Whenever it can be calculated from current props or state', 'Only inside a timeout', 'Never', 'Only after a network request'], correctIndex: 0, explanation: 'Derived values avoid redundant state and synchronization bugs.' },
      { id: 'react-2', difficulty: 'Intermediate', prompt: 'What should an effect do when it subscribes to an external event source?', options: ['Leave the subscription active forever', 'Return a cleanup function that unsubscribes', 'Set state in a tight loop', 'Disable dependency checks'], correctIndex: 1, explanation: 'Cleanup prevents duplicate subscriptions and updates after a component is removed.' },
      { id: 'react-3', difficulty: 'Beginner', prompt: 'What is a stable list key used for?', options: ['Styling the row', 'Helping React preserve item identity across list updates', 'Encrypting item data', 'Sorting the list automatically'], correctIndex: 1, explanation: 'Stable keys let React associate rendered elements with the same data items across changes.' },
      {
        id: 'react-4',
        difficulty: 'Intermediate',
        prompt:
          'An input is rendered as `<input value={query} />` with no onChange handler. What happens?',
        options: [
          'The field updates normally',
          'React treats it as read-only and typing does not change the displayed value',
          'The component crashes on mount',
          'The value resets on every render only in production',
        ],
        correctIndex: 1,
        explanation:
          'A value prop without onChange makes the input controlled but unchangeable, and React warns about it. The fix is either to add onChange or to use defaultValue for an uncontrolled field.',
      },
      {
        id: 'react-5',
        difficulty: 'Advanced',
        prompt:
          'A handler calls `setCount(count + 1)` twice in one event. Why may the count increase by one instead of two?',
        options: [
          'Both calls read the same render snapshot; the functional updater setCount((c) => c + 1) reads the latest value',
          'React always discards the second call',
          'count is a constant inside the handler',
          'setState is asynchronous only in class components',
        ],
        correctIndex: 0,
        explanation:
          'Both expressions close over the same `count` from that render, so each computes the same next value. Passing a function lets React apply each update to the previous state in sequence, which is what makes the two increments add up.',
      },
    ],
  },
  {
    id: 'css-architecture',
    title: 'CSS & Frontend Architecture',
    description: 'Responsive layout, accessibility, cascade control and component styling.',
    icon: Layers,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'CSS & Frontend Architecture',
    aliases: ['CSS', 'CSS Architecture', 'Frontend Architecture', 'Web Accessibility'],
    questions: [
      { id: 'css-1', difficulty: 'Intermediate', prompt: 'Which approach best supports a responsive two-column layout that collapses on narrow screens?', options: ['Fixed pixel widths only', 'CSS Grid or Flexbox with a breakpoint or intrinsic sizing', 'Absolute positioning for every item', 'A table layout'], correctIndex: 1, explanation: 'Grid and Flexbox support adaptive layouts without hard-coding a single viewport size.' },
      { id: 'css-2', difficulty: 'Beginner', prompt: 'What is the preferred way to indicate an input error accessibly?', options: ['Change its color only', 'Associate visible error text and expose invalid state to assistive technology', 'Add a red shadow only', 'Use placeholder text as the error'], correctIndex: 1, explanation: 'Color alone is insufficient; semantic state and an associated message communicate the error clearly.' },
      { id: 'css-3', difficulty: 'Intermediate', prompt: 'Why limit unnecessary selector specificity?', options: ['It makes later overrides and component styles easier to reason about', 'It improves image resolution', 'It guarantees perfect contrast', 'It changes document semantics'], correctIndex: 0, explanation: 'Lower, predictable specificity reduces cascade conflicts and makes styling maintainable.' },
      {
        id: 'css-4',
        difficulty: 'Intermediate',
        prompt:
          'Why can `min-height: 100vh` leave content hidden under the browser chrome on a phone?',
        options: [
          'vh units ignore CSS variables',
          'Mobile browser chrome changes the visual viewport, so 100vh can exceed the visible area; 100dvh tracks the dynamic viewport',
          'vh is not supported on mobile browsers',
          'min-height only applies to flex containers',
        ],
        correctIndex: 1,
        explanation:
          'vh is resolved against a viewport that does not shrink when browser bars appear, so a full-height section can extend below the visible area. Dynamic viewport units such as dvh follow the actual visible space. vh is supported on mobile; its value is the problem.',
      },
      {
        id: 'css-5',
        difficulty: 'Intermediate',
        prompt:
          'Why prefer `:focus-visible` over removing the focus outline with `outline: none`?',
        options: [
          'It hides focus from keyboard users',
          'It keeps an indicator for keyboard navigation while not drawing one on every mouse click',
          'It improves colour contrast automatically',
          'It disables the tab order',
        ],
        correctIndex: 1,
        explanation:
          ':focus-visible matches when the browser judges that a visible focus indicator is warranted, typically keyboard interaction. Removing the outline entirely leaves keyboard users unable to see where they are.',
      },
    ],
  },
  {
    id: 'backend-api',
    title: 'Backend APIs & Data Integrity',
    description: 'Validation, authorization, transaction boundaries and reliable API behavior.',
    icon: Server,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Backend API Design',
    aliases: ['API Design', 'Backend Engineering', 'REST APIs', 'Data Integrity'],
    questions: [
      { id: 'api-1', difficulty: 'Beginner', prompt: 'Where should authorization for a user-owned record be enforced?', options: ['Only by hiding the UI button', 'On the server, checking ownership for every request', 'Only in client-side routing', 'In a CSS class'], correctIndex: 1, explanation: 'Clients are untrusted; the server must authorize every protected operation.' },
      { id: 'api-2', difficulty: 'Intermediate', prompt: 'What is a transaction useful for when creating a parent and several child rows?', options: ['Ensuring all related writes commit or roll back together', 'Making validation optional', 'Caching a browser page', 'Increasing JSON size'], correctIndex: 0, explanation: 'Transactions prevent partially written relational structures when one step fails.' },
      { id: 'api-3', difficulty: 'Beginner', prompt: 'What should an API do with malformed input?', options: ['Persist it and fix it later', 'Validate at the boundary and return a clear client error', 'Trust the TypeScript type from the browser', 'Silently ignore all fields'], correctIndex: 1, explanation: 'Runtime validation protects the database because TypeScript types do not validate network payloads.' },
      {
        id: 'api-4',
        difficulty: 'Intermediate',
        prompt:
          'A client retries a payment POST after a timeout. What prevents a duplicate charge?',
        options: [
          'A longer client timeout',
          'An idempotency key stored with the operation result, so the retry returns the original outcome',
          'Changing the request to GET',
          'Disabling retries in the browser only',
        ],
        correctIndex: 1,
        explanation:
          'A timeout does not tell the client whether the write happened. Recording the idempotency key and its result lets a retry return the first outcome instead of charging again. Timeouts and client-side retry settings cannot make the server operation safe on their own.',
      },
      {
        id: 'api-5',
        difficulty: 'Advanced',
        prompt:
          'Two editors save the same record from stale copies. Which mechanism prevents the second save from silently overwriting the first?',
        options: [
          'A version or updated_at check in the UPDATE ... WHERE clause, rejecting a stale write',
          'Sending the whole record again',
          'Caching the record in localStorage',
          'Using PUT instead of POST',
        ],
        correctIndex: 0,
        explanation:
          'Optimistic concurrency compares the version the client read with the stored version, so a write based on stale data affects zero rows and can be reported as a conflict. The HTTP verb and client cache do not detect the conflict.',
      },
    ],
  },
  {
    id: 'machine-learning',
    title: 'Machine Learning & Evaluation',
    description: 'Data leakage, validation strategy, metrics and responsible model evaluation.',
    icon: Brain,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Machine Learning',
    aliases: ['AI/ML', 'AI/ML Engineer', 'Model Evaluation', 'Machine Learning Engineering'],
    questions: [
      { id: 'ml-1', difficulty: 'Intermediate', prompt: 'Why must preprocessing be fit only on the training split?', options: ['To prevent information leakage from validation or test data', 'To increase the number of labels', 'To guarantee accuracy of 100%', 'To eliminate feature engineering'], correctIndex: 0, explanation: 'Fitting transformations on held-out data leaks information and creates an overly optimistic evaluation.' },
      { id: 'ml-2', difficulty: 'Advanced', prompt: 'For a rare positive class, why can accuracy be misleading?', options: ['A model can predict only the majority class and still score highly', 'Accuracy cannot be calculated', 'The dataset has too many columns', 'It always equals recall'], correctIndex: 0, explanation: 'Class imbalance can make a trivial majority-class predictor appear accurate while missing the target class.' },
      { id: 'ml-3', difficulty: 'Intermediate', prompt: 'What is a useful purpose of a separate test set?', options: ['Repeatedly tune every model parameter', 'Estimate final generalization after choices are made on training/validation data', 'Balance labels automatically', 'Replace data quality checks'], correctIndex: 1, explanation: 'A held-out test set provides a less biased final evaluation when it is not repeatedly used for tuning.' },
      {
        id: 'ml-4',
        difficulty: 'Intermediate',
        prompt:
          'A model scores well offline but poorly online because one feature is computed with a different time window in the batch and serving pipelines. What is this called?',
        options: ['Regularization', 'Training-serving skew', 'Class imbalance', 'Overfitting to the test set'],
        correctIndex: 1,
        explanation:
          'Training-serving skew is the mismatch between how features are produced for training and how they are produced at inference. Regularization and class imbalance are modelling concerns, and test-set overfitting would not by itself explain a pipeline discrepancy.',
      },
      {
        id: 'ml-5',
        difficulty: 'Advanced',
        prompt:
          'Ground-truth labels arrive weeks late. What should monitoring alert on in the meantime?',
        options: [
          'Only final accuracy',
          'Input distribution drift and prediction distribution shifts, which can move before labels arrive',
          'The number of model files',
          'The training job duration',
        ],
        correctIndex: 1,
        explanation:
          'When labels lag, accuracy cannot be computed in time to catch a regression. Feature and prediction distributions are available immediately and can reveal that the world has moved away from the training data.',
      },
    ],
  },
  {
    id: 'product-management',
    title: 'Product Management',
    description: 'Problem discovery, prioritization, outcome metrics and product experiments.',
    icon: Briefcase,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Product Management',
    questions: [
      { id: 'pm-1', difficulty: 'Beginner', prompt: 'What should a product team validate before committing to a large feature?', options: ['That the problem is meaningful to a defined user group', 'That the feature has the most settings', 'That a competitor has a longer roadmap', 'That engineering has spare capacity only'], correctIndex: 0, explanation: 'Strong product decisions start with evidence about user problems and desired outcomes.' },
      { id: 'pm-2', difficulty: 'Intermediate', prompt: 'Which is the strongest outcome metric for a new onboarding flow?', options: ['Number of buttons', 'Share of eligible users who successfully reach the activation event', 'Lines of code', 'Number of internal meetings'], correctIndex: 1, explanation: 'An outcome metric measures whether users achieve the intended value, rather than the amount of output.' },
      { id: 'pm-3', difficulty: 'Advanced', prompt: 'When two requests compete for capacity, what is a sound prioritization step?', options: ['Compare user impact, confidence, effort and strategic fit', 'Choose the loudest requester automatically', 'Ship both without testing', 'Ignore dependencies'], correctIndex: 0, explanation: 'Transparent prioritization weighs impact and evidence against cost and dependencies.' },
      {
        id: 'pm-4',
        difficulty: 'Intermediate',
        prompt: "Which is a leading indicator for a subscription product's retention?",
        options: [
          'Monthly churn reported last quarter',
          'Share of new users reaching the activation event in their first week',
          'Annual revenue',
          'Headcount',
        ],
        correctIndex: 1,
        explanation:
          'Activation happens before renewal, so it can warn about retention while there is still time to act. Churn is lagging, revenue mixes many factors, and headcount says nothing about user behaviour.',
      },
      {
        id: 'pm-5',
        difficulty: 'Advanced',
        prompt: 'A team has one quarter to test a risky assumption. What is the strongest first move?',
        options: [
          'Build the full feature behind a flag',
          'Run the smallest test that could falsify the assumption, such as a prototype or concierge test',
          'Increase marketing spend',
          'Add more options to the roadmap',
        ],
        correctIndex: 1,
        explanation:
          'The cheapest useful evidence is the test that can prove the assumption wrong before the team invests in the whole feature. Building everything first delays learning and makes sunk cost harder to ignore.',
      },
    ],
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity Fundamentals',
    description: 'Threat modeling, access control, secure input handling and incident response.',
    icon: ShieldCheck,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Cybersecurity',
    aliases: ['Security', 'Cyber Security', 'Information Security'],
    questions: [
      { id: 'sec-1', difficulty: 'Beginner', prompt: 'What does least privilege mean?', options: ['Give each identity only the permissions needed for its task', 'Share one admin account', 'Disable audit logs', 'Grant broad access to avoid support requests'], correctIndex: 0, explanation: 'Least privilege limits the damage from mistakes or compromised credentials.' },
      { id: 'sec-2', difficulty: 'Beginner', prompt: 'How should an application handle user-supplied SQL values?', options: ['Concatenate them into SQL strings', 'Use parameterized queries and validate the input', 'Trust hidden form fields', 'Escape only spaces'], correctIndex: 1, explanation: 'Parameterized queries separate data from SQL syntax and prevent injection attacks.' },
      { id: 'sec-3', difficulty: 'Intermediate', prompt: 'What is a sensible first response to a confirmed credential leak?', options: ['Rotate/revoke the credential and investigate scope and access logs', 'Delete the alert', 'Post the secret in a ticket', 'Wait until the next release'], correctIndex: 0, explanation: 'Containment starts with revocation, followed by scoped investigation and remediation.' },
      {
        id: 'sec-4',
        difficulty: 'Intermediate',
        prompt:
          'A comment field stores user HTML and renders it to other users. Which control most directly prevents stored XSS?',
        options: [
          'Validating the input length only',
          'Context-aware output encoding plus a restrictive Content-Security-Policy',
          'Using POST instead of GET',
          'Hashing the comment text',
        ],
        correctIndex: 1,
        explanation:
          'Stored XSS executes when another user views the content, so the decisive control is encoding the data for the context it is rendered into, backed by CSP. Length checks, the HTTP verb and hashing do not stop markup from being interpreted.',
      },
      {
        id: 'sec-5',
        difficulty: 'Advanced',
        prompt:
          'Why are passkeys more resistant to phishing than SMS codes?',
        options: [
          'SMS is always encrypted end to end',
          'Passkeys are bound to the origin, so a lookalike site cannot replay the credential',
          'Passkeys never expire',
          'SMS codes are too short to send',
        ],
        correctIndex: 1,
        explanation:
          'A passkey assertion is scoped to the legitimate origin, so a phishing domain cannot use it even if the user is tricked into visiting. An SMS code can be typed into any site that asks for it.',
      },
    ],
  },
  {
    id: 'ux-design',
    title: 'UX Research & Design',
    description: 'Research methods, usability, accessibility and evidence-led design decisions.',
    icon: Palette,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'UX Research & Design',
    aliases: ['UI/UX Designer', 'UX Design', 'User Experience', 'UI Design'],
    questions: [
      { id: 'ux-1', difficulty: 'Intermediate', prompt: 'What is the main value of observing representative users complete a task?', options: ['It reveals friction in the real workflow', 'It proves every user behaves identically', 'It replaces accessibility testing', 'It guarantees a visual style'], correctIndex: 0, explanation: 'Usability observation surfaces where users hesitate, misunderstand or fail to complete a task.' },
      { id: 'ux-2', difficulty: 'Intermediate', prompt: 'Which is the best way to evaluate an accessibility concern?', options: ['Rely on color preference', 'Combine automated checks with keyboard and assistive-technology testing', 'Ask only the design team', 'Hide the control'], correctIndex: 1, explanation: 'Automated tests catch only some issues; manual interaction and assistive-technology checks are also needed.' },
      { id: 'ux-3', difficulty: 'Beginner', prompt: 'What makes a research question less leading?', options: ['It suggests the preferred answer', 'It invites participants to describe their experience without implying a judgment', 'It asks for praise', 'It combines unrelated questions'], correctIndex: 1, explanation: 'Neutral questions reduce bias and help participants report their own behavior and reasoning.' },
      {
        id: 'ux-4',
        difficulty: 'Intermediate',
        prompt: 'Five users fail the same step in a usability test. What is the sound conclusion?',
        options: [
          'Exactly 100% of all users will fail',
          'There is a recurring friction point worth fixing; the study is qualitative, not a population estimate',
          'The sample is too small to observe anything',
          'The users need more training',
        ],
        correctIndex: 1,
        explanation:
          'Repeated failure in a small qualitative sample is strong evidence of a design problem, but it does not estimate a population rate. The useful next step is to diagnose the step, then verify the fix with another round.',
      },
      {
        id: 'ux-5',
        difficulty: 'Advanced',
        prompt: 'Which set best measures whether a redesign made a task easier?',
        options: [
          'Average satisfaction score alone',
          'Task success rate, time on task and error recovery, compared on the same tasks',
          'Number of pixels changed',
          'Stakeholder approval count',
        ],
        correctIndex: 1,
        explanation:
          'Ease is behavioural: whether people complete the task, how long it takes and whether they can recover from mistakes. Satisfaction is useful context but can be high while the task still fails.',
      },
    ],
  },
  {
    id: 'digital-marketing',
    title: 'Digital Marketing Analytics',
    description: 'Attribution, funnel measurement, campaign testing and privacy-aware analytics.',
    icon: Megaphone,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Digital Marketing Analytics',
    aliases: ['Digital Marketing', 'Marketing Analytics', 'SEO', 'Campaign Analytics'],
    questions: [
      { id: 'mkt-1', difficulty: 'Beginner', prompt: 'Why use consistent campaign UTM parameters?', options: ['To make campaign traffic identifiable in analytics', 'To increase organic rankings automatically', 'To bypass consent requirements', 'To guarantee a conversion'], correctIndex: 0, explanation: 'Consistent campaign parameters support reliable source and campaign reporting.' },
      { id: 'mkt-2', difficulty: 'Intermediate', prompt: 'What is a conversion rate?', options: ['Conversions divided by an explicitly defined eligible audience or visits', 'Total impressions multiplied by cost', 'The number of campaign names', 'Revenue minus all expenses'], correctIndex: 0, explanation: 'The denominator must be defined, since sessions, users and leads produce different rates.' },
      { id: 'mkt-3', difficulty: 'Advanced', prompt: 'When comparing campaign performance, what should be checked before declaring a winner?', options: ['Comparable audience, attribution window, spend and statistical uncertainty', 'Only which one has more impressions', 'The ad color', 'Whether the campaign name is shorter'], correctIndex: 0, explanation: 'Fair comparisons require comparable measurement conditions and consideration of uncertainty.' },
      {
        id: 'mkt-4',
        difficulty: 'Intermediate',
        prompt:
          'Last-click attribution gives a brand-search campaign most of the credit. What is the main risk?',
        options: [
          'It overstates the campaign that closes demand and understates earlier touchpoints',
          'It measures too few conversions',
          'It double-counts organic traffic',
          'It cannot report clicks',
        ],
        correctIndex: 0,
        explanation:
          'Last-click assigns the whole conversion to the final interaction, which usually favours branded search and retargeting over the channels that created awareness. It still counts conversions and clicks; the problem is the credit, not the counting.',
      },
      {
        id: 'mkt-5',
        difficulty: 'Advanced',
        prompt: 'Privacy changes block some cross-site measurement. What is a defensible response?',
        options: [
          'Invent the missing conversions',
          'Use consented first-party measurement plus experiments or modelled estimates that are clearly labelled',
          'Ignore consent to keep dashboards stable',
          'Report only impressions',
        ],
        correctIndex: 1,
        explanation:
          'First-party, consented data and controlled experiments provide evidence that survives tracking restrictions, and any model should be labelled as an estimate. Fabricating data or bypassing consent is neither accurate nor lawful.',
      },
    ],
  },
  {
    id: 'business-analysis',
    title: 'Business Analysis',
    description: 'Requirements discovery, process mapping, acceptance criteria and stakeholder alignment.',
    icon: ClipboardList,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Business Analysis',
    aliases: ['Business Analyst', 'Requirements Analysis', 'Business Process Modeling'],
    questions: [
      { id: 'ba-1', difficulty: 'Beginner', prompt: 'What makes an acceptance criterion useful?', options: ['It is observable and testable against the stated outcome', 'It describes a vague aspiration', 'It is hidden from stakeholders', 'It changes after every test'], correctIndex: 0, explanation: 'Testable criteria align delivery and validation around an observable result.' },
      { id: 'ba-2', difficulty: 'Intermediate', prompt: 'What should a process map help stakeholders identify?', options: ['Handoffs, decisions, delays and exception paths', 'Only the department names', 'The color palette', 'Individual performance rankings'], correctIndex: 0, explanation: 'Process maps expose how work flows and where bottlenecks or control gaps occur.' },
      { id: 'ba-3', difficulty: 'Advanced', prompt: 'How should conflicting stakeholder requirements be handled?', options: ['Document the underlying needs, constraints and decision owner, then facilitate resolution', 'Implement both without clarification', 'Choose the newest email', 'Delete one requirement'], correctIndex: 0, explanation: 'Clarifying needs, constraints and decision rights supports an auditable resolution.' },
      {
        id: 'ba-4',
        difficulty: 'Intermediate',
        prompt: "A stakeholder asks for 'a dashboard'. What should an analyst clarify first?",
        options: [
          'The chart colours',
          'The decision the dashboard should support and the questions it must answer',
          'The server vendor',
          'The number of filters',
        ],
        correctIndex: 1,
        explanation:
          'The decision and the questions determine the metrics, grain and layout. Starting from visuals produces a dashboard that looks complete but does not change any decision.',
      },
      {
        id: 'ba-5',
        difficulty: 'Advanced',
        prompt:
          'A regulator asks how a requirement changed between discovery and release. Which artefact answers that fastest?',
        options: [
          'A requirements traceability matrix linking need, requirement, build and test',
          'The sprint burndown chart',
          'The team chat history',
          'The deployment log',
        ],
        correctIndex: 0,
        explanation:
          'A traceability matrix records the links and changes from the original need through delivery and verification. A burndown shows remaining work, chat is unstructured, and a deployment log records releases rather than requirements.',
      },
    ],
  },
  {
    id: 'qa-automation',
    title: 'QA & Test Automation',
    description: 'Reliable tests, the test pyramid, user-visible assertions and isolation.',
    icon: ClipboardList,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Test Automation',
    aliases: [
      'QA Engineering',
      'Quality Assurance',
      'Software Testing',
      'Selenium',
      'Playwright',
      'Cypress',
    ],
    visual: 'software-engineering',
    questions: [
      {
        id: 'qa-1',
        difficulty: 'Beginner',
        prompt: 'A UI test passes locally but fails intermittently in CI. Which fix addresses the usual cause?',
        options: [
          'Add a fixed 10-second sleep before every click',
          'Replace fixed sleeps with waits for the specific condition the test needs',
          'Run the test less often',
          'Increase the CI machine size',
        ],
        correctIndex: 1,
        explanation:
          'Intermittent failures usually come from racing the application: the test acts before the page or the request is ready. Waiting for a named condition is both faster and more reliable than sleeping, which is either too short or wastes time.',
      },
      {
        id: 'qa-2',
        difficulty: 'Intermediate',
        prompt: 'Why does the test pyramid put more unit tests than end-to-end tests?',
        options: [
          'Unit tests are slower but more realistic',
          'Unit tests are fast and pinpoint failures, while end-to-end tests are slow and brittle and are reserved for critical journeys',
          'End-to-end tests cannot catch regressions',
          'Unit tests require a browser',
        ],
        correctIndex: 1,
        explanation:
          'Fast, focused tests give quick feedback and localise the failure. Browser journeys exercise the whole stack but cost more to run and maintain, so they cover the few paths where integration risk is highest.',
      },
      {
        id: 'qa-3',
        difficulty: 'Intermediate',
        prompt: 'Which assertion makes a test survive a visual redesign?',
        options: [
          'Assert the exact CSS class of the button',
          'Assert the user-visible outcome, such as the confirmation message or the saved record',
          'Assert the DOM node order',
          'Assert the pixel position of the button',
        ],
        correctIndex: 1,
        explanation:
          'Behaviour-level assertions describe what the product promises, so refactoring markup does not break them. Class names, node order and pixel positions are implementation details that change without any behavioural regression.',
      },
      {
        id: 'qa-4',
        difficulty: 'Advanced',
        prompt: 'API tests share one database row and pass alone but fail in parallel. What is the correct fix?',
        options: [
          'Run them serially forever',
          'Give each test its own fixture data and clean up, so order and parallelism do not matter',
          'Retry until they pass',
          'Disable the failing assertion',
        ],
        correctIndex: 1,
        explanation:
          'Shared mutable state makes tests depend on execution order. Isolated fixtures remove that coupling and keep the suite fast and trustworthy; serialising the suite hides the design problem, and retries or disabled assertions hide real failures.',
      },
      {
        id: 'qa-5',
        difficulty: 'Intermediate',
        prompt: 'A production bug is confirmed. What should happen before the fix ships?',
        options: [
          'Fix it and rely on manual checking',
          'Add a failing regression test that reproduces the bug, then make it pass with the fix',
          'Delete the affected test data',
          'Increase the release cadence',
        ],
        correctIndex: 1,
        explanation:
          'A regression test proves the bug existed and that the fix addresses it, and it prevents the same defect from returning. Manual checking leaves no durable guard, and removing data hides the evidence.',
      },
    ],
  },
  {
    id: 'devops-cicd',
    title: 'DevOps, Docker & CI/CD',
    description: 'Containers, build pipelines, secret handling and low-risk releases.',
    icon: Server,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'DevOps',
    aliases: [
      'DevOps Engineering',
      'CI/CD',
      'Docker',
      'Kubernetes',
      'Cloud Infrastructure',
      'Infrastructure as Code',
      'Terraform',
    ],
    visual: 'devops',
    questions: [
      {
        id: 'dev-1',
        difficulty: 'Beginner',
        prompt: 'What is the difference between a container image and a running container?',
        options: [
          'An image is the immutable template; a container is a running instance of it',
          'A container is stored in the registry and an image runs',
          'They are the same thing',
          'An image only contains environment variables',
        ],
        correctIndex: 0,
        explanation:
          'The image is the packaged filesystem and configuration; starting it creates a container with its own runtime state. Registries store images, not running containers.',
      },
      {
        id: 'dev-2',
        difficulty: 'Intermediate',
        prompt: 'Why use a multi-stage Docker build?',
        options: [
          'To keep build tools out of the final image, reducing size and attack surface',
          'To run two containers at once',
          'To avoid writing a Dockerfile',
          'To disable layer caching',
        ],
        correctIndex: 0,
        explanation:
          'Building in one stage and copying only the artefacts into a smaller runtime stage leaves compilers, package caches and dev dependencies behind. It does not run extra containers, and layer caching still applies.',
      },
      {
        id: 'dev-3',
        difficulty: 'Intermediate',
        prompt: 'Where should a CI pipeline get a deployment token?',
        options: [
          'Committed in the repository for reproducibility',
          'From the CI secret store, injected at run time and masked in logs',
          'Inside the Docker image layers',
          'In a public build log',
        ],
        correctIndex: 1,
        explanation:
          'Secrets belong in the platform secret store, scoped to the pipeline and never baked into images or logs. A committed token is exposed to everyone with repository access and survives in history.',
      },
      {
        id: 'dev-4',
        difficulty: 'Advanced',
        prompt: 'Why does a canary release reduce deployment risk compared with replacing every instance at once?',
        options: [
          'It exposes the new version to a small slice first, so a regression affects fewer users and can be rolled back quickly',
          'It removes the need for monitoring',
          'It guarantees the release has no bugs',
          'It makes the build faster',
        ],
        correctIndex: 0,
        explanation:
          'A canary limits the blast radius and gives the team real signals before full rollout. It does not remove the need to monitor, cannot guarantee correctness, and does not change build duration.',
      },
      {
        id: 'dev-5',
        difficulty: 'Intermediate',
        prompt: 'Why define infrastructure in code and review it like application code?',
        options: [
          'It makes environments reproducible, reviewable and recoverable instead of manually configured',
          'It removes the need for cloud security',
          'It guarantees zero downtime',
          'It makes deployments slower on purpose',
        ],
        correctIndex: 0,
        explanation:
          'Versioned infrastructure definitions can be reviewed, replayed and rolled back, and they expose drift from the intended state. Security and availability still require design and testing.',
      },
    ],
  },
  {
    id: 'data-warehousing',
    title: 'Data Modeling & Warehousing',
    description: 'Fact and dimension design, incremental loads, grain and late-arriving data.',
    icon: Layers,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Data Modeling',
    aliases: [
      'Data Warehousing',
      'dbt',
      'ETL',
      'Data Pipelines',
      'Analytics Engineering',
      'SQL Modeling',
    ],
    visual: 'data-analysis',
    questions: [
      {
        id: 'dw-1',
        difficulty: 'Beginner',
        prompt: 'In a star schema, what does a fact table usually store?',
        options: [
          'Descriptive attributes such as customer name and region',
          'Measurable events with foreign keys to dimensions, such as order revenue by date and customer',
          'Only the database schema',
          'Application logs',
        ],
        correctIndex: 1,
        explanation:
          'Facts hold the measurable event at a declared grain and reference dimensions by key. Descriptive attributes belong in dimensions, which keeps the fact table narrow and consistent.',
      },
      {
        id: 'dw-2',
        difficulty: 'Intermediate',
        prompt: 'Why must an incremental load be idempotent?',
        options: [
          'So rerunning the same batch does not duplicate or corrupt rows',
          'So it always runs faster',
          'So it skips validation',
          'So it writes to every table',
        ],
        correctIndex: 0,
        explanation:
          'Pipelines fail and are retried. An idempotent load can be replayed safely because it merges or replaces deterministically instead of appending the same rows again.',
      },
      {
        id: 'dw-3',
        difficulty: 'Intermediate',
        prompt: 'Why declare the grain of a fact table before adding measures?',
        options: [
          'It determines what one row means, which prevents double counting when the table is joined',
          'It sets the column order',
          'It selects the database engine',
          'It removes the need for keys',
        ],
        correctIndex: 0,
        explanation:
          'Grain is the contract for what a row represents. Without it, joins to several dimensions can multiply rows and inflate every sum built on the table.',
      },
      {
        id: 'dw-4',
        difficulty: 'Advanced',
        prompt:
          'A daily fact table receives a late-arriving order for a date already loaded. Which approach keeps one row per order without duplicating history?',
        options: [
          'Append the late row and accept duplicates',
          'Merge or deduplicate on the order key with a deterministic rule, then recompute affected aggregates',
          'Delete the whole partition',
          'Ignore late rows',
        ],
        correctIndex: 1,
        explanation:
          'A key-based merge makes the load repeatable and keeps a single row per order, after which the affected aggregate partition is rebuilt. Appending duplicates the order, deleting the partition loses real history, and ignoring the row loses revenue.',
      },
      {
        id: 'dw-5',
        difficulty: 'Intermediate',
        prompt: 'Why keep raw or staged data before transforming it?',
        options: [
          'So pipelines can be replayed and audited when a transformation or source changes',
          'To double storage cost deliberately',
          'Because raw data is always cleaner',
          'To avoid defining a schema',
        ],
        correctIndex: 0,
        explanation:
          'A replayable raw layer lets the team rebuild marts after a logic fix and investigate what actually arrived. It does not remove the need for a schema, and raw data is not automatically clean.',
      },
    ],
  },
  {
    id: 'finance-accounting',
    title: 'Finance & Accounting Fundamentals',
    description: 'Financial statements, margins, cash flow and investment appraisal.',
    icon: FileSpreadsheet,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Financial Analysis',
    aliases: [
      'Accounting',
      'Financial Modeling',
      'FP&A',
      'Corporate Finance',
      'Bookkeeping',
      'Finance',
    ],
    visual: 'finance',
    questions: [
      {
        id: 'fin-1',
        difficulty: 'Beginner',
        prompt: 'Which equation must hold on a balance sheet?',
        options: [
          'Assets = Liabilities + Equity',
          'Revenue = Assets - Liabilities',
          'Cash = Profit',
          'Equity = Revenue + Expenses',
        ],
        correctIndex: 0,
        explanation:
          'Every asset is financed by either a liability or owners’ equity, so the two sides always balance. The other equations mix flow measures such as revenue and profit with balances.',
      },
      {
        id: 'fin-2',
        difficulty: 'Beginner',
        prompt: 'A company reports gross profit of 40 on revenue of 100. What is the gross margin?',
        options: ['40%', '60%', '2.5%', '140%'],
        correctIndex: 0,
        explanation:
          'Gross margin is gross profit divided by revenue, so 40 / 100 = 40%. 60% is the cost of sales share, and the other figures do not follow from the definition.',
      },
      {
        id: 'fin-3',
        difficulty: 'Intermediate',
        prompt: 'Why can a profitable company still run out of cash?',
        options: [
          'Profit is an accounting measure; cash can be tied up in receivables and inventory or consumed by the timing of payments',
          'Profit always equals cash',
          'Because revenue is not recorded',
          'Because expenses are optional',
        ],
        correctIndex: 0,
        explanation:
          'Accrual profit recognises revenue when earned, not when collected. A growing company can be profitable while its cash sits in unpaid invoices and stock, or while it pays suppliers before customers pay it.',
      },
      {
        id: 'fin-4',
        difficulty: 'Advanced',
        prompt: 'A project has a positive net present value at the company’s cost of capital. What does that mean?',
        options: [
          'It is expected to create value above the required return, after discounting future cash flows',
          'It will break even in year one',
          'It has no risk',
          'It should be rejected',
        ],
        correctIndex: 0,
        explanation:
          'NPV discounts expected future cash flows at the required return; a positive result means the project is expected to earn more than that hurdle. It says nothing about the payback year and does not remove risk.',
      },
      {
        id: 'fin-5',
        difficulty: 'Intermediate',
        prompt: 'Which of these is normally an operating expense rather than a capital expense?',
        options: [
          'Office rent and staff salaries',
          'Buying a delivery van',
          'Building a new warehouse',
          'Purchasing production machinery',
        ],
        correctIndex: 0,
        explanation:
          'Rent and salaries are consumed in running the business and are expensed as incurred. Vehicles, buildings and machinery are capitalised and depreciated over their useful lives.',
      },
    ],
  },
  {
    id: 'sales-customer',
    title: 'Sales & Customer Success',
    description: 'Discovery, qualification, retention signals and principled negotiation.',
    icon: MessageSquare,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Sales',
    aliases: [
      'Account Management',
      'Customer Success',
      'Business Development',
      'Sales Operations',
      'Negotiation',
      'Sales Representative',
    ],
    visual: 'sales',
    questions: [
      {
        id: 'sal-1',
        difficulty: 'Beginner',
        prompt: 'Which is the strongest discovery question?',
        options: [
          'Do you like our product?',
          'What happens today when your team needs to approve a purchase, and where does it slow down?',
          'Would you buy this?',
          'Is price your only concern?',
        ],
        correctIndex: 1,
        explanation:
          'The strongest question asks for a concrete description of the current process and its friction, which produces evidence. Yes/no and leading questions invite polite answers that do not help qualify the opportunity.',
      },
      {
        id: 'sal-2',
        difficulty: 'Intermediate',
        prompt: 'What does qualification usually establish before investing in a long sales cycle?',
        options: [
          'A real need, a decision process and authority, and a credible timeline',
          'The prospect’s favourite colour',
          'That the prospect has no alternatives',
          'That the discount is agreed',
        ],
        correctIndex: 0,
        explanation:
          'Qualification tests whether there is a problem worth solving, who decides, how the purchase happens and whether the timing is real. Without those, effort goes into deals that cannot close.',
      },
      {
        id: 'sal-3',
        difficulty: 'Intermediate',
        prompt: 'Which is a leading indicator of churn for a SaaS account?',
        options: [
          'A decline in active usage and unanswered support tickets',
          'Last year’s renewal date',
          'The company’s stock price',
          'The number of invoices ever sent',
        ],
        correctIndex: 0,
        explanation:
          'Falling usage and unresolved support problems appear before renewal and can still be acted on. The renewal date is a deadline, and the other signals are unrelated to the account’s engagement.',
      },
      {
        id: 'sal-4',
        difficulty: 'Advanced',
        prompt: 'A buyer asks for a 20% discount to close today. What is the most defensible response?',
        options: [
          'Give the discount immediately to avoid losing the deal',
          'Diagnose the underlying objection and tie any concession to a concrete trade-off such as term length or scope',
          'Refuse and end the call',
          'Offer a bigger discount',
        ],
        correctIndex: 1,
        explanation:
          'A discount request is often a signal about perceived value, budget or risk. Understanding it and trading any concession for something of value protects margin and keeps the negotiation honest; immediate discounting teaches the buyer that list price is fictional.',
      },
      {
        id: 'sal-5',
        difficulty: 'Intermediate',
        prompt: 'A customer says “this is too expensive”. What is the most useful next question?',
        options: [
          'Would a 30% discount close it today?',
          'Compared with what alternative or expected outcome is it too expensive?',
          'Do you have any budget at all?',
          'Can we speak to your manager?',
        ],
        correctIndex: 1,
        explanation:
          '“Too expensive” is relative: it may mean over budget, priced above a competitor, or not worth the perceived value. Asking for the comparison uncovers the real objection instead of discounting blindly.',
      },
    ],
  },
  {
    id: 'project-delivery',
    title: 'Project & Stakeholder Delivery',
    description: 'Scheduling, risk, change control and reporting that supports decisions.',
    icon: Briefcase,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Project Management',
    aliases: [
      'Agile',
      'Scrum',
      'Delivery Management',
      'Operations Management',
      'Stakeholder Management',
      'Project Manager',
    ],
    visual: 'project-management',
    questions: [
      {
        id: 'prj-1',
        difficulty: 'Beginner',
        prompt: 'What is the critical path in a project schedule?',
        options: [
          'The longest sequence of dependent tasks, which sets the shortest possible duration',
          'The list of tasks with the highest budget',
          'Every task assigned to the manager',
          'The tasks that can slip without affecting the date',
        ],
        correctIndex: 0,
        explanation:
          'The critical path is the longest dependent chain, so any delay on it delays the project. Tasks with float can slip without moving the finish date.',
      },
      {
        id: 'prj-2',
        difficulty: 'Beginner',
        prompt: 'What is the difference between a risk and an issue?',
        options: [
          'A risk may happen; an issue is already happening and needs action',
          'A risk is always technical; an issue is always financial',
          'They are the same',
          'An issue is only tracked after launch',
        ],
        correctIndex: 0,
        explanation:
          'A risk is an uncertain future event with a likelihood and impact; once it occurs it becomes an issue to resolve. Tracking both in one register without that distinction hides what needs action now.',
      },
      {
        id: 'prj-3',
        difficulty: 'Intermediate',
        prompt: 'A stakeholder keeps adding small requests mid-sprint. What is the sound response?',
        options: [
          'Absorb every request silently',
          'Log the request, make its impact on scope and date visible, and route the decision through the agreed change process',
          'Refuse all changes permanently',
          'Extend the sprint without telling anyone',
        ],
        correctIndex: 1,
        explanation:
          'Small unrecorded additions are how scope creep hides. Making the cost visible and using the agreed change route keeps the decision with the right owner; silently absorbing or blanket-refusing both damage trust.',
      },
      {
        id: 'prj-4',
        difficulty: 'Advanced',
        prompt: 'Which status report is most useful to a steering group?',
        options: [
          'A list of everything the team did last week',
          'Progress against outcomes, top risks with owners, and the specific decisions needed from the group',
          'A screenshot of the task board',
          'The number of meetings held',
        ],
        correctIndex: 1,
        explanation:
          'A steering group exists to make decisions and remove blockers, so the report should surface outcome progress, owned risks and the asks. Activity lists and board screenshots describe work without supporting a decision.',
      },
      {
        id: 'prj-5',
        difficulty: 'Intermediate',
        prompt: 'A key dependency slips and the critical path moves. What should happen next?',
        options: [
          'Absorb the slip silently and hope to recover',
          'Update the forecast, show the new date and options, and communicate the impact to the decision owners',
          'Remove the dependency from the plan',
          'Add the team to more meetings',
        ],
        correctIndex: 1,
        explanation:
          'A changed critical path changes the delivery date and possibly the scope choices. Making the forecast and options visible lets the right people decide; hiding the slip only delays the decision.',
      },
    ],
  },
  {
    id: 'seo-content',
    title: 'SEO & Content Marketing',
    description: 'Search intent, technical foundations, content quality and consolidation.',
    icon: Globe,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'SEO',
    aliases: [
      'Search Engine Optimization',
      'Content Marketing',
      'Content Strategy',
      'Keyword Research',
      'Social Media Marketing',
      'Marketing Strategy',
      'Brand Strategy',
      'Copywriting',
    ],
    visual: 'digital-marketing',
    questions: [
      {
        id: 'seo-1',
        difficulty: 'Beginner',
        prompt: 'A page ranks on the first page but receives few clicks. What should be improved first?',
        options: [
          'The server response time',
          'The title and meta description so they match what the searcher is looking for',
          'The number of internal links on the homepage',
          'The image file names',
        ],
        correctIndex: 1,
        explanation:
          'Ranking already earns the impression; the click depends on whether the snippet promises the answer the searcher wants. Speed and links matter for ranking, but they do not fix a snippet that reads like the wrong result.',
      },
      {
        id: 'seo-2',
        difficulty: 'Intermediate',
        prompt: 'Why can a fast, fully crawlable page still fail to rank for a query?',
        options: [
          'Technical health is necessary but not sufficient; the content may not satisfy the searcher’s intent',
          'Google only ranks pages with images',
          'A page must be at least 5,000 words',
          'Meta keywords decide the ranking',
        ],
        correctIndex: 0,
        explanation:
          'Crawlability and speed remove barriers; relevance and usefulness earn the position. Length, images and meta keywords are not requirements, and a technically clean page about the wrong thing will not rank for the query.',
      },
      {
        id: 'seo-3',
        difficulty: 'Intermediate',
        prompt: 'A site moves its articles to new URLs. What most directly protects existing rankings?',
        options: [
          'Deleting the old URLs immediately',
          '301 redirects from each old URL to its new equivalent, with updated internal links and sitemap',
          'Adding the new URLs to a social post',
          'Changing the site logo',
        ],
        correctIndex: 1,
        explanation:
          'A permanent redirect passes users and most ranking signals to the new address, and updating internal links prevents the redirect from becoming a permanent dependency. Deleting the old URLs first turns the move into a 404.',
      },
      {
        id: 'seo-4',
        difficulty: 'Advanced',
        prompt: 'Two pages compete for the same query and split internal links. What is the sound fix?',
        options: [
          'Keep both and add more keywords to each',
          'Consolidate the stronger content into one page and redirect the other to it',
          'Block one page in robots.txt',
          'Remove internal links from both pages',
        ],
        correctIndex: 1,
        explanation:
          'Keyword cannibalisation usually resolves by making one page the authoritative answer and redirecting the duplicate, which consolidates links and signals. Blocking or stripping links hides the page without transferring its value, and adding keywords deepens the overlap.',
      },
      {
        id: 'seo-5',
        difficulty: 'Intermediate',
        prompt: 'A new article has no internal links pointing to it. What is the likely consequence?',
        options: [
          'Search engines and users have a harder time discovering it, weakening its visibility',
          'It will rank first because it is new',
          'Its page speed will drop automatically',
          'Its meta description will be ignored',
        ],
        correctIndex: 0,
        explanation:
          'Internal links are discovery paths for crawlers and navigation paths for readers. Without them, a page depends on the sitemap alone and receives little of the site’s authority.',
      },
    ],
  },
  {
    id: 'supply-chain',
    title: 'Supply Chain & Inventory',
    description: 'Demand variability, reorder points, supplier risk and landed cost.',
    icon: Briefcase,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Supply Chain Management',
    aliases: [
      'Demand Forecasting',
      'Inventory Management',
      'Procurement',
      'Logistics',
      'Warehouse Management',
      'ERP Systems',
      'Supply Planning',
    ],
    visual: 'operations',
    questions: [
      {
        id: 'sc-1',
        difficulty: 'Beginner',
        prompt: 'What is safety stock for?',
        options: [
          'Buffer against demand and lead-time variability so service levels hold',
          'Stock reserved for the annual audit',
          'Product waiting to be returned',
          'Inventory that has passed its expiry date',
        ],
        correctIndex: 0,
        explanation:
          'Safety stock absorbs unexpected demand or supply delay between ordering and receiving. It is not an audit reserve, returns stock or expired inventory.',
      },
      {
        id: 'sc-2',
        difficulty: 'Intermediate',
        prompt: 'Which two inputs drive a basic reorder point?',
        options: [
          'The marketing budget and headcount',
          'Expected demand during the lead time plus safety stock',
          'The warehouse rent and tax rate',
          'The number of suppliers and their country',
        ],
        correctIndex: 1,
        explanation:
          'An order must cover demand until the next delivery arrives, with safety stock covering variability. Cost and supplier counts influence decisions but do not set the quantity threshold.',
      },
      {
        id: 'sc-3',
        difficulty: 'Intermediate',
        prompt: 'A supplier’s lead time doubles with no change in demand. What is the first consequence to plan for?',
        options: [
          'The reorder point rises and stockout risk increases unless orders are placed earlier or buffers increase',
          'Inventory holding cost falls immediately',
          'The product price automatically drops',
          'Demand disappears',
        ],
        correctIndex: 0,
        explanation:
          'Longer lead time means more demand must be covered before replenishment arrives, so the reorder point and safety stock need to rise. Holding cost usually increases, and neither price nor demand changes automatically.',
      },
      {
        id: 'sc-4',
        difficulty: 'Advanced',
        prompt: 'A supplier offers the lowest unit price but ships slowly from another continent. What should the decision compare?',
        options: [
          'Only the unit price',
          'Total landed cost, including freight, duties, inventory carrying cost and the service-level impact of the longer lead time',
          'The supplier’s marketing materials',
          'The number of products in the catalogue',
        ],
        correctIndex: 1,
        explanation:
          'The cheapest unit price can be the most expensive supply option once transport, duties, holding cost and stockout risk are included. Total landed cost and service impact are the fair comparison.',
      },
      {
        id: 'sc-5',
        difficulty: 'Intermediate',
        prompt: 'A demand forecast is consistently 20% too high. What is the likely operational result?',
        options: [
          'Excess inventory, higher holding cost and more obsolescence',
          'Guaranteed stockouts',
          'Lower warehouse rent',
          'Shorter supplier lead times',
        ],
        correctIndex: 0,
        explanation:
          'Over-forecasting orders more than the market needs, which ties up cash in stock and raises holding and write-off costs. Stockouts come from under-forecasting, and supplier lead times are not set by the forecast.',
      },
    ],
  },
  {
    id: 'people-ops',
    title: 'People Operations & HR',
    description: 'Structured hiring, confidentiality, onboarding and fair process.',
    icon: ShieldCheck,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Human Resources',
    aliases: [
      'HR Management',
      'Employee Relations',
      'People Operations',
      'Talent Acquisition',
      'Payroll',
      'Onboarding',
      'Recruiting',
    ],
    visual: 'human-resources',
    questions: [
      {
        id: 'hr-1',
        difficulty: 'Beginner',
        prompt: 'What makes a structured interview more defensible than an informal chat?',
        options: [
          'It uses the same job-related questions and a shared scoring rubric for every candidate',
          'It is shorter',
          'It lets each interviewer ask whatever they find interesting',
          'It avoids documenting the answers',
        ],
        correctIndex: 0,
        explanation:
          'Consistent, job-related questions and a common rubric reduce bias and make comparisons evidence-based. Shorter or unstructured conversations produce impressions that are hard to justify or compare.',
      },
      {
        id: 'hr-2',
        difficulty: 'Intermediate',
        prompt: 'When should an employee’s medical information be shared?',
        options: [
          'With the whole team so everyone understands',
          'Only with those who need it to make an accommodation or safety decision, under the confidentiality policy and law',
          'In the company newsletter',
          'Whenever a manager asks informally',
        ],
        correctIndex: 1,
        explanation:
          'Medical data is sensitive and shared strictly on a need-to-know basis, following policy and legal requirements. Broad or informal sharing can breach confidentiality and discrimination law.',
      },
      {
        id: 'hr-3',
        difficulty: 'Intermediate',
        prompt: 'What is the purpose of a 30-60-90 day plan for a new hire?',
        options: [
          'To set clear expectations and checkpoints for the first three months',
          'To replace the job description',
          'To guarantee a promotion',
          'To shorten the notice period',
        ],
        correctIndex: 0,
        explanation:
          'A 30-60-90 plan gives the new hire and manager shared milestones and early feedback points. It does not replace the role definition or promise progression.',
      },
      {
        id: 'hr-4',
        difficulty: 'Advanced',
        prompt: 'An employee reports a conflict with their manager. What is the sound first step?',
        options: [
          'Promise absolute secrecy before hearing the details',
          'Listen without prejudging, document the report, explain the process and confidentiality limits, and follow the policy route',
          'Move the employee to another team immediately',
          'Tell the manager everything that was said',
        ],
        correctIndex: 1,
        explanation:
          'A fair process starts with listening, documenting and being honest about who will see the information. Promising secrecy you cannot keep destroys trust, and moving or informing people before fact-finding prejudges the outcome.',
      },
      {
        id: 'hr-5',
        difficulty: 'Intermediate',
        prompt: 'Which is a job-related and defensible way to assess a candidate’s skill?',
        options: [
          'A work sample or structured exercise scored against agreed criteria',
          'Asking about age and family plans',
          'Judging the CV’s photo',
          'Comparing hobbies with the interviewer’s',
        ],
        correctIndex: 0,
        explanation:
          'A scored work sample measures the ability the role requires and gives every candidate the same basis for comparison. Personal characteristics and hobbies are irrelevant and can be discriminatory.',
      },
    ],
  },
  {
    id: 'legal-support',
    title: 'Legal Support & Research',
    description: 'Legal information boundaries, citations, document handling and deadlines.',
    icon: ClipboardList,
    level: 'Intermediate',
    timeMinutes: 8,
    skillName: 'Legal Research',
    aliases: [
      'Legal Support',
      'Paralegal Studies',
      'Legal Writing',
      'Contract Management',
      'Legal Compliance',
      'Legal Assistant',
    ],
    visual: 'legal',
    questions: [
      {
        id: 'leg-1',
        difficulty: 'Beginner',
        prompt: 'What separates legal information from legal advice?',
        options: [
          'Legal information explains the law generally; legal advice applies it to a client’s specific situation',
          'Legal information is always written down',
          'Legal advice is free',
          'There is no difference',
        ],
        correctIndex: 0,
        explanation:
          'Information helps someone understand the law; advice interprets it for a particular matter and is reserved for authorised practitioners. The distinction protects clients and defines the support role’s boundary.',
      },
      {
        id: 'leg-2',
        difficulty: 'Intermediate',
        prompt: 'A client sends an original signed contract. What should support staff do?',
        options: [
          'Write notes on the original for convenience',
          'Log and store it according to the matter file policy, preserve the original and work from a copy',
          'Email it to everyone on the team',
          'Shred it after reading',
        ],
        correctIndex: 1,
        explanation:
          'Originals are evidence and must be preserved unaltered, logged and stored per policy. Annotating, circulating or destroying them risks the client’s position and the firm’s records obligations.',
      },
      {
        id: 'leg-3',
        difficulty: 'Intermediate',
        prompt: 'Why must a citation be checked for currency and jurisdiction before it is relied on?',
        options: [
          'Because citations are only decorative',
          'Because legislation is amended and cases can be overruled or distinguished, and law differs between jurisdictions',
          'Because older sources are always wrong',
          'Because citations must be at least ten years old',
        ],
        correctIndex: 1,
        explanation:
          'A correct citation to a superseded or out-of-jurisdiction authority can mislead the matter. Checking the current version and the relevant jurisdiction is part of competent research.',
      },
      {
        id: 'leg-4',
        difficulty: 'Advanced',
        prompt: 'A filing deadline falls on a court holiday. What is the safe approach?',
        options: [
          'Assume the deadline moves to the next business day',
          'Check the applicable rules and any extensions, diarise early and confirm the position with the supervising lawyer',
          'File a week late and explain',
          'Ignore the deadline until the court contacts the team',
        ],
        correctIndex: 1,
        explanation:
          'Rules on holidays and extensions differ by court and matter, so the position must be verified rather than assumed. Early confirmation protects the client from a missed limitation or filing date.',
      },
      {
        id: 'leg-5',
        difficulty: 'Intermediate',
        prompt: 'What should happen before a firm accepts a new matter?',
        options: [
          'A documented conflict-of-interest check, completed before the engagement is accepted',
          'A verbal assurance from the client',
          'A review of the firm’s social media',
          'Nothing, if the client is in a hurry',
        ],
        correctIndex: 0,
        explanation:
          'Conflicts are checked and documented before acceptance so the firm does not act against an existing client or its own interest. Speed or a client’s assurance cannot substitute for the check.',
      },
    ],
  },
];

interface SkillAssessmentViewProps {
  onNavigate?: (view: string) => void;
}

export const SkillAssessmentView: React.FC<SkillAssessmentViewProps> = ({ onNavigate }) => {
  const {
    t,
    skills,
    skillEvidence,
    analysis,
    targetRole,
    updateSkillLevel,
    addCustomSkill,
    recordSkillAssessment,
  } = useCareer();
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<AssessmentCategory | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [pastAttempts, setPastAttempts] = useState<PastAttempt[]>([]);
  const [readinessBefore, setReadinessBefore] = useState<number | null>(null);
  /**
   * The state of the automatic save.
   *
   * The result is stored the moment the check is finished. This flag only
   * reports whether that write succeeded, so the interface can say plainly
   * whether the profile was updated or whether the candidate has to press the
   * re-sync button.
   */
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const visibleCategories = useMemo(() => {
    if (!targetRole) return ASSESSMENT_CATEGORIES;
    const roleSkillNames = [
      targetRole.title,
      targetRole.category,
      ...(Array.isArray(targetRole.requiredSkills) ? targetRole.requiredSkills : []),
      ...(Array.isArray(targetRole.preferredSkills) ? targetRole.preferredSkills : []),
    ].map((skill) =>
      typeof skill === 'string' ? skill : typeof skill?.name === 'string' ? skill.name : ''
    ).filter((name) => name.length > 0);
    return roleSkillNames.length > 0
      ? assessmentsForRole(ASSESSMENT_CATEGORIES, roleSkillNames)
      : [];
  }, [targetRole]);

  useEffect(() => {
    if (selectedCategory && !visibleCategories.some((category) => category.id === selectedCategory.id)) {
      setSelectedCategory(null);
      setCurrentQuestionIndex(0);
      setSelectedAnswers({});
      setIsFinished(false);
      setIsTimerActive(false);
      setTimeLeft(0);
      setSyncState('idle');
    }
  }, [selectedCategory, visibleCategories]);

  // Load past attempts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('careerdev_assessments');
      if (stored) {
        setPastAttempts(JSON.parse(stored));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Timer logic
  useEffect(() => {
    if (!isTimerActive || timeLeft <= 0 || isFinished) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isTimerActive, timeLeft, isFinished]);

  const startAssessment = (category: AssessmentCategory) => {
    setSelectedCategory(category);
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setIsFinished(false);
    setSyncState('idle');
    setReadinessBefore(analysis.matchPercentage);
    setTimeLeft(category.timeMinutes * 60);
    setIsTimerActive(true);
  };

  /**
   * Turns a score into a level (1-5).
   *
   * The rule itself lives in `shared/assessment.ts`, so the browser, the
   * server and the tests cannot disagree about what a score means.
   */
  const isSkillPracticallyBacked = (skillName: string): boolean => {
    const rec = skillEvidence[skillName.toLowerCase()];
    if (!rec) return false;
    return hasPracticalEvidence(rec);
  };

  const levelForScore = (percentage: number, practicalBacked = false): number =>
    levelForAssessmentScore(percentage, practicalBacked);

  /**
   * Stores the result the moment the check is finished.
   *
   * Before this, the result lived in the browser until the candidate pressed
   * "Sync to My Skill Profile", so the profile, the readiness figure and the
   * roadmap could all disagree with a score the candidate had already earned.
   * Now the write happens automatically, the skill record gains its
   * "Diagnostic Assessment" badge, and the roadmap and the blockers are
   * recalculated by the server as part of the same request.
   */
  const persistResult = async (level: number, score: number): Promise<boolean> => {
    if (!selectedCategory) return false;
    setSyncState('saving');
    const saved = await recordSkillAssessment({
      name: selectedCategory.skillName,
      level,
      score,
      category: 'technical',
    });
    setSyncState(saved ? 'saved' : 'failed');
    if (saved) {
      showToast({
        title: t('Assessment saved to your skill profile'),
        description: t(
          '{skill} is now measured at level {level}/5. Your role readiness, career blockers and roadmap were recalculated.',
        )
          .replace('{skill}', selectedCategory.skillName)
          .replace('{level}', String(level)),
        variant: 'success',
      });
    } else {
      showToast({
        title: t('The assessment could not be saved'),
        description: t('Your score is safe. Use "Re-sync skill profile" to try again.'),
        variant: 'error',
      });
    }
    return saved;
  };

  const handleSelectOption = (optionIndex: number) => {
    if (isFinished) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestionIndex]: optionIndex,
    }));
  };

  const handleNext = () => {
    if (!selectedCategory) return;
    if (currentQuestionIndex < selectedCategory.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      finishAssessment();
    }
  };

  const finishAssessment = () => {
    if (!selectedCategory) return;
    setIsFinished(true);
    setIsTimerActive(false);

    // Compute score
    let correct = 0;
    selectedCategory.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) {
        correct++;
      }
    });

    const total = selectedCategory.questions.length;
    const percentage = Math.round((correct / total) * 100);
    const practicalBacked = isSkillPracticallyBacked(selectedCategory.skillName);
    const proficiencyLevel = levelForScore(percentage, practicalBacked);

    const newAttempt: PastAttempt = {
      id: `${selectedCategory.id}-${Date.now()}`,
      categoryId: selectedCategory.id,
      categoryTitle: selectedCategory.title,
      score: correct,
      total,
      percentage,
      proficiencyLevel,
      date: new Date().toISOString(),
    };

    const updated = [newAttempt, ...pastAttempts].slice(0, 20);
    setPastAttempts(updated);
    try {
      localStorage.setItem('careerdev_assessments', JSON.stringify(updated));
    } catch {
      // Storage full or unavailable
    }

    // The result is stored immediately. Nothing has to be pressed for the
    // profile, the readiness figure and the roadmap to reflect it.
    void persistResult(proficiencyLevel, percentage);
  };

  /**
   * The secondary, explicit control.
   *
   * The save already happened automatically; this re-runs it for a candidate
   * whose write failed, or who simply wants to be certain the profile
   * matches the score they just earned.
   */
  const handleApplyToSkillProfile = async () => {
    if (!selectedCategory || !isFinished) return;

    let correct = 0;
    selectedCategory.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) correct++;
    });
    const percentage = Math.round((correct / selectedCategory.questions.length) * 100);
    const practicalBacked = isSkillPracticallyBacked(selectedCategory.skillName);
    const level = levelForScore(percentage, practicalBacked);

    const saved = await persistResult(level, percentage);
    if (!saved) {
      // The automatic write failed. Fall back to the self-report so the
      // candidate's own rating is never lost.
      const existingSkill = skills.find(
        (s) => s.name.toLowerCase() === selectedCategory.skillName.toLowerCase()
      );
      if (existingSkill) {
        await updateSkillLevel(existingSkill.id, level);
      } else {
        await addCustomSkill({
          name: selectedCategory.skillName,
          category: 'technical',
          currentLevel: level,
          targetLevel: Math.min(5, level + 1),
          source: 'assessment',
          evidenceIds: [],
        });
      }
      showToast({
        title: t('Skill profile updated'),
        description: t('{skill} was saved as a self-reported level of {level}/5.')
          .replace('{skill}', selectedCategory.skillName)
          .replace('{level}', String(level)),
        variant: 'success',
      });
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // If in assessment mode
  if (selectedCategory) {
    const currentQ = selectedCategory.questions[currentQuestionIndex];
    const totalQ = selectedCategory.questions.length;
    const answeredCount = Object.keys(selectedAnswers).length;

    let score = 0;
    selectedCategory.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) score++;
    });
    const scorePct = Math.round((score / totalQ) * 100);

    /**
     * The state of the primary action, read from the product.
     *
     * The question is open, the result is being written, the write really
     * landed, or the write really failed. There is no timer anywhere near
     * this: a control that shows "saved" shows it because the skill profile
     * holds the result, and one that shows the danger colour shows it
     * because the write did not happen.
     */
    const primaryActionState: MorphButtonState = !isFinished
      ? 'idle'
      : syncState === 'saving'
        ? 'loading'
        : syncState === 'saved'
          ? 'success'
          : syncState === 'failed'
            ? 'error'
            : 'idle';

    /**
     * The state of one question in the progress row.
     *
     * A question the candidate has answered is done. The question in front of
     * them is under way. Every other question is still open. This is read
     * from the answers that were actually given.
     */
    const milestoneStateFor = (index: number): 'completed' | 'in_progress' | 'available' => {
      if (selectedAnswers[index] !== undefined) return 'completed';
      if (index === currentQuestionIndex) return 'in_progress';
      return 'available';
    };

    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-12">
        {/* Top navigation & banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedCategory(null)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary-text)] hover:underline"
            >
              <span className="rtl:inline-block rtl:rotate-180" aria-hidden="true">←</span> {t('All Assessments')}
            </button>
            <span className="text-[var(--color-border)]">|</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {selectedCategory.title}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {!isFinished && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono font-bold text-[var(--text-primary)]">
                <Clock className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
                {formatTimer(timeLeft)}
              </span>
            )}
            <span className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-1 font-semibold text-[var(--text-secondary)]">
              {t('Question')} {currentQuestionIndex + 1} / {totalQ}
            </span>
          </div>
        </div>

        {/* The rubric, before the first question.
            The candidate is told what the check is, what the numbers mean,
            and which skill it actually tests — before they spend the time,
            not after. */}
        <div className="space-y-3 rounded-xl border border-[var(--color-ai-border)]/40 bg-[var(--color-ai-surface)]/20 p-4 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-ai-text)]" />
            <span className="font-semibold text-[var(--text-primary)]">
              {t(ASSESSMENT_RUBRIC_HEADLINE)}
            </span>
          </div>

          <p>{t(ASSESSMENT_RUBRIC_RULE)}</p>

          {/* What this check tests, and how it maps onto the skill. */}
          <p className="rounded-lg bg-[var(--color-surface)]/70 p-2.5 leading-relaxed">
            {t(assessmentScopeSentence(selectedCategory.skillName)).replace(
              '{skill}',
              selectedCategory.skillName
            )}
          </p>

          {/* The bands, in full. Three columns do not fit a phone: the table
              needs about 300px and a 320px screen has under 260px for it, so
              the last column used to be clipped away with no way to reach it.
              Below `sm` every band is therefore a labelled block, and the
              table itself returns from `sm:` up. The bands are unchanged. */}
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            {/* The narrow layout: one labelled block per band. */}
            <ul className="divide-y divide-[var(--color-border)] sm:hidden">
              {ASSESSMENT_RUBRIC.map((band) => (
                <li key={band.level} className="px-2.5 py-2 text-[11px]">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                    <dt className="text-[var(--text-muted)]">{t('Score')}</dt>
                    <dd className="font-mono">{band.from}%+</dd>
                    <dt className="text-[var(--text-muted)]">{t('Level')}</dt>
                    <dd className="font-semibold text-[var(--text-primary)]">
                      {band.level}/5 {t(band.label)}
                    </dd>
                    <dt className="text-[var(--text-muted)]">{t('Meaning')}</dt>
                    <dd className="leading-relaxed">{t(band.description)}</dd>
                  </dl>
                </li>
              ))}
            </ul>

            {/* The table, from `sm:` up. */}
            <table className="hidden w-full text-start text-[11px] sm:table">
              <thead>
                <tr className="bg-[var(--color-surface-secondary)]">
                  <th className="px-2.5 py-1.5 font-semibold text-[var(--text-primary)]">
                    {t('Score')}
                  </th>
                  <th className="px-2.5 py-1.5 font-semibold text-[var(--text-primary)]">
                    {t('Level')}
                  </th>
                  <th className="px-2.5 py-1.5 font-semibold text-[var(--text-primary)]">
                    {t('Meaning')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ASSESSMENT_RUBRIC.map((band) => (
                  <tr key={band.level} className="border-t border-[var(--color-border)]">
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-mono">
                      {band.from}%+
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-[var(--text-primary)]">
                      {band.level}/5 {t(band.label)}
                    </td>
                    <td className="px-2.5 py-1.5 leading-relaxed">{t(band.description)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="leading-relaxed text-[var(--text-muted)]">
            {t(ASSESSMENT_MAPPING_RULE)}
          </p>
        </div>

        {!isFinished ? (
          /* Question card */
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {selectedCategory.title} · {selectedCategory.level}
                </span>
                {/* The difficulty of the question in front of the candidate.
                    They are told what they are being asked before they
                    answer, not after, and the word matches the band the
                    result is later broken down by. */}
                <span
                  data-assessment-question-difficulty={currentQ.difficulty}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    currentQ.difficulty === 'Advanced'
                      ? 'border-[var(--color-warning-strong)]/40 bg-[var(--color-warning-surface)] text-[var(--color-warning-strong)]'
                      : currentQ.difficulty === 'Intermediate'
                        ? 'border-[var(--color-primary)]/40 bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--text-secondary)]'
                  }`}
                >
                  {t(QUESTION_DIFFICULTY_LABELS[currentQ.difficulty])}
                </span>
              </span>
              {/* The progress of the check, drawn as shapes.
                  One node per question: a closed disc where the candidate has
                  answered, a disc that breathes on the question in front of
                  them, an open ring for every question still to come. The
                  number beside them is the real one — the answers given over
                  the questions asked — so the row and the count can never
                  disagree. */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1" aria-hidden="true">
                  {selectedCategory.questions.map((q, idx) => (
                    <MorphingMilestone key={q.id} size={14} state={milestoneStateFor(idx)}>
                      <span className="text-[9px] font-bold leading-none">{idx + 1}</span>
                    </MorphingMilestone>
                  ))}
                </span>
                <span>
                  {answeredCount} of {totalQ} {t('answered')}
                </span>
              </div>
            </div>

            <h3 className="mt-4 text-base font-bold text-[var(--text-primary)] sm:text-lg">
              {currentQ.prompt}
            </h3>

            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {t(QUESTION_DIFFICULTY_DESCRIPTIONS[currentQ.difficulty])}
            </p>

            {/* Options */}
            <div className="mt-6 space-y-3">
              {currentQ.options.map((opt, oIdx) => {
                const isSelected = selectedAnswers[currentQuestionIndex] === oIdx;
                return (
                  <button
                    key={oIdx}
                    type="button"
                    onClick={() => handleSelectOption(oIdx)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-start text-xs leading-relaxed transition-all sm:text-sm ${
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-accent-surface)] text-[var(--text-primary)] font-semibold shadow-xs'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {/* The mark that says which option is chosen.
                        It is an open rounded square while the option is
                        open, and a filled circle once it is chosen, so the
                        choice is carried by the shape of the mark and not
                        only by the colour of a border. It says nothing
                        about whether the answer is right: that is only
                        known once the check is finished. */}
                    <MorphBox
                      hidden={false}
                      shape={{
                        width: 20,
                        height: 20,
                        borderRadius: isSelected ? 10 : 7,
                        backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                        borderWidth: 1,
                      }}
                    >
                      <span
                        className={`text-[11px] font-bold leading-none transition-colors ${
                          isSelected
                            ? 'text-[var(--color-on-primary)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                    </MorphBox>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom action controls */}
            <div className="mt-8 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
              <button
                type="button"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--color-border-strong)] disabled:opacity-40"
              >
                {t('Previous')}
              </button>

              {/* The primary action.
                  Its state is the state of the assessment itself: the
                  question is open, and the control is simply waiting. It
                  never says "saved" or "failed" on its own — those belong
                  to the write, and the write reports them where it
                  happens. */}
              <MorphingButton
                state={primaryActionState}
                label={currentQuestionIndex === totalQ - 1 ? t('Finish & Score') : t('Next Question')}
                onClick={handleNext}
              />
            </div>
          </div>
        ) : (
          /* Assessment Results
             The result arrives as two blocks that settle into place one
             after the other. The score itself is not animated: it is the
             number the check computed, and a number that counted up to
             itself would be telling the candidate something the interface
             does not know yet. */
          <Stagger className="space-y-6" gap={0.08}>
            <StaggerItem className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
              <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
                  <Award className="h-7 w-7" />
                </span>
                <h3 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
                  {t('Assessment Complete')}
                </h3>
                {(() => {
                  const practicalBacked = isSkillPracticallyBacked(selectedCategory.skillName);
                  const computedLevel = levelForScore(scorePct, practicalBacked);
                  const levelValues = assessmentLevelExplanationValues(scorePct, practicalBacked);
                  const beforePct = readinessBefore ?? analysis.matchPercentage;
                  const afterPct = analysis.matchPercentage;
                  const deltaPct = afterPct - beforePct;
                  return (
                    <>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {selectedCategory.title} · {new Date().toLocaleDateString()}
                      </p>

                      {/* Why this level and not another one. */}
                      <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
                        {t(explainAssessmentLevel(scorePct, practicalBacked))
                          .replace('{level}', levelValues.level)
                          .replace('{label}', t(levelValues.label))
                          .replace('{ceiling}', levelValues.ceiling)
                          .replace('{mastery}', levelValues.mastery)}
                      </p>

                      <div className="my-6 flex items-baseline gap-2">
                        <span className="font-mono text-4xl font-extrabold text-[var(--color-primary-text)]">
                          {scorePct}%
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-muted)]">
                          ({score} / {totalQ} {t('correct')})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">
                          {t('Assessed Level')}: {computedLevel} / 5
                        </span>
                        <span className="rounded-full bg-[var(--color-success-surface)] px-3 py-1 text-xs font-bold text-[var(--color-success-strong)]">
                          {computedLevel >= 5
                            ? t('Verified Proficient')
                            : scorePct >= 60
                              ? t('Knowledge Verified')
                              : t('Foundational')}
                        </span>
                        {/* Where this level came from, so the same number
                            cannot read as a different thing on another
                            screen. */}
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                          {t('Direct Assessment')}
                        </span>
                        {/* The status of the automatic save. */}
                        {syncState === 'saving' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                            {t('Saving to your skill profile…')}
                          </span>
                        )}
                        {syncState === 'saved' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-success-strong)]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('Saved to your skill profile')}
                          </span>
                        )}
                        {syncState === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-warning-strong)]">
                            <XCircle className="h-3.5 w-3.5" />
                            {t('Not saved yet — use Re-sync below')}
                          </span>
                        )}
                      </div>

                      {!practicalBacked && scorePct >= 80 && (
                        <p className="mt-3 max-w-lg text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {t('Diagnostic knowledge checks cap at Level 4/5. Complete a practical project or add verified work in Evidence to earn 5/5 Verified Proficient.')}
                        </p>
                      )}

                      {/* Impact Summary Card */}
                      <div className="mt-5 w-full max-w-xl rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 p-4 text-start space-y-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          {t('Assessment Impact Summary')}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div className="rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)]">{t('Skill Recorded')}</div>
                            <div className="font-bold text-[var(--text-primary)] mt-0.5">
                              {selectedCategory.skillName} ({computedLevel}/5)
                            </div>
                          </div>
                          <div className="rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)]">{t('Role Readiness')}</div>
                            <div className="font-bold font-mono text-[var(--text-primary)] mt-0.5">
                              {targetRole
                                ? `${beforePct}% → ${afterPct}%${deltaPct > 0 ? ` (+${deltaPct}%)` : ''}`
                                : t('No target role')}
                            </div>
                          </div>
                          <div className="rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)]">{t('Portfolio Evidence')}</div>
                            <div className="font-bold text-[var(--color-success-strong)] mt-0.5">
                              {syncState === 'saved' ? t('Assessment Evidence Added') : t('Pending Save')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {/* The save, as a shape.
                      The save already happened on its own; this control
                      re-runs it when the first write failed or when the
                      candidate wants to be certain. It reports the state of
                      that write: a ring turning while it runs, a disc with a
                      tick once the profile really holds the result, and the
                      same disc in the danger colour when the write failed.
                      Nothing here is on a timer — every state is the one the
                      product is actually in. */}
                  <MorphingButton
                    state={primaryActionState}
                    variant="secondary"
                    label={t('Re-sync skill profile')}
                    loadingLabel={t('Saving to your skill profile…')}
                    successLabel={t('Saved to your skill profile')}
                    errorLabel={t('The assessment could not be saved')}
                    onClick={handleApplyToSkillProfile}
                  />

                  <button
                    type="button"
                    onClick={() => startAssessment(selectedCategory)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--text-primary)]"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>{t('Retake Assessment')}</span>
                  </button>

                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('learning')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--text-primary)]"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>{t('Browse Matched Courses')}</span>
                    </button>
                  )}
                </div>

                {/* What the save changed, so the candidate knows the check was
                    not just a score. */}
                {syncState === 'saved' && (
                  <p className="mt-4 text-xs text-[var(--text-muted)]">
                    {t(
                      'Your role readiness, the career blockers and your roadmap were recalculated from this result.',
                    )}
                  </p>
                )}
              </div>
            </StaggerItem>

            {/* The score, broken down by difficulty.
                The overall percentage is still the headline — but a candidate
                who scored 80% overall and 40% on the advanced band is told
                exactly that, instead of being congratulated for a number
                that hid the weak part. */}
            <StaggerItem
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
              data-assessment-difficulty-breakdown
            >
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Score by difficulty')}
              </h4>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {t(ASSESSMENT_DIFFICULTY_RULE)}
              </p>

              {(() => {
                const rows = difficultyBreakdown(selectedCategory.questions, selectedAnswers);
                const weakest = weakestDifficulty(rows);
                return (
                  <div className="mt-4 space-y-3">
                    {rows.map((row) => {
                      const pct = difficultyPercentage(row);
                      return (
                        <div key={row.difficulty}>
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {t(QUESTION_DIFFICULTY_LABELS[row.difficulty])}
                            </span>
                            <span className="font-mono text-[var(--text-secondary)]">
                              {row.correct}/{row.total} · {pct}%
                            </span>
                          </div>
                          <div
                            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-secondary)]"
                            role="img"
                            aria-label={`${t(QUESTION_DIFFICULTY_LABELS[row.difficulty])}: ${row.correct} of ${row.total} correct, ${pct}%`}
                          >
                            <div
                              className="h-full rounded-full bg-[var(--color-primary)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {weakest && weakest.total > 0 && difficultyPercentage(weakest) < 60 && (
                      <p className="rounded-lg bg-[var(--color-warning-surface)] p-2.5 text-[11px] leading-relaxed text-[var(--color-warning-strong)]">
                        {t(
                          'Your weakest band is {difficulty} ({percentage}%). It is the band to work on next.',
                        )
                          .replace('{difficulty}', t(QUESTION_DIFFICULTY_LABELS[weakest.difficulty]))
                          .replace('{percentage}', String(difficultyPercentage(weakest)))}
                      </p>
                    )}
                  </div>
                );
              })()}
            </StaggerItem>

            {/* Answer breakdown */}
            <StaggerItem className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Detailed Question Breakdown & Explanations')}
              </h4>
              <div className="mt-4 space-y-4">
                {selectedCategory.questions.map((q, idx) => {
                  const userAnswer = selectedAnswers[idx];
                  const isCorrect = userAnswer === q.correctIndex;
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/30 p-4 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        {isCorrect ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success-strong)]" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        )}
                        <div className="space-y-1.5">
                          <p className="font-bold text-[var(--text-primary)]">
                            {idx + 1}. {q.prompt}
                          </p>
                          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                            {t(QUESTION_DIFFICULTY_LABELS[q.difficulty])}
                          </span>
                          <p className="text-[var(--text-secondary)]">
                            <span className="font-semibold">{t('Your answer')}:</span>{' '}
                            {userAnswer !== undefined ? q.options[userAnswer] : t('Not answered')}
                          </p>
                          {!isCorrect && (
                            <p className="text-[var(--color-success-strong)]">
                              <span className="font-semibold">{t('Correct answer')}:</span>{' '}
                              {q.options[q.correctIndex]}
                            </p>
                          )}
                          <div className="mt-2 rounded-lg bg-[var(--color-surface)] p-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)] border border-[var(--color-border)]">
                            <span className="font-bold text-[var(--text-primary)]">
                              {t('Explanation')}:
                            </span>{' '}
                            {q.explanation}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </StaggerItem>
          </Stagger>
        )}
      </div>
    );
  }

  // Categories Selection view
  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
          {t('Skill Validation')}
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          {t('Diagnostic Knowledge Checks')}
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
          {t(
            'Calibrate your actual proficiency through practical, scenario-based questions. Your result is saved to your skill profile the moment you finish, and your readiness, blockers and roadmap are recalculated automatically.'
          )}
        </p>
      </div>

      {/* Honest Diagnostic Notice */}
      <div data-tour="assessment-results-summary" className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xs">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-primary-text)]" />
        <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{t('Self-Assessment Standard')}:</strong>{' '}
          {t(
            'These are five-question diagnostic knowledge checks, not professional certifications. They place you on the 1-5 scale so your roadmap and readiness figures are measured against real evidence.'
          )}
        </div>
      </div>

      {/* Categories Grid */}
      {visibleCategories.length === 0 ? (
        <div data-tour="assessment-catalog" className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--text-secondary)]">
          {targetRole
            ? t('No role-specific checks are available for this target role yet.')
            : t('Choose a target role to see matching assessments.')}
        </div>
      ) : (
      <div data-tour="assessment-catalog" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCategories.map((cat) => {
          const Icon = cat.icon;
          const attempt = pastAttempts.find((a) => a.categoryId === cat.id);
          // The visual that genuinely belongs to this check. A check that
          // names no visual of its own renders its own badge, so it never
          // wears a picture that belongs to another subject.
          const specificVisual = getSpecificIndustryVisual(
            'visual' in cat ? cat.visual : cat.skillName
          );

          return (
            <div
              key={cat.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md"
            >
              <div className="relative h-28 w-full overflow-hidden border-b border-[var(--color-border)]">
                {/* The card shows a picture of ITS OWN subject, or no picture
                    at all. The four cards used to wear the same generic
                    software-engineering photograph, which told the candidate
                    that Excel, Communication, English and SQL were the same
                    subject. */}
                {specificVisual ? (
                  <CareerImage
                    src={specificVisual.srcSm ?? specificVisual.src}
                    alt={specificVisual.altEn}
                    size="sm"
                    aspectRatio="16/9"
                    rounded="rounded-none"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                    <div className="absolute top-2.5 end-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-xs ${
                          cat.level === 'Advanced'
                            ? 'bg-purple-600 text-white'
                            : cat.level === 'Intermediate'
                            ? 'bg-blue-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {cat.level}
                      </span>
                    </div>
                    <div className="absolute bottom-2.5 start-3 flex items-center gap-2 text-white">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-[var(--color-primary-text)] backdrop-blur-xs">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-bold drop-shadow-sm">{cat.skillName}</span>
                    </div>
                  </CareerImage>
                ) : (
                  <div className="flex h-full w-full items-center justify-center gap-3 bg-gradient-to-br from-[var(--accent-primary)]/20 via-[var(--color-surface-secondary)] to-[var(--accent-secondary)]/15">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-main)] text-[var(--color-primary-text)] shadow-xs">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="text-start">
                      <div className="text-sm font-bold text-[var(--text-primary)]">
                        {cat.skillName}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {cat.level}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {cat.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {cat.description}
                  </p>

                  <div className="mt-4 flex items-center gap-4 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-3.5 w-3.5" />
                      {cat.timeMinutes} {t('mins')}
                    </span>
                    <span>
                      {cat.questions.length} {t('questions')}
                    </span>
                  </div>

                  {attempt && (
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--color-surface-secondary)] px-3 py-1.5 text-xs">
                      <span className="text-[var(--text-secondary)]">{t('Last Score')}:</span>
                      <span className="font-mono font-bold text-[var(--color-primary-text)]">
                        {attempt.percentage}% (Lvl {attempt.proficiencyLevel})
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => startAssessment(cat)}
                  className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] py-2.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-colors hover:bg-[var(--color-primary-hover)]"
                >
                  <span>{attempt ? t('Retake Test') : t('Start Assessment')}</span>
                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Past attempts history */}
      {pastAttempts.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
            <History className="h-4 w-4 text-[var(--color-primary-text)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {t('Recent Assessment Attempts')}
            </h3>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-start text-[var(--text-muted)]">
                  <th className="pb-2 font-semibold">{t('Category')}</th>
                  <th className="pb-2 font-semibold">{t('Date')}</th>
                  <th className="pb-2 font-semibold">{t('Score')}</th>
                  <th className="pb-2 font-semibold">{t('Level')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {pastAttempts.map((att) => (
                  <tr key={att.id} className="text-[var(--text-secondary)]">
                    <td className="py-2.5 font-bold text-[var(--text-primary)]">
                      {att.categoryTitle}
                    </td>
                    <td className="py-2.5">
                      {new Date(att.date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 font-mono font-semibold text-[var(--color-primary-text)]">
                      {att.score} / {att.total} ({att.percentage}%)
                    </td>
                    <td className="py-2.5">
                      <span className="rounded bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-primary)]">
                        Lvl {att.proficiencyLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillAssessmentView;
