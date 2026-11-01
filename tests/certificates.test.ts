/**
 * Certificates: what a certificate record holds, and what the platform is
 * allowed to call a certificate.
 *
 * Two claims are protected here.
 *
 * The first is about the record. A certificate has a name, an issuing body, an
 * issue date, an expiry date, a credential identifier, a verification URL, a
 * description and the skills it produced. The description and the skills are
 * the ones the platform was missing: a certificate that says nothing about
 * what it covered could never be reflected on a CV.
 *
 * The second is about the importer. A CV line is only a certificate when the
 * document says so. A sentence, a phone number, a portfolio link or a bare
 * list of technologies is not a qualification, and importing one as a
 * certificate puts a claim on somebody's CV that they never made.
 *
 * Everything here is pure: no database and no server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStructuredCv } from '../server/cv/parseStructuredCv.ts';
import type { DocumentBlock, DocumentExtraction } from '../server/cv/documentExtraction.ts';
import { computeSkillGaps, toRoleSkillRequirements } from '../shared/skillGap.ts';
import { mergeCanonicalCvDocument } from '../shared/cvProjection.ts';
import type { CvSourceData } from '../shared/cvDocument.ts';
import type { CVProfile } from '../src/types/career.ts';

const UUID_CERT = '44444444-4444-4444-8444-444444444444';

/** Builds an extraction whose body is the given lines. */
function extractionOf(lines: string[]): DocumentExtraction {
  const blocks: DocumentBlock[] = lines.map((text, index) => ({
    text,
    page: 1,
    x: 0,
    y: 0,
    width: 0,
    fontSize: 11,
    heading: false,
    source: 'text',
  }));
  return {
    format: 'txt',
    status: 'ok',
    text: lines.join('\n'),
    blocks,
    pageCount: 1,
    characterCount: blocks.reduce((total, block) => total + block.text.length, 0),
    wordCount: blocks.reduce(
      (total, block) => total + block.text.split(/\s+/).filter(Boolean).length,
      0
    ),
    layout: 'single-column',
    isScanned: false,
    warnings: [],
  };
}

/** Parses the certifications section out of the given lines. */
function parseCertifications(lines: string[]) {
  return parseStructuredCv(extractionOf(lines)).cv.certificationDetails;
}

describe('the certificate importer', () => {
  it('reads a certificate with its issuer and its date', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'Introduction to Cybersecurity Awareness — HP LIFE | Nov 2024',
    ]);
    assert.equal(details.length, 1);
    assert.equal(details[0].name, 'Introduction to Cybersecurity Awareness');
    assert.equal(details[0].issuer, 'HP LIFE');
    assert.equal(details[0].issueDate, 'Nov 2024');
  });

  it('reads the tools a certificate covered', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'ITIDA & NTI | Power BI, Excel, SQL, Python',
    ]);
    assert.equal(details.length, 1);
    assert.equal(details[0].name, 'ITIDA & NTI');
    assert.deepEqual(details[0].skills, ['Power BI', 'Excel', 'SQL', 'Python']);
  });

  it('reads the credential identifier the issuing body printed', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'AI for Business – ITIDA & NTI (120 hrs | Student ID: 275809)',
    ]);
    assert.equal(details.length, 1);
    assert.equal(details[0].name, 'AI for Business');
    assert.equal(details[0].issuer, 'ITIDA & NTI');
    assert.equal(details[0].credentialId, '275809');
  });

  it('does not read an issuer out of the certificate name', () => {
    // "Google" is part of the name. It is not a statement that Google issued
    // the certificate, so no issuer may be inferred from it.
    const details = parseCertifications([
      'CERTIFICATIONS',
      'Google Data Analytics Professional Certificate (2023)',
    ]);
    assert.equal(details.length, 1);
    assert.equal(details[0].name, 'Google Data Analytics Professional Certificate (2023)');
    assert.equal(details[0].issuer, '');
    assert.equal(details[0].issueDate, '');
  });

  it('refuses to import a sentence as a certificate', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'Led 15+ community workshops reaching 200+ participants as team supervisor.',
    ]);
    assert.deepEqual(details, []);
  });

  it('refuses to import contact details as a certificate', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      '|+20 1006068026 | Gharbia, Egypt',
      '| Portfolio: someone-portfolio.vercel.app',
      '| View PDF | Independent Project',
    ]);
    assert.deepEqual(details, []);
  });

  it('refuses to import a bare list of technologies as a certificate', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'OSPF, VLANs, Inter-VLAN Routing, STP, EtherChannel, DHCP, DNS, NAT/PAT, HTTP, FTP',
    ]);
    assert.deepEqual(details, []);
  });

  it('refuses to import an achievement that carries a metric', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'Eliminated 100% of manual certificate creation through the Digital Certificate Engine.',
    ]);
    assert.deepEqual(details, []);
  });

  it('keeps a real certificate and drops the junk around it', () => {
    const details = parseCertifications([
      'CERTIFICATIONS',
      'KEY ACHIEVEMENTS',
      'Cybersecurity — Sprints | Jun 2025',
      'Automation.',
      'AI) serving 200+ active members.',
    ]);
    assert.equal(details.length, 1);
    assert.equal(details[0].name, 'Cybersecurity');
  });
});

describe('the certificate record and the CV', () => {
  function emptyDocument(): CVProfile {
    return {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      title: '',
      summary: '',
      experiences: [],
      education: [],
      projects: [],
      skillsList: [],
      certifications: [],
      certificationDetails: [],
      links: [],
    } as unknown as CVProfile;
  }

  function source(overrides: Partial<CvSourceData>): CvSourceData {
    return {
      profile: {
        fullName: 'A Candidate',
        headline: '',
        summary: '',
      },
      experiences: [],
      education: [],
      projects: [],
      volunteering: [],
      certifications: [],
      courses: [],
      skills: [],
      links: [],
      ...overrides,
    } as CvSourceData;
  }

  it('carries the description and the skills onto the CV', () => {
    const document = mergeCanonicalCvDocument(
      source({
        certifications: [
          {
            id: UUID_CERT,
            name: 'Data Analytics Professional Certificate',
            issuer: 'Google',
            issueDate: '2023-08-14',
            description: 'Built dashboards and practised SQL and statistics.',
            skills: ['SQL', 'Tableau'],
          },
        ],
      }),
      emptyDocument()
    );

    assert.deepEqual(document.certifications, ['Data Analytics Professional Certificate']);
    assert.equal(document.certificationDetails?.[0].description, 'Built dashboards and practised SQL and statistics.');
    assert.deepEqual(document.certificationDetails?.[0].skills, ['SQL', 'Tableau']);
    assert.equal(document.certificationDetails?.[0].credentialId, undefined);
  });
});

describe('skill gaps and the evidence behind a skill', () => {
  const requirements = toRoleSkillRequirements({
    requiredSkills: [
      { name: 'SQL', category: 'technical', minLevel: 3 },
      { name: 'Python', category: 'technical', minLevel: 3 },
    ],
    preferredSkills: [],
  } as never);

  it('treats a claimed skill as owned', () => {
    const gaps = computeSkillGaps(requirements, [{ name: 'SQL', level: 3 }]);
    const sql = gaps.find((gap) => gap.name === 'SQL');
    assert.equal(sql?.gap, 0);
    assert.equal(sql?.verified, false);
  });

  it('closes a gap the user\'s own records already closed', () => {
    // The candidate finished a course that taught SQL and never rated the
    // skill. The work they did still counts.
    const gaps = computeSkillGaps(requirements, [], new Map([['sql', 3]]));
    const sql = gaps.find((gap) => gap.name === 'SQL');
    assert.equal(sql?.currentLevel, 3);
    assert.equal(sql?.gap, 0);
    assert.equal(sql?.verified, true);
  });

  it('never lowers a rating the candidate gave', () => {
    const gaps = computeSkillGaps(
      requirements,
      [{ name: 'SQL', level: 5 }],
      new Map([['sql', 2]])
    );
    const sql = gaps.find((gap) => gap.name === 'SQL');
    assert.equal(sql?.currentLevel, 5);
    assert.equal(sql?.verified, true);
  });
});
