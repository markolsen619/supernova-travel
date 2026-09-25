/**
 * Seed itineraries for Explore and the globe's trending layer.
 *
 * These are EDITORIAL content published from one account you control, not
 * invented users. No fake profiles, no fabricated reviews — Explore shows
 * whoever actually authored them.
 *
 * Every stop is a durable, verifiable place: a market, a district, a museum,
 * a park, a landmark. Deliberately not named restaurants — those close, get
 * renamed, and are the easiest thing to get subtly wrong, and a wrong stop in
 * a seeded trip is worse than a general one. `searchQuery` is what the seeder
 * sends to Google Places to ground each stop, so it is written the way you
 * would type it into Maps.
 */

export type SeedActivityType =
  | 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'free';

export interface SeedActivity {
  type: SeedActivityType;
  title: string;
  /** Sent to Google Places Text Search to resolve placeId/lat/lng/address. */
  searchQuery: string;
  startTime: string | null;
  notes: string;
}

export interface SeedDay {
  title: string;
  notes: string;
  activities: SeedActivity[];
}

export interface SeedTrip {
  title: string;
  description: string;
  /** Sent to Places to resolve the destination and its cover photo. */
  destinationQuery: string;
  tags: string[];
  /** Days from today the trip starts. Keeps seeded trips perpetually future. */
  startsInDays: number;
  days: SeedDay[];
}

export const SEED_TRIPS: SeedTrip[] = [
  {
    title: 'Kyoto in Three Days',
    description:
      'Temples at dawn, a market lunch, and an evening in the old teahouse districts. Built around walking and trains, with no rental car needed.',
    destinationQuery: 'Kyoto, Japan',
    tags: ['Temples', 'Walking', 'Food'],
    startsInDays: 34,
    days: [
      {
        title: 'Eastern Hills',
        notes: 'Start early — Kiyomizu-dera is calm before nine and crowded by eleven.',
        activities: [
          { type: 'activity', title: 'Kiyomizu-dera at opening', searchQuery: 'Kiyomizu-dera, Kyoto', startTime: '07:30', notes: 'Gates open early. The veranda view is worth the climb.' },
          { type: 'activity', title: 'Walk down Sannenzaka', searchQuery: 'Sannenzaka, Kyoto', startTime: '09:00', notes: 'Stone-paved lanes down toward Yasaka. Slippery in rain.' },
          { type: 'restaurant', title: 'Lunch around Gion', searchQuery: 'Gion, Kyoto', startTime: '12:00', notes: 'Plenty of small places on the side streets off Hanamikoji.' },
          { type: 'activity', title: 'Yasaka Shrine and Maruyama Park', searchQuery: 'Yasaka Shrine, Kyoto', startTime: '14:30', notes: 'Free to enter. The park behind it is the local picnic spot.' },
        ],
      },
      {
        title: 'Arashiyama and the west',
        notes: 'A train day. The JR San-in line gets you there in about fifteen minutes.',
        activities: [
          { type: 'transport', title: 'Train to Saga-Arashiyama', searchQuery: 'Saga-Arashiyama Station, Kyoto', startTime: '08:00', notes: 'From Kyoto Station, JR San-in line.' },
          { type: 'activity', title: 'Bamboo grove before the crowds', searchQuery: 'Arashiyama Bamboo Grove, Kyoto', startTime: '08:30', notes: 'Genuinely quiet before nine.' },
          { type: 'activity', title: 'Tenryu-ji garden', searchQuery: 'Tenryu-ji, Kyoto', startTime: '10:00', notes: 'The garden is the reason to come, not the halls.' },
          { type: 'free', title: 'Afternoon along the Katsura river', searchQuery: 'Katsura River, Arashiyama, Kyoto', startTime: '13:00', notes: 'Boat rental, or just walk the bank.' },
        ],
      },
      {
        title: 'Market and museums',
        notes: 'A slower last day, mostly indoors — a good rain plan.',
        activities: [
          { type: 'restaurant', title: 'Breakfast at Nishiki Market', searchQuery: 'Nishiki Market, Kyoto', startTime: '09:00', notes: 'Five covered blocks of food stalls. Cash helps.' },
          { type: 'activity', title: 'Nijo Castle', searchQuery: 'Nijo Castle, Kyoto', startTime: '11:00', notes: 'The nightingale floors are the thing to listen for.' },
          { type: 'activity', title: 'Kyoto National Museum', searchQuery: 'Kyoto National Museum', startTime: '14:00', notes: 'Closed Mondays.' },
          { type: 'free', title: 'Evening in Pontocho', searchQuery: 'Pontocho, Kyoto', startTime: '18:30', notes: 'Narrow lane along the river. Lively after dark.' },
        ],
      },
    ],
  },
  {
    title: 'Mexico City on Foot',
    description:
      'Three days between Centro, Roma and Coyoacán. Big museums, big markets, and a lot of walking between them.',
    destinationQuery: 'Mexico City, Mexico',
    tags: ['Museums', 'Markets', 'Architecture'],
    startsInDays: 21,
    days: [
      {
        title: 'Centro Histórico',
        notes: 'Almost all of this is within a few blocks of the Zócalo.',
        activities: [
          { type: 'activity', title: 'Zócalo and the Metropolitan Cathedral', searchQuery: 'Zócalo, Mexico City', startTime: '09:00', notes: 'Arrive early for the flag ceremony.' },
          { type: 'activity', title: 'Templo Mayor', searchQuery: 'Templo Mayor, Mexico City', startTime: '10:30', notes: 'Aztec ruins mid-city. The museum at the end is excellent.' },
          { type: 'restaurant', title: 'Lunch at Mercado de San Juan', searchQuery: 'Mercado de San Juan, Mexico City', startTime: '13:30', notes: 'Old covered market, strong on produce and cheese.' },
          { type: 'activity', title: 'Palacio de Bellas Artes', searchQuery: 'Palacio de Bellas Artes, Mexico City', startTime: '16:00', notes: 'Rivera and Siqueiros murals upstairs.' },
        ],
      },
      {
        title: 'Chapultepec',
        notes: 'One park, most of a day. Wear comfortable shoes.',
        activities: [
          { type: 'activity', title: 'Museo Nacional de Antropología', searchQuery: 'Museo Nacional de Antropología, Mexico City', startTime: '09:30', notes: 'Give it three hours minimum. Closed Mondays.' },
          { type: 'free', title: 'Walk Bosque de Chapultepec', searchQuery: 'Bosque de Chapultepec, Mexico City', startTime: '13:00', notes: 'The lake and the shaded paths on the first section.' },
          { type: 'activity', title: 'Chapultepec Castle', searchQuery: 'Chapultepec Castle, Mexico City', startTime: '15:00', notes: 'Uphill walk. The terrace view down Reforma is the payoff.' },
          { type: 'free', title: 'Evening in Roma Norte', searchQuery: 'Roma Norte, Mexico City', startTime: '19:00', notes: 'Tree-lined and walkable after dark.' },
        ],
      },
      {
        title: 'Coyoacán',
        notes: 'South of the centre. Metro line 3 to Coyoacán, then walk.',
        activities: [
          { type: 'activity', title: 'Museo Frida Kahlo', searchQuery: 'Museo Frida Kahlo, Mexico City', startTime: '10:00', notes: 'Book ahead — same-day tickets are rare.' },
          { type: 'restaurant', title: 'Mercado de Coyoacán', searchQuery: 'Mercado de Coyoacán, Mexico City', startTime: '13:00', notes: 'Tostada counters at the back.' },
          { type: 'free', title: 'Jardín Centenario', searchQuery: 'Jardín Centenario, Coyoacán, Mexico City', startTime: '15:00', notes: 'The square with the coyote fountain.' },
          { type: 'activity', title: 'Museo Casa de León Trotsky', searchQuery: 'Museo Casa de León Trotsky, Mexico City', startTime: '16:30', notes: 'Ten minutes walk from the Kahlo house.' },
        ],
      },
    ],
  },
  {
    title: 'Reykjavík and the South Coast',
    description:
      'Two days in the city and one long drive east along the south shore. Waterfalls, black sand, and a lot of weather.',
    destinationQuery: 'Reykjavík, Iceland',
    tags: ['Road trip', 'Waterfalls', 'Coast'],
    startsInDays: 48,
    days: [
      {
        title: 'Reykjavík on foot',
        notes: 'Compact centre — everything here is within twenty minutes of everything else.',
        activities: [
          { type: 'activity', title: 'Hallgrímskirkja tower', searchQuery: 'Hallgrímskirkja, Reykjavík', startTime: '09:30', notes: 'Lift to the top for the coloured-roof view.' },
          { type: 'free', title: 'Walk Laugavegur', searchQuery: 'Laugavegur, Reykjavík', startTime: '11:00', notes: 'The main shopping street, running downhill to the harbour.' },
          { type: 'activity', title: 'Harpa concert hall', searchQuery: 'Harpa, Reykjavík', startTime: '14:00', notes: 'Free to wander the glass atrium.' },
          { type: 'free', title: 'Sun Voyager at dusk', searchQuery: 'Sun Voyager, Reykjavík', startTime: '18:00', notes: 'On the seafront path. Good light late.' },
        ],
      },
      {
        title: 'South coast drive',
        notes: 'Long day. Fuel up before leaving and check road conditions first.',
        activities: [
          { type: 'transport', title: 'Drive east on Route 1', searchQuery: 'Route 1, Selfoss, Iceland', startTime: '07:30', notes: 'Roughly two hours to the first stop.' },
          { type: 'activity', title: 'Seljalandsfoss', searchQuery: 'Seljalandsfoss, Iceland', startTime: '09:30', notes: 'You can walk behind it. You will get wet.' },
          { type: 'activity', title: 'Skógafoss', searchQuery: 'Skógafoss, Iceland', startTime: '11:30', notes: 'Stairs up the side for the top view.' },
          { type: 'activity', title: 'Reynisfjara black sand beach', searchQuery: 'Reynisfjara Beach, Iceland', startTime: '14:00', notes: 'Stay well back from the water — the waves here are genuinely dangerous.' },
        ],
      },
      {
        title: 'Peninsula and pools',
        notes: 'A slower day closer to town.',
        activities: [
          { type: 'activity', title: 'Þingvellir National Park', searchQuery: 'Þingvellir National Park, Iceland', startTime: '09:00', notes: 'Walk the rift between the plates.' },
          { type: 'activity', title: 'Geysir geothermal field', searchQuery: 'Geysir, Iceland', startTime: '11:30', notes: 'Strokkur erupts every few minutes.' },
          { type: 'activity', title: 'Gullfoss', searchQuery: 'Gullfoss, Iceland', startTime: '13:30', notes: 'Two viewing levels. The lower one is louder.' },
          { type: 'free', title: 'Evening swim at a neighbourhood pool', searchQuery: 'Laugardalslaug, Reykjavík', startTime: '18:00', notes: 'Geothermal, outdoors, open late. Shower properly first — it is enforced.' },
        ],
      },
    ],
  },
  {
    title: 'Marrakech Medina',
    description:
      'Three days inside and just outside the walls. Gardens in the heat of the day, souks in the evening.',
    destinationQuery: 'Marrakech, Morocco',
    tags: ['Souks', 'Gardens', 'Architecture'],
    startsInDays: 62,
    days: [
      {
        title: 'Inside the walls',
        notes: 'The medina is a maze by design. Getting lost is part of it.',
        activities: [
          { type: 'activity', title: 'Bahia Palace', searchQuery: 'Bahia Palace, Marrakech', startTime: '09:00', notes: 'Go early — the courtyards fill up fast.' },
          { type: 'activity', title: 'Ben Youssef Madrasa', searchQuery: 'Ben Youssef Madrasa, Marrakech', startTime: '11:00', notes: 'Carved cedar and tilework around a still courtyard.' },
          { type: 'restaurant', title: 'Lunch near the souks', searchQuery: 'Souk Semmarine, Marrakech', startTime: '13:30', notes: 'Rooftop terraces above the lanes are the cooler option.' },
          { type: 'free', title: 'Jemaa el-Fnaa after dark', searchQuery: 'Jemaa el-Fnaa, Marrakech', startTime: '19:00', notes: 'The square completely changes character at night.' },
        ],
      },
      {
        title: 'Gardens and the new city',
        notes: 'Escape the midday heat somewhere green.',
        activities: [
          { type: 'activity', title: 'Jardin Majorelle', searchQuery: 'Jardin Majorelle, Marrakech', startTime: '08:30', notes: 'Book a timed ticket. First slot is the calmest.' },
          { type: 'activity', title: 'Yves Saint Laurent Museum', searchQuery: 'Musée Yves Saint Laurent, Marrakech', startTime: '10:30', notes: 'Next door to the garden.' },
          { type: 'free', title: 'Le Jardin Secret', searchQuery: 'Le Jardin Secret, Marrakech', startTime: '15:00', notes: 'Back inside the medina. Quiet, with a tower to climb.' },
          { type: 'free', title: 'Menara Gardens at sunset', searchQuery: 'Menara Gardens, Marrakech', startTime: '18:00', notes: 'Olive groves and a reflecting pool with the Atlas behind.' },
        ],
      },
      {
        title: 'Atlas foothills',
        notes: 'A day trip out of the city. Grand taxi or a hired driver.',
        activities: [
          { type: 'transport', title: 'Drive to the Ourika Valley', searchQuery: 'Ourika Valley, Morocco', startTime: '08:30', notes: 'About an hour south of the city.' },
          { type: 'activity', title: 'Setti Fatma waterfalls walk', searchQuery: 'Setti Fatma, Morocco', startTime: '10:30', notes: 'Scrambly in places. Proper shoes.' },
          { type: 'restaurant', title: 'Riverside lunch', searchQuery: 'Setti Fatma, Ourika, Morocco', startTime: '13:30', notes: 'Tables set out over the water along the valley road.' },
          { type: 'transport', title: 'Return to Marrakech', searchQuery: 'Marrakech, Morocco', startTime: '16:30', notes: 'Back before dark.' },
        ],
      },
    ],
  },
  {
    title: 'Queenstown Long Weekend',
    description:
      'Lake, mountains, and one very good day walk. Compact enough that you never drive more than an hour.',
    destinationQuery: 'Queenstown, New Zealand',
    tags: ['Hiking', 'Lakes', 'Mountains'],
    startsInDays: 76,
    days: [
      {
        title: 'Lake Wakatipu',
        notes: 'Easy first day to get the legs going.',
        activities: [
          { type: 'free', title: 'Queenstown Gardens loop', searchQuery: 'Queenstown Gardens, New Zealand', startTime: '09:00', notes: 'Flat walk out onto the peninsula.' },
          { type: 'activity', title: 'Skyline gondola to Bob’s Peak', searchQuery: 'Skyline Queenstown', startTime: '11:00', notes: 'The view back over the Remarkables is the point.' },
          { type: 'restaurant', title: 'Lunch in town centre', searchQuery: 'Queenstown town centre, New Zealand', startTime: '13:30', notes: 'Everything is within two blocks of the waterfront.' },
          { type: 'free', title: 'Lakeside evening walk', searchQuery: 'Lake Wakatipu, Queenstown', startTime: '18:30', notes: 'Long light in summer.' },
        ],
      },
      {
        title: 'Glenorchy road',
        notes: 'One of the best drives in the country. Allow stops.',
        activities: [
          { type: 'transport', title: 'Drive to Glenorchy', searchQuery: 'Glenorchy, New Zealand', startTime: '08:00', notes: 'Forty-five minutes along the lake, with lay-bys the whole way.' },
          { type: 'free', title: 'Glenorchy lagoon boardwalk', searchQuery: 'Glenorchy Lagoon, New Zealand', startTime: '09:30', notes: 'Short flat loop with the mountains reflected.' },
          { type: 'activity', title: 'Routeburn track start', searchQuery: 'Routeburn Shelter, New Zealand', startTime: '11:00', notes: 'Walk in as far as you like and turn back — the first hour is beech forest and river.' },
          { type: 'transport', title: 'Return along the lake', searchQuery: 'Queenstown, New Zealand', startTime: '16:00', notes: 'Different light coming back.' },
        ],
      },
      {
        title: 'Arrowtown and the gorge',
        notes: 'History and a swim if the weather holds.',
        activities: [
          { type: 'free', title: 'Arrowtown main street', searchQuery: 'Arrowtown, New Zealand', startTime: '09:30', notes: 'Gold rush cottages, best in autumn colour.' },
          { type: 'activity', title: 'Chinese settlement', searchQuery: 'Arrowtown Chinese Settlement, New Zealand', startTime: '11:00', notes: 'Restored huts along the creek. Sobering and well done.' },
          { type: 'activity', title: 'Kawarau Gorge lookout', searchQuery: 'Kawarau Gorge Suspension Bridge, New Zealand', startTime: '14:00', notes: 'Watch the bungy from the viewing platform, jump optional.' },
          { type: 'free', title: 'Last evening on the waterfront', searchQuery: 'Queenstown Bay Beach, New Zealand', startTime: '18:00', notes: 'Steamer wharf end is quieter.' },
        ],
      },
    ],
  },
  {
    title: 'Seoul Three Ways',
    description:
      'Palaces, a mountain, and two very different nights out. All of it on the subway.',
    destinationQuery: 'Seoul, South Korea',
    tags: ['City', 'Food', 'Palaces'],
    startsInDays: 29,
    days: [
      {
        title: 'Palaces and hanok',
        notes: 'Central and walkable. Free palace entry if you wear hanbok.',
        activities: [
          { type: 'activity', title: 'Gyeongbokgung Palace', searchQuery: 'Gyeongbokgung Palace, Seoul', startTime: '09:00', notes: 'Changing of the guard mid-morning. Closed Tuesdays.' },
          { type: 'free', title: 'Bukchon Hanok Village', searchQuery: 'Bukchon Hanok Village, Seoul', startTime: '11:30', notes: 'People live here — the quiet-hours signs are serious.' },
          { type: 'restaurant', title: 'Lunch in Insadong', searchQuery: 'Insadong, Seoul', startTime: '13:30', notes: 'Teahouses down the alleys off the main street.' },
          { type: 'activity', title: 'Changdeokgung secret garden', searchQuery: 'Changdeokgung Palace, Seoul', startTime: '15:30', notes: 'Garden is guided-tour only. Book on arrival.' },
        ],
      },
      {
        title: 'Markets and the river',
        notes: 'Eat your way across the middle of the city.',
        activities: [
          { type: 'restaurant', title: 'Gwangjang Market', searchQuery: 'Gwangjang Market, Seoul', startTime: '10:30', notes: 'Bindaetteok and mayak gimbap. Go hungry.' },
          { type: 'free', title: 'Cheonggyecheon stream walk', searchQuery: 'Cheonggyecheon, Seoul', startTime: '13:00', notes: 'Sunken stream running through the centre. Cool in summer.' },
          { type: 'activity', title: 'Dongdaemun Design Plaza', searchQuery: 'Dongdaemun Design Plaza, Seoul', startTime: '15:00', notes: 'Zaha Hadid building, exhibitions inside.' },
          { type: 'free', title: 'Night market at Dongdaemun', searchQuery: 'Dongdaemun Night Market, Seoul', startTime: '20:00', notes: 'Runs very late.' },
        ],
      },
      {
        title: 'Mountain and view',
        notes: 'Some climbing. Worth it on a clear day.',
        activities: [
          { type: 'activity', title: 'Bukhansan foothills walk', searchQuery: 'Bukhansan National Park, Seoul', startTime: '08:30', notes: 'Subway to the trailhead. Pick a short loop if short on time.' },
          { type: 'restaurant', title: 'Late lunch in Hongdae', searchQuery: 'Hongdae, Seoul', startTime: '14:00', notes: 'Student district — cheap and busy.' },
          { type: 'activity', title: 'N Seoul Tower at sunset', searchQuery: 'N Seoul Tower', startTime: '17:30', notes: 'Cable car up from Myeongdong, or walk the Namsan path.' },
          { type: 'free', title: 'Evening in Euljiro', searchQuery: 'Euljiro, Seoul', startTime: '20:00', notes: 'Print shops by day, bars behind unmarked doors by night.' },
        ],
      },
    ],
  },
  {
    title: 'Porto by the River',
    description:
      'Three unhurried days between the two banks of the Douro. Tiles, bridges, and port lodges.',
    destinationQuery: 'Porto, Portugal',
    tags: ['River', 'Wine', 'Tiles'],
    startsInDays: 40,
    days: [
      {
        title: 'Ribeira and the bridge',
        notes: 'Steep in both directions. The funicular exists for a reason.',
        activities: [
          { type: 'activity', title: 'São Bento station tiles', searchQuery: 'São Bento Station, Porto', startTime: '09:30', notes: 'Twenty thousand azulejos in the entrance hall. Free.' },
          { type: 'activity', title: 'Clérigos tower climb', searchQuery: 'Torre dos Clérigos, Porto', startTime: '11:00', notes: 'Narrow spiral stairs, best view of the old town.' },
          { type: 'free', title: 'Ribeira waterfront', searchQuery: 'Cais da Ribeira, Porto', startTime: '13:00', notes: 'Lunch on the quay, then walk east under the bridge.' },
          { type: 'free', title: 'Cross Dom Luís I on the top deck', searchQuery: 'Dom Luís I Bridge, Porto', startTime: '17:30', notes: 'Pedestrian level shared with the metro. Sunset from the Gaia side.' },
        ],
      },
      {
        title: 'Gaia and the lodges',
        notes: 'South bank. All downhill from the bridge.',
        activities: [
          { type: 'activity', title: 'Port lodge tour in Gaia', searchQuery: 'Vila Nova de Gaia, Portugal', startTime: '10:30', notes: 'Most lodges run hourly tours ending in a tasting.' },
          { type: 'free', title: 'Jardim do Morro', searchQuery: 'Jardim do Morro, Vila Nova de Gaia', startTime: '13:00', notes: 'Grassy slope looking straight back at Porto.' },
          { type: 'activity', title: 'Cable car down to the quay', searchQuery: 'Teleférico de Gaia', startTime: '15:00', notes: 'Short but a good angle on the river.' },
          { type: 'restaurant', title: 'Dinner on the Gaia quay', searchQuery: 'Cais de Gaia, Vila Nova de Gaia', startTime: '19:30', notes: 'Looking back at the lit-up Ribeira.' },
        ],
      },
      {
        title: 'Foz and the coast',
        notes: 'Tram 1 runs along the river all the way to the sea.',
        activities: [
          { type: 'transport', title: 'Historic tram to Foz', searchQuery: 'Tram 1 Porto, Passeio Alegre', startTime: '10:00', notes: 'Wooden tram, half an hour along the water.' },
          { type: 'free', title: 'Jardim do Passeio Alegre', searchQuery: 'Jardim do Passeio Alegre, Porto', startTime: '10:45', notes: 'Palm-lined garden where the river meets the Atlantic.' },
          { type: 'free', title: 'Walk the Foz seafront', searchQuery: 'Foz do Douro, Porto', startTime: '12:00', notes: 'Boardwalk north past the lighthouse.' },
          { type: 'activity', title: 'Serralves museum and park', searchQuery: 'Serralves, Porto', startTime: '15:00', notes: 'Contemporary art in a large park. Give the grounds an hour.' },
        ],
      },
    ],
  },
  {
    title: 'Cape Town and the Cape',
    description:
      'A mountain, a coastline, and a drive to the end of the peninsula. Weather decides the order.',
    destinationQuery: 'Cape Town, South Africa',
    tags: ['Mountains', 'Coast', 'Wine'],
    startsInDays: 55,
    days: [
      {
        title: 'Table Mountain',
        notes: 'Go the moment the cable car opens — cloud closes it without much warning.',
        activities: [
          { type: 'activity', title: 'Cable car up Table Mountain', searchQuery: 'Table Mountain Aerial Cableway, Cape Town', startTime: '08:00', notes: 'Check the webcam before leaving. Buy online to skip the queue.' },
          { type: 'free', title: 'Walk the summit paths', searchQuery: 'Table Mountain National Park, Cape Town', startTime: '09:00', notes: 'Flat circular routes along the top with views both ways.' },
          { type: 'restaurant', title: 'Lunch in Bo-Kaap', searchQuery: 'Bo-Kaap, Cape Town', startTime: '13:00', notes: 'Painted houses on the slope. Cape Malay food.' },
          { type: 'activity', title: 'Company’s Garden', searchQuery: "Company's Garden, Cape Town", startTime: '15:30', notes: 'Oak avenue through the middle of the old city.' },
        ],
      },
      {
        title: 'Cape peninsula drive',
        notes: 'Full day. Start early and go anticlockwise.',
        activities: [
          { type: 'transport', title: 'Drive Chapman’s Peak', searchQuery: "Chapman's Peak Drive, Cape Town", startTime: '08:30', notes: 'Toll road carved into the cliff. Stop at the lay-bys.' },
          { type: 'activity', title: 'Cape of Good Hope', searchQuery: 'Cape of Good Hope, South Africa', startTime: '10:30', notes: 'Walk up to Cape Point lighthouse. Watch for baboons.' },
          { type: 'activity', title: 'Boulders Beach penguins', searchQuery: 'Boulders Beach, Simon’s Town', startTime: '13:30', notes: 'Boardwalk over the colony. Entry fee.' },
          { type: 'free', title: 'Kalk Bay harbour', searchQuery: 'Kalk Bay, Cape Town', startTime: '16:00', notes: 'Fishing harbour with bookshops and a seawall to sit on.' },
        ],
      },
      {
        title: 'Gardens and Constantia',
        notes: 'Slower day, mostly under trees.',
        activities: [
          { type: 'activity', title: 'Kirstenbosch Botanical Garden', searchQuery: 'Kirstenbosch National Botanical Garden, Cape Town', startTime: '09:30', notes: 'The canopy walkway is the highlight. Half a day if you let it be.' },
          { type: 'restaurant', title: 'Lunch in Constantia', searchQuery: 'Constantia, Cape Town', startTime: '13:00', notes: 'The oldest wine estates in the country are all within a few minutes.' },
          { type: 'free', title: 'Sea Point promenade', searchQuery: 'Sea Point Promenade, Cape Town', startTime: '16:30', notes: 'Flat paved seafront walk, busy and sociable.' },
          { type: 'free', title: 'Signal Hill for sunset', searchQuery: 'Signal Hill, Cape Town', startTime: '18:30', notes: 'Drive up. Looks back over the city bowl and out to Robben Island.' },
        ],
      },
    ],
  },
];
