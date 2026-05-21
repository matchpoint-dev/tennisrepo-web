// Shared 2026 ATP calendar data used by calendar/page.tsx and the homepage widget.

export interface TournamentEntry {
  dates: string;
  name: string;
  location: string;
  level: string;
  surface: string;
  /** Partial name used to search Supabase for the latest edition */
  dbSearch: string;
}

export interface MonthSection {
  month: string;
  tournaments: TournamentEntry[];
}

export const CALENDAR: MonthSection[] = [
  {
    month: 'January',
    tournaments: [
      { dates: 'Jan 2–11',     name: 'United Cup',                              location: 'Sydney/Perth, Australia',       level: 'Team Event',       surface: 'Hard (outdoor)', dbSearch: 'United Cup' },
      { dates: 'Jan 4–11',     name: 'Brisbane International',                  location: 'Brisbane, Australia',           level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Brisbane' },
      { dates: 'Jan 5–11',     name: 'Hong Kong Open',                          location: 'Hong Kong, China',              level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Hong Kong' },
      { dates: 'Jan 12–17',    name: 'Adelaide International',                  location: 'Adelaide, Australia',           level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Adelaide' },
      { dates: 'Jan 12–17',    name: 'ASB Classic',                             location: 'Auckland, New Zealand',         level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Auckland' },
      { dates: 'Jan 18–Feb 1', name: 'Australian Open',                         location: 'Melbourne, Australia',          level: 'Grand Slam',       surface: 'Hard (outdoor)', dbSearch: 'Australian Open' },
    ],
  },
  {
    month: 'February',
    tournaments: [
      { dates: 'Feb 2–8',      name: 'Open Occitanie Montpellier',              location: 'Montpellier, France',           level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Montpellier' },
      { dates: 'Feb 9–15',     name: 'Dallas Open',                             location: 'Dallas, United States',         level: 'ATP 500',          surface: 'Hard (indoor)',  dbSearch: 'Dallas' },
      { dates: 'Feb 9–15',     name: 'ABN AMRO Open',                           location: 'Rotterdam, Netherlands',        level: 'ATP 500',          surface: 'Hard (indoor)',  dbSearch: 'Rotterdam' },
      { dates: 'Feb 9–15',     name: 'IEB+ Argentina Open',                     location: 'Buenos Aires, Argentina',       level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Buenos Aires' },
      { dates: 'Feb 16–22',    name: 'Open 13 Provence',                        location: 'Marseille, France',             level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Marseille' },
      { dates: 'Feb 16–22',    name: 'Qatar Open',                              location: 'Doha, Qatar',                   level: 'ATP 500',          surface: 'Hard (outdoor)', dbSearch: 'Doha' },
      { dates: 'Feb 16–22',    name: 'Rio Open',                                location: 'Rio de Janeiro, Brazil',        level: 'ATP 500',          surface: 'Clay',           dbSearch: 'Rio' },
      { dates: 'Feb 16–22',    name: 'Delray Beach Open',                       location: 'Delray Beach, United States',   level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Delray Beach' },
      { dates: 'Feb 23–Mar 1', name: 'Mexican Open',                            location: 'Acapulco, Mexico',              level: 'ATP 500',          surface: 'Clay',           dbSearch: 'Acapulco' },
      { dates: 'Feb 23–Mar 1', name: 'Dubai Duty Free Tennis Championships',    location: 'Dubai, UAE',                    level: 'ATP 500',          surface: 'Hard (outdoor)', dbSearch: 'Dubai' },
      { dates: 'Feb 23–Mar 1', name: 'Movistar Chile Open',                     location: 'Santiago, Chile',               level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Santiago' },
    ],
  },
  {
    month: 'March',
    tournaments: [
      { dates: 'Mar 4–15',     name: 'BNP Paribas Open',                        location: 'Indian Wells, United States',   level: 'ATP Masters 1000', surface: 'Hard (outdoor)', dbSearch: 'Indian Wells' },
      { dates: 'Mar 18–29',    name: 'Miami Open',                              location: 'Miami, United States',          level: 'ATP Masters 1000', surface: 'Hard (outdoor)', dbSearch: 'Miami' },
      { dates: 'Mar 30–Apr 5', name: 'Tiriac Open',                             location: 'Bucharest, Romania',            level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Bucharest' },
      { dates: 'Mar 30–Apr 5', name: "U.S. Men's Clay Court Championship",      location: 'Houston, United States',        level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Houston' },
      { dates: 'Mar 30–Apr 5', name: 'Grand Prix Hassan II',                    location: 'Marrakech, Morocco',            level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Marrakech' },
    ],
  },
  {
    month: 'April',
    tournaments: [
      { dates: 'Apr 5–12',     name: 'Rolex Monte-Carlo Masters',               location: 'Monte Carlo, Monaco',           level: 'ATP Masters 1000', surface: 'Clay',           dbSearch: 'Monte Carlo' },
      { dates: 'Apr 13–19',    name: 'Barcelona Open Banc Sabadell',            location: 'Barcelona, Spain',              level: 'ATP 500',          surface: 'Clay',           dbSearch: 'Barcelona' },
      { dates: 'Apr 13–19',    name: 'BMW Open',                                location: 'Munich, Germany',               level: 'ATP 500',          surface: 'Clay',           dbSearch: 'Munich' },
      { dates: 'Apr 22–May 3', name: 'Mutua Madrid Open',                       location: 'Madrid, Spain',                 level: 'ATP Masters 1000', surface: 'Clay',           dbSearch: 'Madrid' },
    ],
  },
  {
    month: 'May',
    tournaments: [
      { dates: 'May 6–17',     name: "Internazionali BNL d'Italia",             location: 'Rome, Italy',                   level: 'ATP Masters 1000', surface: 'Clay',           dbSearch: 'Rome' },
      { dates: 'May 17–23',    name: 'Hamburg Open',                            location: 'Hamburg, Germany',              level: 'ATP 500',          surface: 'Clay',           dbSearch: 'Hamburg' },
      { dates: 'May 17–23',    name: 'Gonet Geneva Open',                       location: 'Geneva, Switzerland',           level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Geneva' },
      { dates: 'May 24–Jun 7', name: 'Roland-Garros (French Open)',             location: 'Paris, France',                 level: 'Grand Slam',       surface: 'Clay',           dbSearch: 'Roland Garros' },
    ],
  },
  {
    month: 'June',
    tournaments: [
      { dates: 'Jun 8–14',     name: 'Libéma Open',                             location: "'s-Hertogenbosch, Netherlands", level: 'ATP 250',          surface: 'Grass',          dbSearch: 's-Hertogenbosch' },
      { dates: 'Jun 8–14',     name: 'BOSS Open',                               location: 'Stuttgart, Germany',            level: 'ATP 250',          surface: 'Grass',          dbSearch: 'Stuttgart' },
      { dates: 'Jun 15–21',    name: 'Terra Wortmann Open',                     location: 'Halle, Germany',                level: 'ATP 500',          surface: 'Grass',          dbSearch: 'Halle' },
      { dates: "Jun 15–21",    name: "The HSBC Championships (Queen's Club)",   location: 'London, United Kingdom',        level: 'ATP 500',          surface: 'Grass',          dbSearch: 'Queens' },
      { dates: 'Jun 21–27',    name: 'Mallorca Championships',                  location: 'Mallorca, Spain',               level: 'ATP 250',          surface: 'Grass',          dbSearch: 'Mallorca' },
      { dates: 'Jun 22–28',    name: 'Rothesay International',                  location: 'Eastbourne, United Kingdom',    level: 'ATP 250',          surface: 'Grass',          dbSearch: 'Eastbourne' },
      { dates: 'Jun 29–Jul 12',name: 'Wimbledon',                               location: 'London, United Kingdom',        level: 'Grand Slam',       surface: 'Grass',          dbSearch: 'Wimbledon' },
    ],
  },
  {
    month: 'July',
    tournaments: [
      { dates: 'Jul 13–19',    name: 'Nordea Open',                             location: 'Båstad, Sweden',                level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Bastad' },
      { dates: 'Jul 13–19',    name: 'EFG Swiss Open Gstaad',                   location: 'Gstaad, Switzerland',           level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Gstaad' },
      { dates: 'Jul 13–19',    name: 'Plava Laguna Croatia Open Umag',          location: 'Umag, Croatia',                 level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Umag' },
      { dates: 'Jul 19–25',    name: 'Generali Open',                           location: 'Kitzbühel, Austria',            level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Kitzbuhel' },
      { dates: 'Jul 20–26',    name: 'Millennium Estoril Open',                 location: 'Estoril, Portugal',             level: 'ATP 250',          surface: 'Clay',           dbSearch: 'Estoril' },
      { dates: 'Jul 20–26',    name: 'Mifel Tennis Open',                       location: 'Los Cabos, Mexico',             level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Los Cabos' },
      { dates: 'Jul 27–Aug 2', name: 'Citi DC Open',                            location: 'Washington D.C., United States',level: 'ATP 500',          surface: 'Hard (outdoor)', dbSearch: 'Washington' },
    ],
  },
  {
    month: 'August',
    tournaments: [
      { dates: 'Aug 2–15',     name: 'National Bank Open',                      location: 'Montreal, Canada',              level: 'ATP Masters 1000', surface: 'Hard (outdoor)', dbSearch: 'Montreal' },
      { dates: 'Aug 13–24',    name: 'Cincinnati Open',                         location: 'Cincinnati, United States',     level: 'ATP Masters 1000', surface: 'Hard (outdoor)', dbSearch: 'Cincinnati' },
      { dates: 'Aug 23–29',    name: 'Winston-Salem Open',                      location: 'Winston-Salem, United States',  level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Winston' },
      { dates: 'Aug 31–Sep 13',name: 'US Open',                                 location: 'New York, United States',       level: 'Grand Slam',       surface: 'Hard (outdoor)', dbSearch: 'US Open' },
    ],
  },
  {
    month: 'September',
    tournaments: [
      { dates: 'Sep 23–29',    name: 'Chengdu Open',                            location: 'Chengdu, China',                level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Chengdu' },
      { dates: 'Sep 23–29',    name: 'Hangzhou Open',                           location: 'Hangzhou, China',               level: 'ATP 250',          surface: 'Hard (outdoor)', dbSearch: 'Hangzhou' },
      { dates: 'Sep 23–29',    name: 'Laver Cup',                               location: 'San Francisco, United States',  level: 'Team Event',       surface: 'Hard (indoor)',  dbSearch: 'Laver Cup' },
      { dates: 'Sep 30–Oct 6', name: 'Japan Open Tennis Championships',         location: 'Tokyo, Japan',                  level: 'ATP 500',          surface: 'Hard (outdoor)', dbSearch: 'Japan' },
      { dates: 'Sep 30–Oct 6', name: 'China Open',                              location: 'Beijing, China',                level: 'ATP 500',          surface: 'Hard (outdoor)', dbSearch: 'Beijing' },
    ],
  },
  {
    month: 'October',
    tournaments: [
      { dates: 'Oct 7–18',     name: 'Rolex Shanghai Masters',                  location: 'Shanghai, China',               level: 'ATP Masters 1000', surface: 'Hard (outdoor)', dbSearch: 'Shanghai' },
      { dates: 'Oct 18–25',    name: 'Almaty Open',                             location: 'Almaty, Kazakhstan',            level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Almaty' },
      { dates: 'Oct 19–25',    name: 'European Open',                           location: 'Antwerp, Belgium',              level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Antwerp' },
      { dates: 'Oct 19–25',    name: 'Stockholm Open',                          location: 'Stockholm, Sweden',             level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Stockholm' },
      { dates: 'Oct 24–Nov 1', name: 'Erste Bank Open',                         location: 'Vienna, Austria',               level: 'ATP 500',          surface: 'Hard (indoor)',  dbSearch: 'Vienna' },
      { dates: 'Oct 26–Nov 1', name: 'Swiss Indoors Basel',                     location: 'Basel, Switzerland',            level: 'ATP 500',          surface: 'Hard (indoor)',  dbSearch: 'Basel' },
    ],
  },
  {
    month: 'November',
    tournaments: [
      { dates: 'Nov 2–8',      name: 'Rolex Paris Masters',                     location: 'Paris, France',                 level: 'ATP Masters 1000', surface: 'Hard (indoor)',  dbSearch: 'Paris Masters' },
      { dates: 'Nov 8–14',     name: 'Belgrade Open',                           location: 'Belgrade, Serbia',              level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Belgrade' },
      { dates: 'Nov 8–14',     name: 'Moselle Open',                            location: 'Metz, France',                  level: 'ATP 250',          surface: 'Hard (indoor)',  dbSearch: 'Metz' },
      { dates: 'Nov 15–22',    name: 'Nitto ATP Finals',                        location: 'Turin, Italy',                  level: 'Year-End Finals',  surface: 'Hard (indoor)',  dbSearch: 'Tour Finals' },
    ],
  },
]
