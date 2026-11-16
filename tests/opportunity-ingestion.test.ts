/**
 * Regression tests for the opportunity source adapters.
 *
 * The bug these lock down: the platform showed opportunities it could not
 * vouch for. A record carried a deadline that nobody had published, a cost
 * that had been guessed, and no link back to the page it came from, so a
 * candidate could not tell a real programme from a plausible-looking one.
 *
 * The rules now are:
 *
 *   - nothing is recorded that the source did not publish;
 *   - a date the source stated as a month is recorded as a month, and the
 *     wording is kept so the interface can show exactly what was published;
 *   - every record names the careers it concerns, or names none.
 *
 * The fixtures below are trimmed copies of the real markup the sources
 * publish, so the parsers are tested against the shape they will meet.
 *
 * These are pure: they need no database, no network and no server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyKind,
  computeStatus,
  detectAudience,
  detectCohort,
  detectCost,
  detectDeadline,
  detectEligibility,
  detectParticipationMode,
  detectTrainingHours,
  mapDomains,
  mapRoles,
  mapSkills,
  parseMcitAnnouncementDetail,
  parseMcitAnnouncementList,
  parseNtiProgramCards,
  resolveUrl,
  toPlainText,
} from '../server/opportunities/sources.ts';

/** The shape of MCIT's announcement list, trimmed. */
const MCIT_LIST = `
<div class="MediaList">
  <article class='media'>
    <div class="media-right text-right">
      <span class="ColoredDate ">15 </span>
      <span>Nov 2026    </span>
    </div>
    <div class="media-body ">
      <div>
        <a class="title"   href='/en/Media_Center/Latest_News/Announcement/121642'> ITI–Si-Ware Physical AI Fellowship  </a>
        <br />
        <p style="padding-left:0px;"><span class="brief"> </span></p></div>
    </div>
  </article>
  <article class='media'>
    <div class="media-right text-right">
      <span class="ColoredDate ">04 </span>
      <span>Nov 2026    </span>
    </div>
    <div class="media-body ">
      <div>
        <a class="title"   href='/en/Media_Center/Latest_News/Announcement/121610'> Mahara-Tech Course: Applied Modern C++ on Embedded Systems  </a>
      </div>
    </div>
  </article>
</div>
`;

/** The shape of an MCIT announcement page, trimmed. */
const MCIT_DETAIL = `
<div class="title">AI Ambassadors Program</div>
<span class="ColoredDate ">26 </span>
<span>October  2026    </span>
<span class="brief">
The National Telecommunication Institute (NTI) is accepting applications for a new round of the Artificial Intelligence Ambassadors Program, including the 14th cohort of the basic level and the 8th cohort of the advanced level. Training is delivered online in collaboration with Engineers for A Sustainable Egypt. The basic level comprises 36 hours of training and a four-hour applied project. Applicants must successfully complete the basic level before enrolling in the advanced level. The deadline for applications is November 15.
<a href="https://www.nti.sci.eg/ai-ambassadors/">here</a>
To apply for the basic level, kindly <a href="https://forms.cloud.microsoft/pages/responsepage.aspx?id=basic">click here</a>.
To apply for the advanced level, kindly <a href="https://forms.cloud.microsoft/pages/responsepage.aspx?id=advanced">click here</a>.
</span>
`;

/** The shape of NTI's programme cards, trimmed. */
const NTI_CARDS = `
<div class="card_about">
  <div class="front">
    <h5>Train To Hire (4 Month)</h5>
    <p>Full scholarship.288 technical hours, 132 soft skills hours, and 120 on job training hours.</p>
    <a href="/dey/HireReady.html">More Details</a>
  </div>
  <div class="back">
    <h5>Train To Hire (4 Month)</h5>
    <p>Full scholarship.288 technical hours, 132 soft skills hours, and 120 on job training hours.</p>
    <a href="/dey/HireReady.html">More Details</a>
  </div>
</div>
<div class="card_about">
  <div class="front">
    <h5>Upskilling Programs</h5>
    <p>Short programmes for working professionals.</p>
    <a href="upskilling.html">More Details</a>
  </div>
</div>
`;

describe('reading the MCIT announcement list', () => {
  it('reads the id, the title and the date of each announcement', () => {
    const items = parseMcitAnnouncementList(MCIT_LIST);

    assert.equal(items.length, 2);
    assert.equal(items[0].externalId, '121642');
    assert.equal(items[0].title, 'ITI–Si-Ware Physical AI Fellowship');
    assert.equal(items[0].publishedAt, '2026-11-15');
    assert.equal(items[0].url, 'https://mcit.gov.eg/en/Media_Center/Latest_News/Announcement/121642');
    assert.equal(items[1].externalId, '121610');
    assert.equal(items[1].publishedAt, '2026-11-04');
  });

  it('ignores a block that is not an announcement', () => {
    const items = parseMcitAnnouncementList(
      `<article class='media'><a class="title" href='/en/other/page'>Not an announcement</a></article>`,
    );
    assert.equal(items.length, 0);
  });
});

describe('reading an MCIT announcement', () => {
  const detail = parseMcitAnnouncementDetail(MCIT_DETAIL);

  it('reads the body', () => {
    assert.match(detail.body, /Artificial Intelligence Ambassadors Program/);
    assert.match(detail.body, /36 hours of training/);
  });

  it('keeps each link with the words that explain it', () => {
    assert.equal(detail.links.length, 3);
    const application = detail.links.find((link) => link.href.includes('id=basic'));
    assert.ok(application, 'the basic application link must be found');
    assert.match(application.context, /apply for the basic level/i);
  });
});

describe('the deadline the source published', () => {
  it('reads a deadline that names a day', () => {
    const deadline = detectDeadline(
      'The deadline for applications is November 15.',
      '2026-10-26',
    );

    assert.equal(deadline.date, '2026-11-15');
    assert.equal(deadline.precision, 'day');
    assert.match(deadline.text ?? '', /November 15/);
  });

  it('reads a deadline that names only a month, and says so', () => {
    const deadline = detectDeadline(
      'The deadline for applications is November.',
      '2026-10-26',
    );

    assert.equal(deadline.precision, 'month');
    assert.equal(deadline.date, '2026-11-30');
  });

  it('moves a deadline that has not happened yet into the following year', () => {
    // An announcement published in December about a deadline in January.
    const deadline = detectDeadline(
      'The deadline for applications is January 20.',
      '2026-12-10',
    );

    assert.equal(deadline.date, '2027-01-20');
  });

  it('records no deadline when the source published none', () => {
    const deadline = detectDeadline('Applications are open.', '2026-10-26');

    assert.equal(deadline.date, null);
    assert.equal(deadline.text, null);
    assert.equal(deadline.precision, null);
  });
});

describe('the rest of what the source states', () => {
  it('reads the cohort', () => {
    assert.equal(
      detectCohort('including the 14th cohort of the basic level and the 8th cohort of the advanced level'),
      '14th cohort',
    );
  });

  it('reads the training hours', () => {
    assert.equal(
      detectTrainingHours('The basic level comprises 36 hours of training and a four-hour applied project.'),
      36,
    );
  });

  it('reads how the programme is delivered', () => {
    assert.equal(detectParticipationMode('Training is delivered online.'), 'online');
    assert.equal(detectParticipationMode('The course runs on-site in Cairo.'), 'onsite');
    assert.equal(detectParticipationMode('The programme is hybrid.'), 'hybrid');
    assert.equal(detectParticipationMode('Join us.'), 'unspecified');
  });

  it('reads the cost only when the source states it', () => {
    assert.equal(detectCost('Full scholarship.288 technical hours.').type, 'free');
    assert.equal(detectCost('A registration fee of 500 EGP applies.').type, 'paid');
    assert.equal(detectCost('Join us.').type, 'unspecified');
  });

  it('reads the eligibility the source stated', () => {
    const eligibility = detectEligibility(
      'Applicants must successfully complete the basic level before enrolling in the advanced level.',
    );
    assert.ok(eligibility, 'the eligibility sentence must be found');
    assert.match(eligibility, /must successfully complete/i);
  });

  it('reads the audience', () => {
    assert.ok(detectAudience('Open to university students in Egypt.').includes('university_students'));
    assert.deepEqual(detectAudience('Join us.'), ['everyone']);
  });
});

describe('the kind of opportunity', () => {
  it('tells the kinds apart', () => {
    assert.equal(classifyKind('ITI–Si-Ware Physical AI Fellowship', ''), 'fellowship');
    assert.equal(classifyKind('SECC Tech Night: Vibe Engineering', ''), 'conference');
    assert.equal(classifyKind('SECC Webinar: Enriching Agentic AI', ''), 'webinar');
    assert.equal(classifyKind('National Hackathon 2026', ''), 'hackathon');
    assert.equal(classifyKind('Mahara-Tech Course: Modern C++', ''), 'training');
  });
});

describe('the careers a programme concerns', () => {
  it('attaches the domains the page names', () => {
    const domains = mapDomains('A course on data analysis and machine learning', ['technology']);
    assert.ok(domains.includes('data'), 'the data domain must be found');
    assert.ok(domains.includes('technology'), 'the source default must be kept');
  });

  it('attaches a role the page names', () => {
    const roles = mapRoles('A programme for aspiring Data Analysts and Python developers.');
    assert.ok(roles.includes('data-analyst'), 'the named role must be attached');
  });

  it('attaches no role when the page names none', () => {
    assert.deepEqual(mapRoles('A morning of talks about the future of work.'), []);
  });

  it('attaches the skills the page names', () => {
    const skills = mapSkills('The programme covers Python, SQL and React.');
    assert.ok(skills.length > 0, 'the named skills must be found');
  });
});

describe('the status of an opportunity', () => {
  const now = new Date('2026-11-16T09:00:00Z');

  it('closes an opportunity whose deadline has passed', () => {
    assert.equal(computeStatus('2026-11-15', '2026-10-26', now), 'closed');
  });

  it('calls an opportunity closing soon closing soon', () => {
    assert.equal(computeStatus('2026-11-20', '2026-10-26', now), 'closing_soon');
  });

  it('leaves an opportunity with no deadline open', () => {
    assert.equal(computeStatus(null, '2026-10-26', now), 'open');
  });

  it('leaves an opportunity with a future deadline open', () => {
    assert.equal(computeStatus('2026-12-20', '2026-10-26', now), 'open');
  });
});

describe('reading the NTI programme cards', () => {
  it('reads each programme and its page', () => {
    const items = parseNtiProgramCards(NTI_CARDS);

    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Train To Hire (4 Month)');
    assert.equal(items[0].url, 'https://www.nti.sci.eg/dey/HireReady.html');
    assert.match(items[0].description ?? '', /Full scholarship/);
  });

  it('reads a relative link that has no leading slash', () => {
    const items = parseNtiProgramCards(NTI_CARDS);
    assert.equal(items[1].url, 'https://www.nti.sci.eg/upskilling.html');
  });
});

describe('the small helpers', () => {
  it('resolves a link against the page it came from', () => {
    assert.equal(resolveUrl('https://www.nti.sci.eg/', '/dey/HireReady.html'), 'https://www.nti.sci.eg/dey/HireReady.html');
    assert.equal(resolveUrl('https://www.nti.sci.eg/', 'upskilling.html'), 'https://www.nti.sci.eg/upskilling.html');
    assert.equal(resolveUrl('https://www.nti.sci.eg/', 'https://other.example/x'), 'https://other.example/x');
  });

  it('removes the tags and keeps the words', () => {
    assert.equal(toPlainText('<p>Hello <strong>world</strong></p>'), 'Hello world');
  });
});
