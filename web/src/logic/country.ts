// WHERE A PLAYER IS (owner, 2026-11-01: "add a flag of the country they're at somewhere where it
// makes sense"). There is no geo lookup anywhere in this game and there will not be one: asking a
// server to guess from an IP address costs a request, leaks the address to a third party, and the
// privacy page promises we collect as little as we can.
//
// So the flag is derived LOCALLY, from two things the browser already knows:
//   1. the IANA time zone (Europe/Warsaw), which follows the clock the device is set to, and
//   2. failing that, the language's region subtag (pl-PL).
// Both are approximations of a place — a device can be set to a zone its owner is not standing in —
// which is why a country we cannot place with confidence is NO flag rather than a wrong one. The
// value is decoration, never a fact the game acts on.
//
// Pure and synchronous: no request, no permission prompt, no clock, no animation (so it costs
// nothing in the profile's open path).
const ZONES: Readonly<Record<string, string>> = Object.freeze({
  // Europe
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Atlantic/Canary': 'ES',
  'Europe/Madrid': 'ES', 'Europe/Paris': 'FR', 'Europe/Monaco': 'MC', 'Europe/Andorra': 'AD',
  'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL', 'Europe/Luxembourg': 'LU', 'Europe/Berlin': 'DE',
  'Europe/Zurich': 'CH', 'Europe/Vaduz': 'LI', 'Europe/Vienna': 'AT', 'Europe/Prague': 'CZ',
  'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Warsaw': 'PL', 'Europe/Minsk': 'BY',
  'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE', 'Europe/Helsinki': 'FI',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Atlantic/Reykjavik': 'IS',
  'Europe/Rome': 'IT', 'Europe/Vatican': 'VA', 'Europe/San_Marino': 'SM', 'Europe/Malta': 'MT',
  'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR', 'Europe/Sarajevo': 'BA', 'Europe/Belgrade': 'RS',
  'Europe/Podgorica': 'ME', 'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL', 'Europe/Athens': 'GR',
  'Europe/Sofia': 'BG', 'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD', 'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA', 'Europe/Uzhgorod': 'UA', 'Europe/Zaporozhye': 'UA', 'Europe/Moscow': 'RU',
  'Europe/Kaliningrad': 'RU', 'Europe/Samara': 'RU', 'Europe/Volgograd': 'RU', 'Europe/Saratov': 'RU',
  'Europe/Astrakhan': 'RU', 'Europe/Ulyanovsk': 'RU', 'Europe/Kirov': 'RU', 'Europe/Istanbul': 'TR',
  'Asia/Istanbul': 'TR', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Baku': 'AZ',
  // Middle East and Central Asia
  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB',
  'Asia/Damascus': 'SY', 'Asia/Baghdad': 'IQ', 'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA',
  'Asia/Bahrain': 'BH', 'Asia/Riyadh': 'SA', 'Asia/Aden': 'YE', 'Asia/Muscat': 'OM',
  'Asia/Dubai': 'AE', 'Asia/Tehran': 'IR', 'Asia/Kabul': 'AF', 'Asia/Karachi': 'PK',
  'Asia/Tashkent': 'UZ', 'Asia/Samarkand': 'UZ', 'Asia/Ashgabat': 'TM', 'Asia/Dushanbe': 'TJ',
  'Asia/Bishkek': 'KG', 'Asia/Almaty': 'KZ', 'Asia/Aqtobe': 'KZ', 'Asia/Aqtau': 'KZ',
  'Asia/Atyrau': 'KZ', 'Asia/Oral': 'KZ', 'Asia/Qostanay': 'KZ', 'Asia/Qyzylorda': 'KZ',
  'Asia/Yekaterinburg': 'RU', 'Asia/Omsk': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Barnaul': 'RU',
  'Asia/Tomsk': 'RU', 'Asia/Novokuznetsk': 'RU', 'Asia/Krasnoyarsk': 'RU', 'Asia/Irkutsk': 'RU',
  'Asia/Chita': 'RU', 'Asia/Yakutsk': 'RU', 'Asia/Vladivostok': 'RU', 'Asia/Magadan': 'RU',
  'Asia/Sakhalin': 'RU', 'Asia/Kamchatka': 'RU', 'Asia/Anadyr': 'RU',
  // South and South-East Asia
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP',
  'Asia/Dhaka': 'BD', 'Asia/Thimphu': 'BT', 'Asia/Yangon': 'MM', 'Asia/Rangoon': 'MM',
  'Asia/Bangkok': 'TH', 'Asia/Vientiane': 'LA', 'Asia/Phnom_Penh': 'KH', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Saigon': 'VN', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Singapore': 'SG',
  'Asia/Brunei': 'BN', 'Asia/Jakarta': 'ID', 'Asia/Pontianak': 'ID', 'Asia/Makassar': 'ID',
  'Asia/Jayapura': 'ID', 'Asia/Manila': 'PH',
  // East Asia
  'Asia/Shanghai': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Harbin': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO', 'Asia/Taipei': 'TW', 'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR', 'Asia/Pyongyang': 'KP', 'Asia/Ulaanbaatar': 'MN', 'Asia/Hovd': 'MN',
  'Asia/Choibalsan': 'MN',
  // Africa
  'Africa/Cairo': 'EG', 'Africa/Tripoli': 'LY', 'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ',
  'Africa/Casablanca': 'MA', 'Africa/El_Aaiun': 'MA', 'Africa/Nouakchott': 'MR', 'Africa/Dakar': 'SN',
  'Africa/Bamako': 'ML', 'Africa/Conakry': 'GN', 'Africa/Bissau': 'GW', 'Africa/Monrovia': 'LR',
  'Africa/Freetown': 'SL', 'Africa/Abidjan': 'CI', 'Africa/Accra': 'GH', 'Africa/Lome': 'TG',
  'Africa/Porto-Novo': 'BJ', 'Africa/Ouagadougou': 'BF', 'Africa/Niamey': 'NE', 'Africa/Lagos': 'NG',
  'Africa/Bangui': 'CF', 'Africa/Douala': 'CM', 'Africa/Ndjamena': 'TD', 'Africa/Libreville': 'GA',
  'Africa/Malabo': 'GQ', 'Africa/Sao_Tome': 'ST', 'Africa/Kinshasa': 'CD', 'Africa/Lubumbashi': 'CD',
  'Africa/Brazzaville': 'CG', 'Africa/Luanda': 'AO', 'Africa/Windhoek': 'NA', 'Africa/Gaborone': 'BW',
  'Africa/Johannesburg': 'ZA', 'Africa/Maseru': 'LS', 'Africa/Mbabane': 'SZ', 'Africa/Maputo': 'MZ',
  'Africa/Harare': 'ZW', 'Africa/Lusaka': 'ZM', 'Africa/Blantyre': 'MW', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG', 'Africa/Kigali': 'RW', 'Africa/Bujumbura': 'BI',
  'Africa/Addis_Ababa': 'ET', 'Africa/Asmara': 'ER', 'Africa/Djibouti': 'DJ', 'Africa/Mogadishu': 'SO',
  'Africa/Khartoum': 'SD', 'Africa/Juba': 'SS', 'Africa/Antananarivo': 'MG', 'Africa/Port_Louis': 'MU',
  'Africa/Victoria': 'SC', 'Africa/Moroni': 'KM', 'Africa/Mamoudzou': 'YT',
  // The Americas
  'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Boise': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US',
  'America/Adak': 'US', 'America/Juneau': 'US', 'America/Sitka': 'US', 'America/Nome': 'US',
  'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA',
  'America/Whitehorse': 'CA', 'America/Yellowknife': 'CA', 'America/Iqaluit': 'CA',
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Chihuahua': 'MX',
  'America/Mazatlan': 'MX', 'America/Tijuana': 'MX', 'America/Cancun': 'MX', 'America/Hermosillo': 'MX',
  'America/Guatemala': 'GT', 'America/Belize': 'BZ', 'America/El_Salvador': 'SV',
  'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Costa_Rica': 'CR',
  'America/Panama': 'PA', 'America/Havana': 'CU', 'America/Jamaica': 'JM', 'America/Nassau': 'BS',
  'America/Port-au-Prince': 'HT', 'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR',
  'America/Port_of_Spain': 'TT', 'America/Guyana': 'GY', 'America/Paramaribo': 'SR',
  'America/Cayenne': 'GF', 'America/Bogota': 'CO', 'America/Caracas': 'VE', 'America/Lima': 'PE',
  'America/Guayaquil': 'EC', 'America/La_Paz': 'BO', 'America/Santiago': 'CL',
  'America/Punta_Arenas': 'CL', 'America/Asuncion': 'PY', 'America/Montevideo': 'UY',
  'America/Manaus': 'BR', 'America/Rio_Branco': 'BR', 'America/Belem': 'BR', 'America/Fortaleza': 'BR',
  'America/Recife': 'BR', 'America/Maceio': 'BR', 'America/Bahia': 'BR', 'America/Sao_Paulo': 'BR',
  'America/Campo_Grande': 'BR', 'America/Cuiaba': 'BR', 'America/Porto_Velho': 'BR',
  'America/Boa_Vista': 'BR', 'America/Noronha': 'BR', 'America/Araguaina': 'BR',
  'America/Santarem': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR',
  'America/Argentina/Cordoba': 'AR', 'America/Argentina/Mendoza': 'AR', 'America/Argentina/Salta': 'AR',
  'America/Argentina/Jujuy': 'AR', 'America/Argentina/Tucuman': 'AR', 'America/Argentina/Catamarca': 'AR',
  'America/Argentina/La_Rioja': 'AR', 'America/Argentina/San_Juan': 'AR', 'America/Argentina/San_Luis': 'AR',
  'America/Argentina/Rio_Gallegos': 'AR', 'America/Argentina/Ushuaia': 'AR',
  // Atlantic and Oceania
  'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Bermuda': 'BM', 'Atlantic/Faroe': 'FO',
  'Atlantic/Cape_Verde': 'CV', 'Atlantic/Stanley': 'FK', 'Atlantic/St_Helena': 'SH',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Adelaide': 'AU', 'Australia/Perth': 'AU', 'Australia/Darwin': 'AU',
  'Australia/Hobart': 'AU', 'Australia/Lord_Howe': 'AU', 'Australia/Eucla': 'AU',
  'Australia/Broken_Hill': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ',
  'Pacific/Fiji': 'FJ', 'Pacific/Port_Moresby': 'PG', 'Pacific/Guadalcanal': 'SB',
  'Pacific/Noumea': 'NC', 'Pacific/Apia': 'WS', 'Pacific/Tongatapu': 'TO', 'Pacific/Funafuti': 'TV',
  'Pacific/Tarawa': 'KI', 'Pacific/Kiritimati': 'KI', 'Pacific/Majuro': 'MH', 'Pacific/Palau': 'PW',
  'Pacific/Nauru': 'NR', 'Pacific/Pago_Pago': 'AS', 'Pacific/Guam': 'GU', 'Pacific/Saipan': 'MP',
});

/** Countries we will draw a flag for: ISO 3166-1 alpha-2, no territories we cannot name. */
const ISO = /^[A-Z]{2}$/;

/** The region subtag of a language tag (`pl-PL` -> `PL`, `en` -> null), uppercased. */
export const regionOfLanguage = (language: string | null | undefined): string | null => {
  if (typeof language !== 'string') return null;
  // A tag may carry several subtags (`zh-Hant-TW`, `en-GB-oxendict`); a two-letter one is a region.
  for (const part of language.split(/[-_]/).slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return null;
};

/**
 * The player's country as ISO alpha-2, or null when it cannot be placed. A zone we know wins over
 * the language, because a zone follows where the device IS while a language follows who set it up;
 * an unknown zone falls back to the language's region rather than to nothing.
 */
export const countryOf = (source: { timeZone?: string | null; language?: string | null }): string | null => {
  const zone = typeof source.timeZone === 'string' ? ZONES[source.timeZone] : undefined;
  if (zone) return zone;
  const region = regionOfLanguage(source.language);
  return region && ISO.test(region) ? region : null;
};

/** What the browser says about itself; every read is guarded, so this never throws in a test. */
export const browserCountry = (): string | null => {
  try {
    const timeZone = typeof Intl !== 'undefined'
      ? new Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
      : null;
    const language = typeof navigator !== 'undefined' ? navigator.language ?? null : null;
    return countryOf({ timeZone, language });
  } catch {
    return null;
  }
};

/**
 * The flag itself: a country code rendered as its two regional-indicator letters. An unknown code
 * gives '' so the caller renders nothing rather than a placeholder box.
 */
export const flagOf = (code: string | null): string => {
  if (!code || !ISO.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
};

/** The country in the player's own language, for the flag's accessible label; the code if we cannot. */
export const countryName = (code: string | null, locale?: string): string => {
  if (!code || !ISO.test(code)) return '';
  try {
    const name = new Intl.DisplayNames([locale ?? 'en'], { type: 'region' }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
};
