/* ==========================================================================
   Know Your Officials — content
   --------------------------------------------------------------------------
   Every user-visible string lives here. Nothing in app.js or index.html
   should contain sentence text: markup carries `data-copy` keys, and the
   application reads from this object.

   Why: copy is edited far more often than logic, usually by someone who is
   not editing logic. Keeping it in one file means a wording change is a
   one-line edit in a known place, the app can be proof-read end to end
   without reading any code, and translating it later means adding a sibling
   file rather than hunting through render functions.

   Conventions
     * Plain strings for fixed text.
     * Functions for text that interpolates, so word order stays adjustable
       — some languages cannot keep the English order.
     * Link entries keep title, description and destination together, since
       changing one usually means changing the others.
   ========================================================================== */

'use strict';

window.COPY = {

  locale: 'en-US',

  /* ---------------- Reference data ---------------- */

  states: {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  },

  /* Lower chambers are not called the same thing in every state. Matched
     against the chamber name in the data, first hit wins. */
  chambers: {
    upper: 'State Senate',
    lower: [
      { match: /assembly/i, label: 'State Assembly' },
      { match: /delegates/i, label: 'House of Delegates' },
      { match: /./, label: 'State House' },
    ],
    lowerFallback: 'State legislature',
  },

  parties: {
    Democratic: 'Democrat',
    Democrat: 'Democrat',
    Republican: 'Republican',
    Conservative: 'Conservative',
    Independent: 'Independent',
  },

  /* ---------------- Document ---------------- */

  document: {
    title: 'Know Your Officials — find and contact the people who represent you',
  },

  /* ---------------- Fixed markup labels ---------------- */
  /* Keys here are referenced from index.html as data-copy="…". */

  ui: {
    'skip': 'Skip to the search',

    'brand.name': 'Know Your Officials',
    'brand.tagline': 'Who represents this address',

    'display.textSize': 'Text size',
    'display.textSize.normal': 'Normal',
    'display.textSize.large': 'Large',
    'display.textSize.largest': 'Largest',
    'display.color': 'Color',
    'display.color.auto': 'Auto',
    'display.color.light': 'Light',
    'display.color.dark': 'Dark',

    'home.headline': 'Know who speaks for you, from your statehouse to Washington.',
    'home.standfirst': 'Enter your address to see every official who represents it, '
      + 'what they work on, and the phone numbers and emails that reach their offices.',
    'home.mode.legend': 'What are you going to type?',
    'home.mode.address': 'Street address',
    'home.mode.zip': 'ZIP code only',
    'home.submit': 'Show my representatives',
    'home.privacy': 'Your address is used once to look up your districts. '
      + 'It is never stored or shared.',

    'results.searchLabel': 'Your address or ZIP code',
    'results.submit': 'Search again',
    'results.narrow': 'Narrow this list',
    'results.group.level': 'Level of government',
    'results.group.office': 'Office',
    'results.group.party': 'Party',
    'results.group.contact': 'Ways to reach them',
    'results.reset': 'Show all again',
    'results.order': 'Order',
    'results.order.level': 'Closest to home first',
    'results.order.name': 'Name, A to Z',
    'results.order.party': 'Party',

    'official.breadcrumb': 'Breadcrumb',

    'loading.default': 'Looking up your districts…',

    'draft.title': 'Write to this office',
    'draft.close': 'Close',

    'footer.blurb': 'a public directory of elected officials and how to reach them.',
  },

  /* ---------------- Search ---------------- */

  home: {
    addressLabel: 'Your address',
    addressPlaceholder: '123 Main Street, City, State',
    zipLabel: 'Your ZIP code',
    zipPlaceholder: '12345',
    tooShort: 'Enter a street address with the city and state, or a 5-digit ZIP code.',
  },

  /* ---------------- Results ---------------- */

  results: {
    loadingZip: (zip) => `Finding the districts that cover ${zip}…`,
    loadingAddress: 'Matching your address to official district boundaries…',

    matchedPrefix: 'Matched to ',
    coveringPrefix: 'Districts covering ',

    districtNumber: (number) => `District ${number}`,
    captionCongress: 'U.S. House',

    chipBoundaries: 'Official boundaries',
    chipBoundariesTitle: (via) => `Location found by ${via}. Districts from Census TIGERweb.`,
    chipApproximate: 'Approximate — a ZIP code can cross districts',
    chipApproximateTitle: 'One ZIP code can cover more than one district. '
      + 'A street address gives an exact answer.',

    /* The count is rendered with the number emphasised, so this is only the
       text that follows it. */
    countAll: (n) => (n === 1 ? ' official represents this address' : ' officials represent this address'),
    countFiltered: (n, total) => `${n === 1 ? ' official' : ' officials'} shown out of ${total}`,

    contact: {
      phone: 'Has a phone number',
      email: 'Can be emailed',
      local: 'Has a local office',
    },

    noMatchTitle: 'Nothing matches those choices',
    noMatchBody: (total) => `This address is represented by ${total} officials. `
      + 'Clear a choice to see them again.',
    noMatchAction: 'Show all again',
  },

  /* ---------------- Failures ---------------- */

  errors: {
    directoryFailed: 'The directory could not load. Check your connection and reload the page.',

    outsideTitle: 'Not covered yet',
    outsideBody: (query) => `We found “${query}”, but this directory does not cover that area yet. `
      + 'More states are being added.',

    notFoundTitle: 'That address did not match',
    notFoundBody: (query) => `We could not find “${query}”. Check the spelling, add the city and `
      + 'state, or use a 5-digit ZIP code instead.',

    slowTitle: 'That address did not match',
    slowBody: (query) => `The address lookup did not respond in time. Your search for “${query}” `
      + 'can be tried again.',

    tryAgain: 'Try again',
    searchAnother: 'Search another address',

    /* Thrown internally and matched on, never shown as-is. */
    codes: { outside: 'outside coverage', notFound: 'not found' },
  },

  /* ---------------- Officials ---------------- */

  official: {
    photoAlt: (name) => `Photograph of ${name}`,
    cardAria: (name, office, seat) => `${name}, ${office}, ${seat}`,
    cardRole: (office, seat) => `${office} · ${seat}`,

    partyUnlisted: 'Party not listed',
    partyLines: (raw) => `Ran on these party lines: ${raw}`,

    seatStatewide: (state) => `Represents all of ${state}`,
    seatCongress: (number) => `Congressional district ${number}`,
    seatChamber: (chamber, number) => `${chamber} district ${number}`,

    /* Used inside letters, so it has to read mid-sentence. */
    districtStatewide: (state) => `all of ${state}`,
    districtCongress: (state, number) => `${state} congressional district ${number}`,
    districtChamber: (state, chamber, number) => `${state} ${chamber} district ${number}`,

    factEmail: 'Email listed',
    factWebForm: 'Web form',
    factLocalOffice: 'Local office',

    termEnds: (date) => `Term ends ${date}`,
    role: (office, body) => `${office}, ${body}`,

    back: 'Back to the list',
    backFresh: 'Search another address',

    call: (number) => `Call ${number}`,
    write: 'Write to this office',

    reachHeading: 'Every way to reach them',
    reachEmail: 'Email',
    reachContactForm: 'Contact form',
    reachContactFormAction: 'Open the web form',
    reachWebsite: 'Official website',
    copy: 'Copy',
    copyTitle: (label) => `Copy ${label}`,

    socialTwitter: (handle) => `X / Twitter @${handle}`,

    receiptChip: 'Checked record',
    receiptFrom: 'From ',
    receiptUpdated: (date, relative) => `Updated ${date}, ${relative}`,
    receiptOpen: 'Open the original source',
    sourceOpenStates: 'OpenStates',
    sourceCongress: 'unitedstates.io congress-legislators',
  },

  /* ---------------- The three folders ---------------- */
  /* Each link keeps its title, description and destination together. The
     context passed to href() is built in app.js. */

  folders: {
    voting: {
      title: 'Voting history',
      subtitle: 'Their legislative record, on the official sites',
      note: {
        lead: 'Why we link instead of summarizing.',
        rest: 'Summaries go stale and invite argument. These are the official records, '
          + 'so anything you quote can be checked on the spot.',
      },
      links: {
        federalSponsored: {
          title: 'Bills they sponsored',
          desc: 'The Congress.gov record of every bill this member put their name to.',
          href: (c) => `https://www.congress.gov/member/${c.bioguide}/legislation`,
        },
        federalVotes: {
          title: 'Every vote they cast',
          desc: 'The full roll-call record, including votes missed, on GovTrack.',
          href: (c) => `https://www.govtrack.us/congress/members/${c.bioguide}`,
        },
        federalBio: {
          title: 'Official biography',
          desc: 'The Biographical Directory of the United States Congress.',
          href: (c) => `https://bioguide.congress.gov/search/bio/${c.bioguide}`,
        },
        stateSponsoredUpper: {
          title: 'Bills they sponsored in the State Senate',
          desc: 'The official State Senate legislation search, narrowed to this member.',
          href: (c) => `https://www.nysenate.gov/search/legislation?searched=true&sponsor=${encodeURIComponent(c.name)}`,
        },
        stateSponsoredLower: {
          title: 'Bills they sponsored',
          desc: 'Their official chamber page, including the bills they sponsored.',
          href: (c) => c.chamberPage || 'https://nyassembly.gov/mem/',
        },
        stateHowVoted: {
          title: 'Look up how they voted on a bill',
          desc: 'Search any bill number to see the recorded vote.',
          href: () => 'https://www.nysenate.gov/search/legislation',
        },
      },
    },

    issues: {
      title: 'Platform and issues',
      subtitle: 'What this official works on, and how to check it',
      note: {
        lead: 'Before you contact them:',
        rest: 'check which committees they sit on. Committees decide which bills move, so a '
          + 'request outside their committees is unlikely to go anywhere.',
      },
      links: {
        ownSite: {
          title: 'What they say they care about',
          desc: 'The issue pages and press releases their own office publishes.',
          href: (c) => c.website,
        },
        committeesFederal: {
          title: 'The committees they sit on',
          desc: 'Committees decide which bills move. This is the clearest sign of what a '
            + 'member works on.',
          href: (c) => `https://www.congress.gov/member/${c.bioguide}/committee-assignments`,
        },
        committeesState: {
          title: 'The committees they sit on',
          desc: 'Committee seats show which policy areas this legislator works in.',
          href: (c) => (c.isSenate
            ? 'https://www.nysenate.gov/senators-committees'
            : 'https://nyassembly.gov/comm/'),
        },
        independent: {
          title: 'An independent profile',
          desc: 'Ballotpedia’s neutral summary of positions, endorsements and past elections.',
          href: (c) => c.ballotpedia,
        },
      },
    },

    meetings: {
      title: 'Upcoming meetings and hearings',
      subtitle: 'Public sessions where residents can speak or send testimony',
      note: {
        lead: 'If you cannot attend:',
        rest: 'most public hearings accept written testimony, and what you write becomes '
          + 'part of the permanent record.',
      },
      links: {
        federalHearings: {
          title: 'Upcoming committee hearings',
          desc: 'The Congress.gov calendar of hearings and markups.',
          href: () => 'https://www.congress.gov/committees/hearings-meetings',
        },
        federalLocal: {
          title: 'Local office hours and town halls',
          desc: 'Posted on their own site. Usually the fastest way to speak to them in person.',
          href: (c) => c.website || 'https://www.house.gov/representatives',
        },
        stateHearings: {
          title: 'Public hearings you can attend',
          desc: 'The official calendar, including how to submit written testimony.',
          href: (c) => (c.isSenate
            ? 'https://www.nysenate.gov/events'
            : 'https://nyassembly.gov/leg/?sh=hear'),
        },
        stateCalendar: {
          title: 'When they are in session',
          desc: 'The session calendar shows when they are at the capitol and when they are '
            + 'back in the district.',
          href: (c) => (c.isSenate
            ? 'https://www.nysenate.gov/calendar'
            : 'https://nyassembly.gov/leg/?sh=calendar'),
        },
      },
    },
  },

  /* ---------------- Write to this office ---------------- */

  draft: {
    intro: (name, seat) => `Written for ${name}, ${seat}. Everything stays on this device.`,
    channelLabel: 'How do you want to contact them?',
    channelEmail: 'Email or letter',
    channelPhone: 'Phone call',
    topicLabel: 'What is it about?',
    nameLabel: 'Your name',
    namePlaceholder: 'Your name',
    nameHint: 'Staff record who contacted them, and from where. Both help your case.',
    townLabel: 'Your city or neighborhood',
    townPlaceholder: 'Your city or neighborhood',
    messageLabel: 'Your message — change anything you like',
    copyMessage: 'Copy the message',
    /* Names the thing copied, for the confirmation toast. */
    messageNoun: 'Message',
    openEmail: 'Open in my email app',
    openForm: 'Open their contact form',
    openSite: 'Open their website',
    close: 'Close',
    subject: (topic) => `Message from a constituent: ${topic}`,
  },

  topics: [
    { id: 'safety', label: 'Public safety in my neighborhood',
      ask: 'address the public safety concerns residents are raising in this neighborhood' },
    { id: 'schools', label: 'Schools and education',
      ask: 'support stronger funding and oversight for the public schools in this district' },
    { id: 'housing', label: 'Housing costs',
      ask: 'act on housing costs for working families in this district' },
    { id: 'health', label: 'Health care access',
      ask: 'protect and expand access to affordable health care here' },
    { id: 'transit', label: 'Transportation and roads',
      ask: 'fund the road and transit repairs residents depend on every day' },
    { id: 'meeting', label: 'Asking for a meeting',
      ask: 'meet a small group of constituents to discuss local priorities' },
    { id: 'thanks', label: 'Thanking them for a position they took',
      ask: 'hold to that position' },
  ],

  /* The generated drafts. `home` is already phrased as " in Queens" or empty,
     so the sentence reads correctly either way. */
  letters: {
    thanks: ({ title, surname, home, district, ask, signature, sign }) =>
`Dear ${title} ${surname},

I am a constituent living${home}, in ${district}.

I am writing to say thank you. The position you took was noticed here, and I hope you will ${ask}.

If it would help to hear directly from residents on this, I am glad to help arrange it.

With appreciation,
${signature}${sign}`,

    standard: ({ title, surname, home, district, topic, ask, signature, sign }) =>
`Dear ${title} ${surname},

I am a constituent living${home}, in ${district}, and I am writing about ${topic}.

This affects my household and many others nearby. I am asking you to ${ask}.

Could someone from your office tell me what steps you are able to take, and by when? I would welcome the chance to discuss it with you or your staff.

Thank you for your time.

Sincerely,
${signature}${sign}`,

    script: ({ title, name, district, ask }) =>
`Hello, my name is [your name] and I am a constituent in ${district}.

I am calling to ask ${name} to ${ask}.

Could you tell me the ${title}'s current position on this, and record my call?

Thank you. I would appreciate a reply at [your phone number or email].`,

    placeholderName: '[your name]',
  },

  /* ---------------- Small stuff ---------------- */

  toast: {
    copied: (label) => `${label} copied`,
    copyFailed: 'Copy did not work. Select the text and press Ctrl+C.',
  },

  time: {
    justNow: 'just now',
    hoursAgo: (n) => `${n} hours ago`,
    yesterday: 'yesterday',
    daysAgo: (n) => `${n} days ago`,
    unknown: '—',
  },

  footer: {
    updated: (date) => `Directory updated ${date}`,
  },
};
