-- B.5 normalized 4-table learning model (no JSON blob, no second source-of-truth)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  skill_category TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Beginner','Intermediate','Advanced')),
  duration_hours INT,
  language TEXT DEFAULT 'English',
  url TEXT,
  availability TEXT NOT NULL CHECK (availability IN ('free','free_with_limitations','audit','free_course_paid_certificate','paid','youtube_free')),
  description TEXT,
  is_verified BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_skill_category ON courses(skill_category);
CREATE INDEX IF NOT EXISTS idx_courses_availability ON courses(availability);
CREATE INDEX IF NOT EXISTS idx_courses_provider ON courses(provider);

CREATE TABLE IF NOT EXISTS course_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_target TEXT,
  UNIQUE(course_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_course_skills_course ON course_skills(course_id);

CREATE TABLE IF NOT EXISTS course_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  relevance_score INT CHECK (relevance_score BETWEEN 1 AND 100) DEFAULT 50,
  UNIQUE(course_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_course_roles_course ON course_roles(course_id);

CREATE TABLE IF NOT EXISTS user_learning_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','in_progress','completed','dismissed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  ai_rank_reason TEXT,
  evidence_links JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_user_learning_items_user ON user_learning_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_items_status ON user_learning_items(status);
