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
    questions: [
      {
        id: 'sql-1',
        prompt: 'Which SQL clause is executed FIRST in the standard logical query processing order?',
        options: ['SELECT', 'FROM', 'WHERE', 'HAVING'],
        correctIndex: 1,
        explanation: 'In logical query processing, FROM (and JOINs) executes first to assemble the working data set, followed by WHERE, GROUP BY, HAVING, SELECT, and ORDER BY.',
      },
      {
        id: 'sql-2',
        prompt: 'What is the primary difference between RANK() and DENSE_RANK() in window functions?',
        options: [
          'RANK() skips ranks after ties; DENSE_RANK() does not skip any ranks.',
          'DENSE_RANK() requires an ORDER BY clause while RANK() does not.',
          'RANK() only works with integer partitions.',
          'DENSE_RANK() always returns floating point percentiles.',
        ],
        correctIndex: 0,
        explanation: 'RANK() assigns duplicate ranks for ties and skips subsequent ranks (e.g., 1, 2, 2, 4), whereas DENSE_RANK() leaves no gaps (e.g., 1, 2, 2, 3).',
      },
      {
        id: 'sql-3',
        prompt: 'To retain all records from table A and only matching records from table B, which join should you use?',
        options: ['INNER JOIN', 'FULL OUTER JOIN', 'LEFT OUTER JOIN', 'CROSS JOIN'],
        correctIndex: 2,
        explanation: 'A LEFT OUTER JOIN preserves all rows from the left table (A) regardless of whether a matching row exists in the right table (B).',
      },
      {
        id: 'sql-4',
        prompt: 'How does a correlated subquery differ from a standard subquery?',
        options: [
          'It executes once for the entire query.',
          'It references columns from the outer query and re-evaluates for each outer row.',
          'It cannot contain WHERE clauses.',
          'It is stored as a permanent database view.',
        ],
        correctIndex: 1,
        explanation: 'A correlated subquery depends on values from the outer query row and executes iteratively for each candidate row processed by the outer query.',
      },
      {
        id: 'sql-5',
        prompt: 'Why should you generally avoid using SELECT * in production analytics queries?',
        options: [
          'It prevents database transactions from committing.',
          'It increases network I/O, prevents index-only scans, and causes schema drift breakages.',
          'It is unsupported in SQL:1999 standard.',
          'It converts all columns to text format.',
        ],
        correctIndex: 1,
        explanation: 'Explicit column selection reduces memory and network overhead, allows query planners to utilize covering indexes, and safeguards client applications from schema changes.',
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
    questions: [
      {
        id: 'py-1',
        prompt: 'What is the key difference between a Python list and a tuple?',
        options: [
          'Lists can only store numbers, while tuples store any type.',
          'Lists are mutable; tuples are immutable.',
          'Tuples have O(1) membership search; lists have O(log n).',
          'Lists cannot be nested inside dictionaries.',
        ],
        correctIndex: 1,
        explanation: 'Python lists can be modified after creation (mutable), whereas tuples cannot be altered (immutable), making tuples hashable as dictionary keys.',
      },
      {
        id: 'py-2',
        prompt: 'What does the "yield" keyword do in a Python function?',
        options: [
          'Terminates program execution immediately.',
          'Turns the function into a generator that produces values lazily without exhausting memory.',
          'Imports modules asynchronously.',
          'Enforces static type checking at runtime.',
        ],
        correctIndex: 1,
        explanation: 'Functions containing yield return a generator object, maintaining their state between successive iterations to produce elements on demand with minimal memory overhead.',
      },
      {
        id: 'py-3',
        prompt: 'In pandas, what is the best way to handle missing values (NaN) before training a regression model?',
        options: [
          'Replace all NaNs with empty strings.',
          'Evaluate data missingness mechanisms and apply mean/median/mode imputation, model imputation, or drop rows if MCAR.',
          'Always drop the target column.',
          'Convert the entire dataframe to boolean values.',
        ],
        correctIndex: 1,
        explanation: 'Principled data imputation depends on whether missingness is completely at random (MCAR) or depends on observed values, using median or domain-specific strategies.',
      },
      {
        id: 'py-4',
        prompt: 'What is the time complexity of looking up a key in a Python dictionary on average?',
        options: ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'],
        correctIndex: 2,
        explanation: 'Python dictionaries are implemented using hash tables, giving average-case key lookups O(1) constant time.',
      },
      {
        id: 'py-5',
        prompt: 'Which library is the industry standard for fast vectorized numerical arrays in Python?',
        options: ['NumPy', 'Requests', 'Flask', 'BeautifulSoup'],
        correctIndex: 0,
        explanation: 'NumPy provides homogeneous multi-dimensional arrays with C-optimized vectorized operations, forming the foundation of the scientific Python ecosystem.',
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
    questions: [
      {
        id: 'xl-1',
        prompt: 'Why is XLOOKUP generally preferred over traditional VLOOKUP in modern Excel?',
        options: [
          'It only works with numbers.',
          'It can search in any direction, defaults to exact match, and does not break when columns are inserted.',
          'It is limited to 100 rows.',
          'It requires VBA macros.',
        ],
        correctIndex: 1,
        explanation: 'XLOOKUP does not require specifying a column index number, searches left or right, defaults to exact match, and resists column insertion disruptions.',
      },
      {
        id: 'xl-2',
        prompt: 'What is the purpose of an Excel PivotTable?',
        options: [
          'Encrypting workbook files.',
          'Rapidly summarizing, sorting, grouping, and aggregating large tabular data without writing formulas.',
          'Exporting data directly to binary assembly.',
          'Translating text between languages.',
        ],
        correctIndex: 1,
        explanation: 'PivotTables allow interactive multidimensional aggregation, cross-tabulation, and filtering of raw transactional tables in seconds.',
      },
      {
        id: 'xl-3',
        prompt: 'Which formula correctly sums values in range C2:C100 where column B equals "Cairo"?',
        options: [
          '=SUMIF(B2:B100, "Cairo", C2:C100)',
          '=COUNTIF("Cairo", B2:B100)',
          '=SUM(B2:B100 + C2:C100)',
          '=VLOOKUP("Cairo", B2:C100, 2, FALSE)',
        ],
        correctIndex: 0,
        explanation: '=SUMIF(range, criteria, [sum_range]) checks the condition in B2:B100 and sums the corresponding values in C2:C100.',
      },
      {
        id: 'xl-4',
        prompt: 'What does the "$" symbol denote in a cell reference such as $A$1?',
        options: [
          'Currency formatting.',
          'Absolute referencing, preventing the row and column coordinates from shifting when copied.',
          'A calculation error.',
          'An external web link.',
        ],
        correctIndex: 1,
        explanation: 'A dollar sign anchors the coordinate so that relative formula propagation does not alter the referenced row or column.',
      },
      {
        id: 'xl-5',
        prompt: 'What is the primary function of the IFERROR function?',
        options: [
          'Generates a deliberate crash.',
          'Catches formula errors (e.g., #N/A, #DIV/0!) and returns a designated fallback value.',
          'Validates spell check.',
          'Formats numbers as percentages.',
        ],
        correctIndex: 1,
        explanation: 'IFERROR(value, value_if_error) traps runtime evaluation exceptions and cleanly supplies an alternate outcome such as 0 or "Not Found".',
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
  const { t, skills, updateSkillLevel, addCustomSkill } = useCareer();
  const [selectedCategory, setSelectedCategory] = useState<AssessmentCategory | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [pastAttempts, setPastAttempts] = useState<PastAttempt[]>([]);
  const [profileUpdated, setProfileUpdated] = useState(false);

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
    setProfileUpdated(false);
    setTimeLeft(category.timeMinutes * 60);
    setIsTimerActive(true);
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

    // Map percentage to 1-5 proficiency level
    let proficiencyLevel = 1;
    if (percentage >= 90) proficiencyLevel = 5;
    else if (percentage >= 75) proficiencyLevel = 4;
    else if (percentage >= 55) proficiencyLevel = 3;
    else if (percentage >= 35) proficiencyLevel = 2;
    else proficiencyLevel = 1;

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
  };

  const handleApplyToSkillProfile = () => {
    if (!selectedCategory || !isFinished) return;

    let correct = 0;
    selectedCategory.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) correct++;
    });
    const percentage = Math.round((correct / selectedCategory.questions.length) * 100);
    let level = 1;
    if (percentage >= 90) level = 5;
    else if (percentage >= 75) level = 4;
    else if (percentage >= 55) level = 3;
    else if (percentage >= 35) level = 2;

    const existingSkill = skills.find(
      (s) => s.name.toLowerCase() === selectedCategory.skillName.toLowerCase()
    );

    if (existingSkill) {
      updateSkillLevel(existingSkill.id, level);
    } else {
      addCustomSkill({
        name: selectedCategory.skillName,
        category: 'technical',
        currentLevel: level,
        targetLevel: Math.min(5, level + 1),
        source: 'assessment',
        evidenceIds: [],
      });
    }

    setProfileUpdated(true);
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
              ← {t('All Assessments')}
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

        {/* Diagnostic disclaimer */}
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-ai-border)]/40 bg-[var(--color-ai-surface)]/20 p-3 text-xs text-[var(--text-secondary)]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-ai-text)]" />
          <span>
            {t(
              'Diagnostic Self-Assessment: Calibrated for practical skill readiness and roadmap tailoring. Not an accredited third-party certification.'
            )}
          </span>
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
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {selectedCategory.title} · {new Date().toLocaleDateString()}
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
                    {t('Assessed Level')}: {Math.min(5, Math.max(1, Math.round((scorePct / 100) * 5)))} / 5
                  </span>
                  <span className="rounded-full bg-[var(--color-success-surface)] px-3 py-1 text-xs font-bold text-[var(--color-success-strong)]">
                    {scorePct >= 70 ? t('Proficient') : scorePct >= 50 ? t('Intermediate') : t('Foundational')}
                  </span>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={profileUpdated}
                    onClick={handleApplyToSkillProfile}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-sm transition-transform hover:bg-[var(--color-primary-hover)] active:scale-95 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {profileUpdated ? t('Skill Profile Updated!') : t('Sync to My Skill Profile')}
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
          {t('Skill Assessment Center')}
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
          {t(
            'Calibrate your actual proficiency through realistic multiple-choice technical benchmarks. Results update your skill profile and refine your personalized roadmap.'
          )}
        </p>
      </div>

      {/* Honest Diagnostic Notice */}
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xs">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-primary-text)]" />
        <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{t('Self-Assessment Standard')}:</strong>{' '}
          {t(
            'These assessments serve as objective diagnostic tools for personal growth. They are not accredited academic degrees or licensed corporate certifications.'
          )}
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ASSESSMENT_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const attempt = pastAttempts.find((a) => a.categoryId === cat.id);

          return (
            <div
              key={cat.id}
              className="group flex flex-col justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-surface)] text-[var(--color-primary-text)] transition-transform duration-200 group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      cat.level === 'Advanced'
                        ? 'bg-purple-500/15 text-purple-600'
                        : cat.level === 'Intermediate'
                        ? 'bg-blue-500/15 text-blue-600'
                        : 'bg-emerald-500/15 text-emerald-600'
                    }`}
                  >
                    {cat.level}
                  </span>
                </div>

                <h3 className="mt-4 text-base font-bold text-[var(--text-primary)]">
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
                  <span>{cat.questions.length} {t('questions')}</span>
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
