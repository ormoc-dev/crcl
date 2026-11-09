/** Default choir service + practice schedule (seeded once locally). */
export const DEFAULT_SCHEDULE = [
  {
    id: 'svc-sunday-6am',
    type: 'service',
    day: 'Sunday',
    title: 'Holy Mass',
    time: '6:00 AM',
    note: 'Christus Rex Choir serves',
  },
  {
    id: 'svc-sunday-8am',
    type: 'service',
    day: 'Sunday',
    title: 'Holy Mass',
    time: '8:00 AM',
    note: 'Christus Rex Choir serves',
  },
  {
    id: 'svc-special',
    type: 'service',
    day: 'Special',
    title: 'Feasts & Solemnities',
    time: 'As announced',
    note: 'Extra choir services for major celebrations',
  },
  {
    id: 'prac-saturday',
    type: 'practice',
    day: 'Saturday',
    title: 'Choir Practice',
    time: '4:00 PM',
    note: 'Rehearsal before Sunday service',
  },
]
