import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Award,
  FolderGit2,
  MapPin,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { Logo } from '../brand/Logo';
import { SkeletonCard } from '../ui/Skeleton';
import { CareerPilotAvatar } from '../ui/CareerPilotAvatars';
import { apiUrl } from '../../lib/native';
import { useCareer } from '../../context/CareerContext';

interface PublicExperience {
  company: string;
  role: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
}

interface PublicEducation {
  institution: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
}

interface PublicCertification {
  name: string;
  issuer?: string;
  issueDate?: string;
  credentialUrl?: string;
}

interface PublicSkill {
  name?: string;
  level?: number | null;
  category?: string | null;
}

interface PublicProject {
  title: string;
  description?: string;
  repositoryUrl?: string;
  demoUrl?: string;
}

interface PublicProfile {
  name?: string | null;
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  targetRole?: string | null;
  experiences?: PublicExperience[];
  education?: PublicEducation[];
  certifications?: PublicCertification[];
  skills?: PublicSkill[];
  projects?: PublicProject[];
  links?: Record<string, string>;
}

const formatRange = (start?: string | null, end?: string | null, isCurrent?: boolean) => {
  const from = start ? String(start).slice(0, 7) : '';
  const to = isCurrent ? 'Present' : end ? String(end).slice(0, 7) : '';
  if (!from && !to) return '';
  return [from, to].filter(Boolean).join(' — ');
};

/**
 * Read-only public profile.
 *
 * The server exposes only the opted-in, safe fields (`/api/profile/public/:username`)
 * and returns 404 for a private or unknown profile, so this view cannot reveal
 * a private account. It is reachable while signed out because the share link
 * is meant to be shared with people who do not have an account.
 */
export const PublicProfileView: React.FC<{ username: string; onBack: () => void }> = ({
  username,
  onBack,
}) => {
  const { t } = useCareer();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setProfile(null);
    setNotFound(false);
    setError(false);

    fetch(apiUrl(`/api/profile/public/${encodeURIComponent(username)}`))
      .then(async (response) => {
        if (response.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        const data = await response.json();
        return data?.profile ?? null;
      })
      .then((result) => {
        if (!cancelled && result) setProfile(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-main)]">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center justify-between">
          <Logo variant="full" className="h-8 sm:h-9 w-auto" />
          <button
            onClick={onBack}
            className="text-xs font-semibold text-[var(--color-primary-text)] hover:underline flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            <span>{t('Back to CareerDev4AI')}</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-10 space-y-6">
        {isLoading && (
          <div
            className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">{t('Loading public profile…')}</span>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!isLoading && notFound && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8 space-y-2">
            <h1 className="text-lg font-bold">{t('Profile not available')}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('This profile does not exist or its owner has not made it public.')}
            </p>
          </div>
        )}

        {!isLoading && error && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8 space-y-2"
          >
            <h1 className="text-lg font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />
              {t('Could not load this profile')}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('The server could not be reached. Please try again.')}
            </p>
          </div>
        )}

        {!isLoading && profile && (
          <>
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 sm:p-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <CareerPilotAvatar
                  avatarId={profile.avatarUrl}
                  className="w-16 h-16 rounded-2xl border border-[var(--border-subtle)]"
                />
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {profile.name ?? username}
                  </h1>
                  {profile.headline && (
                    <p className="text-sm text-[var(--text-secondary)]">{profile.headline}</p>
                  )}
                  {profile.location && (
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{profile.location}</span>
                    </p>
                  )}
                </div>
              </div>

              {profile.bio && (
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{profile.bio}</p>
              )}

              {profile.links && Object.keys(profile.links).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(profile.links).map(([kind, url]) => (
                    <a
                      key={kind}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                    >
                      <span className="capitalize">{kind}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            {(profile.experiences?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 space-y-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[var(--color-primary-text)]" />
                  {t('Experience')}
                </h2>
                <div className="space-y-3">
                  {profile.experiences!.map((item, index) => (
                    <div key={`${item.company}-${index}`} className="text-xs">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {item.role} · {item.company}
                      </div>
                      <div className="text-[var(--text-muted)]">
                        {[formatRange(item.startDate, item.endDate, item.isCurrent), item.location]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(profile.education?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 space-y-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[var(--color-primary-text)]" />
                  {t('Education')}
                </h2>
                <div className="space-y-3">
                  {profile.education!.map((item, index) => (
                    <div key={`${item.institution}-${index}`} className="text-xs">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {item.institution}
                      </div>
                      <div className="text-[var(--text-muted)]">
                        {[item.degree, item.field, formatRange(item.startDate, item.endDate, item.isCurrent)]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(profile.skills?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 space-y-3">
                <h2 className="text-sm font-bold">{t('Skills')}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills!
                    .filter((skill) => skill.name)
                    .map((skill) => (
                      <span
                        key={skill.name}
                        className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] text-[var(--text-primary)]"
                      >
                        {skill.name}
                        {typeof skill.level === 'number' ? ` · ${skill.level}/5` : ''}
                      </span>
                    ))}
                </div>
              </section>
            )}

            {(profile.projects?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 space-y-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-[var(--color-primary-text)]" />
                  {t('Projects')}
                </h2>
                <div className="space-y-3">
                  {profile.projects!.map((project, index) => (
                    <div key={`${project.title}-${index}`} className="text-xs space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">{project.title}</div>
                      {project.description && (
                        <p className="text-[var(--text-secondary)]">{project.description}</p>
                      )}
                      <div className="flex gap-3">
                        {project.repositoryUrl && (
                          <a
                            href={project.repositoryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary-text)] hover:underline"
                          >
                            {t('Repository')}
                          </a>
                        )}
                        {project.demoUrl && (
                          <a
                            href={project.demoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-primary-text)] hover:underline"
                          >
                            {t('Live demo')}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(profile.certifications?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 space-y-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Award className="w-4 h-4 text-[var(--color-primary-text)]" />
                  {t('Certifications')}
                </h2>
                <div className="space-y-2">
                  {profile.certifications!.map((cert, index) => (
                    <div key={`${cert.name}-${index}`} className="text-xs">
                      <div className="font-semibold text-[var(--text-primary)]">{cert.name}</div>
                      <div className="text-[var(--text-muted)]">
                        {[cert.issuer, cert.issueDate].filter(Boolean).join(' · ')}
                      </div>
                      {cert.credentialUrl && (
                        <a
                          href={cert.credentialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-primary-text)] hover:underline"
                        >
                          {t('Verify credential')}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};
