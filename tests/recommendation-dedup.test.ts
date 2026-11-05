import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle,
  tokenize,
  jaccardSimilarity,
  skillOverlap,
  urlsMatch,
  isSemanticProjectDuplicate,
  isSemanticCourseDuplicate,
  isSemanticCertificationDuplicate,
  isCareerRoleRelevant,
} from '../shared/semanticDuplicate.ts';

describe('Part C — Semantic Duplicate Detection & Recommendation Intelligence', () => {
  it('normalizes titles correctly by stripping action prefixes and punctuation', () => {
    assert.equal(
      normalizeTitle('Build a Real-Time Distributed Task Queue'),
      'real time distributed task queue'
    );
    assert.equal(
      normalizeTitle('Create an E-Commerce Platform with Cart & Checkout'),
      'e commerce platform with cart checkout'
    );
    assert.equal(
      normalizeTitle('Hands-on Mastering of Docker and Kubernetes'),
      'docker and kubernetes'
    );
    assert.equal(
      normalizeTitle('The Complete Guide to React 19 Development'),
      'react 19 development'
    );
  });

  it('tokenizes text excluding common stop words and stemming cert words', () => {
    const tokens = tokenize('Build a responsive web application for an online store with React');
    assert.ok(tokens.has('responsive'));
    assert.ok(tokens.has('web'));
    assert.ok(tokens.has('application'));
    assert.ok(tokens.has('online'));
    assert.ok(tokens.has('store'));
    assert.ok(tokens.has('react'));
    assert.ok(!tokens.has('a'));
    assert.ok(!tokens.has('for'));
    assert.ok(!tokens.has('an'));
    assert.ok(!tokens.has('with'));
  });

  it('computes set Jaccard similarity accurately', () => {
    const setA = new Set(['react', 'typescript', 'tailwind']);
    const setB = new Set(['react', 'typescript', 'css']);
    // intersection = 2, union = 4 -> 0.5
    assert.equal(jaccardSimilarity(setA, setB), 0.5);

    const setC = new Set(['python', 'django']);
    assert.equal(jaccardSimilarity(setA, setC), 0);
  });

  it('detects duplicate projects by repository and demo URLs', () => {
    const existing = [
      {
        id: 'proj-1',
        title: 'Portfolio Website',
        repositoryUrl: 'https://github.com/user/portfolio-site',
        demoUrl: 'https://user-portfolio.pages.dev',
        status: 'completed',
        skills: ['React', 'CSS'],
      },
    ];

    const matchByRepo = isSemanticProjectDuplicate(
      {
        title: 'Personal Developer Showcase',
        repositoryUrl: 'https://github.com/user/portfolio-site/',
      },
      existing
    );
    assert.equal(matchByRepo.isDuplicate, true);
    assert.equal(matchByRepo.isCompleted, true);

    const matchByDemo = isSemanticProjectDuplicate(
      {
        title: 'Another Portfolio Concept',
        demoUrl: 'https://user-portfolio.pages.dev/',
      },
      existing
    );
    assert.equal(matchByDemo.isDuplicate, true);
  });

  it('detects semantic duplicates across alternative naming conventions', () => {
    const existing = [
      {
        id: 'proj-2',
        title: 'Full-Stack E-Commerce Store with Stripe',
        status: 'in_progress',
        skills: ['React', 'Node.js', 'PostgreSQL', 'Stripe'],
      },
    ];

    // Different phrasing of the exact same project
    const candidate = {
      title: 'Build an E-Commerce Store with Stripe Checkout',
      skills: ['React', 'Node.js', 'Stripe'],
    };

    const result = isSemanticProjectDuplicate(candidate, existing);
    assert.equal(result.isDuplicate, true);
    assert.equal(result.isInProgress, true);
    assert.equal(result.isCompleted, false);
    assert.ok(
      result.reason?.includes('Shared domain') || result.reason?.includes('Substantially similar')
    );
  });

  it('detects duplicate completed courses by id, url, and title token overlap', () => {
    const completedCourses = [
      {
        id: 'course-101',
        title: 'React - The Complete Guide (incl. Next.js, Redux)',
        provider: 'Udemy',
        url: 'https://www.udemy.com/course/react-the-complete-guide/',
      },
    ];

    // Same id
    const matchId = isSemanticCourseDuplicate(
      { id: 'course-101', title: 'React Guide' },
      completedCourses
    );
    assert.equal(matchId.isDuplicate, true);

    // Same url
    const matchUrl = isSemanticCourseDuplicate(
      {
        id: 'course-different',
        title: 'Different Title',
        url: 'https://www.udemy.com/course/react-the-complete-guide',
      },
      completedCourses
    );
    assert.equal(matchUrl.isDuplicate, true);

    // Alternative phrasing from same provider
    const matchTitle = isSemanticCourseDuplicate(
      {
        id: 'course-new-edition',
        title: 'React Complete Guide (Next.js, Redux)',
        provider: 'Udemy',
      },
      completedCourses
    );
    assert.equal(matchTitle.isDuplicate, true);
  });

  it('detects held certifications to prevent recommending completed certifications', () => {
    const existingCerts = [
      {
        name: 'AWS Certified Solutions Architect – Associate',
        issuer: 'Amazon Web Services',
        credentialId: 'AWS-123456',
      },
    ];

    const duplicateCert = isSemanticCertificationDuplicate(
      {
        name: 'AWS Solutions Architect Associate Certification',
        issuer: 'Amazon Web Services',
      },
      existingCerts
    );
    assert.equal(duplicateCert.isDuplicate, true);

    const differentCert = isSemanticCertificationDuplicate(
      {
        name: 'AWS Certified Developer – Associate',
        issuer: 'Amazon Web Services',
      },
      existingCerts
    );
    assert.equal(differentCert.isDuplicate, false);
  });

  it('enforces career-role relevance gating', () => {
    const hrRole = {
      title: 'Human Resources Specialist',
      domainId: 'hr',
      skills: ['Talent Acquisition', 'Onboarding', 'Labor Law', 'Payroll'],
    };

    // Technical developer project must be rejected for HR role
    const devProject = {
      title: 'Build a Distributed Microservices Architecture with Kubernetes and Docker',
      skills: ['Kubernetes', 'Docker Container', 'Go'],
    };
    assert.equal(isCareerRoleRelevant(devProject, hrRole), false);

    // HR project must be accepted
    const hrProject = {
      title: 'Design an Automated Employee Onboarding & Compliance Workflow',
      skills: ['Talent Acquisition', 'Onboarding'],
    };
    assert.equal(isCareerRoleRelevant(hrProject, hrRole), true);

    // Software role accepts dev project
    const devRole = {
      title: 'Full Stack Engineer',
      domainId: 'engineering',
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    };
    assert.equal(isCareerRoleRelevant(devProject, devRole), true);
  });
});
