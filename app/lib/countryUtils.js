// Maps 3-letter IOC country codes to 2-letter ISO codes for flag emojis
const IOC_TO_ISO = {
  AFG: 'AF', ALB: 'AL', ALG: 'DZ', AND: 'AD', ANG: 'AO', ANT: 'AG',
  ARG: 'AR', ARM: 'AM', ARU: 'AW', AUS: 'AU', AUT: 'AT', AZE: 'AZ',
  BAH: 'BS', BAN: 'BD', BAR: 'BB', BDI: 'BI', BEL: 'BE', BEN: 'BJ',
  BER: 'BM', BHU: 'BT', BIH: 'BA', BIZ: 'BZ', BLR: 'BY', BOL: 'BO',
  BOT: 'BW', BRA: 'BR', BRN: 'BH', BRU: 'BN', BUL: 'BG', BUR: 'BF',
  CAF: 'CF', CAM: 'KH', CAN: 'CA', CAY: 'KY', CGO: 'CG', CHA: 'TD',
  CHI: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD', COK: 'CK',
  COL: 'CO', COM: 'KM', CPV: 'CV', CRC: 'CR', CRO: 'HR', CUB: 'CU',
  CYP: 'CY', CZE: 'CZ', DEN: 'DK', DJI: 'DJ', DOM: 'DO', ECU: 'EC',
  EGY: 'EG', ERI: 'ER', ESA: 'SV', ESP: 'ES', EST: 'EE', ETH: 'ET',
  FIJ: 'FJ', FIN: 'FI', FRA: 'FR', FSM: 'FM', GAB: 'GA', GAM: 'GM',
  GBR: 'GB', GBS: 'GW', GEO: 'GE', GEQ: 'GQ', GER: 'DE', GHA: 'GH',
  GRE: 'GR', GRN: 'GD', GUA: 'GT', GUI: 'GN', GUM: 'GU', GUY: 'GY',
  HAI: 'HT', HKG: 'HK', HON: 'HN', HUN: 'HU', INA: 'ID', IND: 'IN',
  IRI: 'IR', IRL: 'IE', IRQ: 'IQ', ISL: 'IS', ISR: 'IL', ISV: 'VI',
  ITA: 'IT', IVB: 'VG', JAM: 'JM', JOR: 'JO', JPN: 'JP', KAZ: 'KZ',
  KEN: 'KE', KGZ: 'KG', KIR: 'KI', KOR: 'KR', KOS: 'XK', KUW: 'KW',
  LAO: 'LA', LAT: 'LV', LBA: 'LY', LBR: 'LR', LCA: 'LC', LES: 'LS',
  LIB: 'LB', LIE: 'LI', LTU: 'LT', LUX: 'LU', MAD: 'MG', MAR: 'MA',
  MAS: 'MY', MAW: 'MW', MDA: 'MD', MDV: 'MV', MEX: 'MX', MGL: 'MN',
  MKD: 'MK', MLI: 'ML', MLT: 'MT', MNE: 'ME', MON: 'MC', MOZ: 'MZ',
  MRI: 'MU', MTN: 'MR', MYA: 'MM', NAM: 'NA', NCA: 'NI', NED: 'NL',
  NEP: 'NP', NGR: 'NG', NIG: 'NE', NOR: 'NO', NRU: 'NR', NZL: 'NZ',
  OMA: 'OM', PAK: 'PK', PAN: 'PA', PAR: 'PY', PER: 'PE', PHI: 'PH',
  PLE: 'PS', PLW: 'PW', PNG: 'PG', POL: 'PL', POR: 'PT', PRK: 'KP',
  PUR: 'PR', QAT: 'QA', ROU: 'RO', RSA: 'ZA', RUS: 'RU', RWA: 'RW',
  SAM: 'WS', SAU: 'SA', SEN: 'SN', SEY: 'SC', SIN: 'SG', SKN: 'KN',
  SLE: 'SL', SLO: 'SI', SMR: 'SM', SOL: 'SB', SOM: 'SO', SRB: 'RS',
  SRI: 'LK', SSD: 'SS', STP: 'ST', SUD: 'SD', SUI: 'CH', SUR: 'SR',
  SVK: 'SK', SWE: 'SE', SWZ: 'SZ', SYR: 'SY', TAN: 'TZ', TGA: 'TO',
  THA: 'TH', TJK: 'TJ', TKM: 'TM', TLS: 'TL', TOG: 'TG', TPE: 'TW',
  TTO: 'TT', TUN: 'TN', TUR: 'TR', TUV: 'TV', UAE: 'AE', UGA: 'UG',
  UKR: 'UA', URU: 'UY', USA: 'US', UZB: 'UZ', VAN: 'VU', VEN: 'VE',
  VIE: 'VN', VIN: 'VC', YEM: 'YE', ZAM: 'ZM', ZIM: 'ZW',
};

/**
 * Convert a 3-letter IOC code to a flag emoji
 * @param {string} iocCode - e.g. "USA", "SRB", "ESP"
 * @returns {string} flag emoji or fallback
 */
export function getCountryFlag(iocCode) {
  if (!iocCode) return '🏳';
  const iso = IOC_TO_ISO[iocCode.toUpperCase()];
  if (!iso) return '🏳';
  return iso
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/**
 * Get the full country name from an IOC code (best-effort)
 */
const ISO_NAMES = {
  US: 'United States', RS: 'Serbia', ES: 'Spain', GB: 'Great Britain',
  FR: 'France', DE: 'Germany', IT: 'Italy', AU: 'Australia', AR: 'Argentina',
  RU: 'Russia', CH: 'Switzerland', NO: 'Norway', DK: 'Denmark', NL: 'Netherlands',
  GR: 'Greece', PL: 'Poland', HR: 'Croatia', BE: 'Belgium', CA: 'Canada',
  JP: 'Japan', KR: 'South Korea', CN: 'China', BR: 'Brazil', CO: 'Colombia',
  CL: 'Chile', UY: 'Uruguay', AT: 'Austria', SE: 'Sweden', FI: 'Finland',
  ZA: 'South Africa', MA: 'Morocco', KZ: 'Kazakhstan', UA: 'Ukraine',
  CZ: 'Czech Republic', SK: 'Slovakia', HU: 'Hungary', RO: 'Romania',
  BG: 'Bulgaria', GE: 'Georgia', UZ: 'Uzbekistan', TW: 'Chinese Taipei',
  IN: 'India', IL: 'Israel', TR: 'Turkey', MX: 'Mexico', PT: 'Portugal',
  MC: 'Monaco', BY: 'Belarus', PH: 'Philippines', TH: 'Thailand', MY: 'Malaysia',
  SG: 'Singapore', HK: 'Hong Kong', QA: 'Qatar', AE: 'UAE', SA: 'Saudi Arabia',
  BA: 'Bosnia', MK: 'North Macedonia', ME: 'Montenegro', SI: 'Slovenia',
  LV: 'Latvia', LT: 'Lithuania', EE: 'Estonia', XK: 'Kosovo',
};

/**
 * Returns a flagcdn.com image URL for the given IOC code.
 * Use this instead of getCountryFlag on Windows where flag emojis don't render.
 * @param {string} iocCode - e.g. "ESP", "SRB"
 * @param {number} height - image height in px (default 15, width auto-scales)
 * @returns {string|null}
 */
export function getFlagUrl(iocCode) {
  if (!iocCode) return null;
  const iso = IOC_TO_ISO[iocCode.toUpperCase()];
  if (!iso) return null;
  return `https://flagcdn.com/24x18/${iso.toLowerCase()}.png`;
}

export function getCountryName(iocCode) {
  if (!iocCode) return '';
  const iso = IOC_TO_ISO[iocCode.toUpperCase()];
  return iso ? (ISO_NAMES[iso] || iocCode) : iocCode;
}
