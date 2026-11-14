import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Award,
  Clock,
  ArrowRight,
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
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useToast } from '../toast/ToastProvider';
import { CareerImage } from '../ui/CareerImage';
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

export interface AssessmentQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AssessmentCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  timeMinutes: number;
  skillName: string;
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
    visual: 'data-analysis',
    questions: [
      {
        id: 'sql-1',
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
    visual: 'software-engineering',
    questions: [
      {
        id: 'py-1',
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
    timeMinutes: 6,
    skillName: 'Microsoft Excel',
    // No photograph of its own: this card renders its own badge, so it never
    // wears the same picture as the SQL check.
    visual: null,
    questions: [
      {
        id: 'xl-1',
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
    timeMinutes: 6,
    skillName: 'Communication',
    visual: null,
    questions: [
      {
        id: 'comm-1',
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
    timeMinutes: 6,
    skillName: 'English',
    visual: null,
    questions: [
      {
        id: 'eng-1',
        prompt: 'Which phrase is most appropriate for a polite, professional follow-up email to a hiring team?',
        options: [
          'Why haven\'t you replied to my application yet?',
          'I am writing to politely inquire about the status of my application for the Software Engineer position.',
          'Check my CV again.',
          'Hoping you will hire me soon.',
        ],
        correctIndex: 1,
        explanation: 'Clear, polite, and specific phrasing reinforces professionalism and respects the recipient\'s schedule.',
      },
      {
        id: 'eng-2',
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

          {/* The bands, in full. */}
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-[11px]">
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
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span>
                {selectedCategory.title} · {selectedCategory.level}
              </span>
              <span>
                {answeredCount} of {totalQ} {t('answered')}
              </span>
            </div>

            <h3 className="mt-4 text-base font-bold text-[var(--text-primary)] sm:text-lg">
              {currentQ.prompt}
            </h3>

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
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                        isSelected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                          : 'border-[var(--color-border)] text-[var(--text-muted)]'
                      }`}
                    >
                      {String.fromCharCode(65 + oIdx)}
                    </span>
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

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-xs font-semibold text-[var(--color-on-primary)] shadow-sm transition-transform hover:bg-[var(--color-primary-hover)] active:scale-95"
              >
                <span>
                  {currentQuestionIndex === totalQ - 1 ? t('Finish & Score') : t('Next Question')}
                </span>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            </div>
          </div>
        ) : (
          /* Assessment Results */
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
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
                  {/* The secondary control. The save already happened; this
                      re-runs it when the first write failed or when the
                      candidate wants to be certain. */}
                  <button
                    type="button"
                    disabled={syncState === 'saving'}
                    onClick={handleApplyToSkillProfile}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--text-primary)] disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>
                      {syncState === 'failed'
                        ? t('Re-sync skill profile')
                        : t('Re-sync skill profile')}
                    </span>
                  </button>

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
            </div>

            {/* Answer breakdown */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
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
            </div>
          </div>
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
      <div data-tour="assessment-catalog" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ASSESSMENT_CATEGORIES.map((cat) => {
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
