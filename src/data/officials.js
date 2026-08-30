// Illustrative pilot data only. These fictional records do not describe real people.
export const OFFICIALS = [
  {
    id: 'ny-pilot-rivera-001',
    name: 'Avery Rivera',
    office: 'Illustrative U.S. House Representative',
    district: 'New York Congressional District 10 (illustrative)',
    responsibilities: [
      'Represents the illustrative congressional district in federal legislative matters.',
      'Connects constituents with illustrative federal-agency casework pathways.',
    ],
    contact: {
      website: 'https://example.org/officials/avery-rivera',
      email: 'avery.rivera@example.org',
      phone: '+1-212-555-0101',
      officeAddress: 'Illustrative district office, Brooklyn, NY',
    },
    issueRecords: [
      {
        topic: 'ihra',
        position: 'supports',
        finding: 'Illustrative record: supported an illustrative resolution recognizing the IHRA working definition as a reference resource.',
        date: '2026-01-15',
        evidenceType: 'illustrative_resolution',
        source: {
          title: 'Illustrative IHRA reference resolution',
          url: 'https://example.org/evidence/avery-rivera-ihra',
          publishedAt: '2026-01-15',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-01-16',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
      {
        topic: 'bds_policy',
        position: 'opposes',
        finding: 'Illustrative record: opposed an illustrative policy proposal concerning BDS-related procurement restrictions.',
        date: '2026-02-02',
        evidenceType: 'illustrative_statement',
        source: {
          title: 'Illustrative procurement policy statement',
          url: 'https://example.org/evidence/avery-rivera-bds-policy',
          publishedAt: '2026-02-02',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-02-03',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
    ],
  },
  {
    id: 'ny-pilot-chen-002',
    name: 'Morgan Chen',
    office: 'Illustrative New York State Senator',
    district: 'New York State Senate District 26 (illustrative)',
    responsibilities: [
      'Represents the illustrative state senate district in New York legislative matters.',
      'Reviews illustrative state budget and policy proposals affecting constituents.',
    ],
    contact: {
      website: 'https://example.org/officials/morgan-chen',
      email: 'morgan.chen@example.org',
      phone: '+1-718-555-0102',
      officeAddress: 'Illustrative district office, Brooklyn, NY',
    },
    issueRecords: [
      {
        topic: 'ihra',
        position: 'mixed',
        finding: 'Illustrative record: took a mixed position in an illustrative hearing about use of the IHRA working definition in state guidance.',
        date: '2026-03-10',
        evidenceType: 'illustrative_hearing_record',
        source: {
          title: 'Illustrative state hearing record',
          url: 'https://example.org/evidence/morgan-chen-ihra',
          publishedAt: '2026-03-10',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-03-11',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
      {
        topic: 'israel_legislation',
        position: 'related_action',
        finding: 'Illustrative record: co-sponsored an illustrative measure concerning New York-Israel academic exchange reporting.',
        date: '2026-04-04',
        evidenceType: 'illustrative_bill_record',
        source: {
          title: 'Illustrative academic exchange measure',
          url: 'https://example.org/evidence/morgan-chen-israel-legislation',
          publishedAt: '2026-04-04',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-04-05',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
    ],
  },
  {
    id: 'ny-pilot-okafor-003',
    name: 'Jordan Okafor',
    office: 'Illustrative New York State Assembly Member',
    district: 'New York State Assembly District 52 (illustrative)',
    responsibilities: [
      'Represents the illustrative assembly district in New York legislative matters.',
      'Provides illustrative constituent-service and community liaison pathways.',
    ],
    contact: {
      website: 'https://example.org/officials/jordan-okafor',
      email: 'jordan.okafor@example.org',
      phone: '+1-718-555-0103',
      officeAddress: 'Illustrative district office, Brooklyn, NY',
    },
    issueRecords: [
      {
        topic: 'ihra',
        position: 'no_documented_position',
        finding: 'Illustrative record: no documented position was included in this demo dataset for the IHRA working definition.',
        date: '2026-05-01',
        evidenceType: 'illustrative_record_review',
        source: {
          title: 'Illustrative record review',
          url: 'https://example.org/evidence/jordan-okafor-ihra',
          publishedAt: '2026-05-01',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-05-02',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
      {
        topic: 'antisemitism',
        position: 'related_action',
        finding: 'Illustrative record: participated in an illustrative community briefing about responding to antisemitic incidents.',
        date: '2026-06-18',
        evidenceType: 'illustrative_community_briefing',
        source: {
          title: 'Illustrative community briefing summary',
          url: 'https://example.org/evidence/jordan-okafor-antisemitism',
          publishedAt: '2026-06-18',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-06-19',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
      {
        topic: 'jewish_community',
        position: 'supports',
        finding: 'Illustrative record: supported an illustrative neighborhood grant for Jewish community programming.',
        date: '2026-07-08',
        evidenceType: 'illustrative_grant_record',
        source: {
          title: 'Illustrative neighborhood grant record',
          url: 'https://example.org/evidence/jordan-okafor-jewish-community',
          publishedAt: '2026-07-08',
        },
        verification: {
          status: 'demo_only',
          verifiedAt: '2026-07-09',
          note: 'Illustrative pilot record; not a claim about a real official.',
        },
      },
    ],
  },
];
