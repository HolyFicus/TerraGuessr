import type { LatLng } from './types';

export interface VerifiedSpot extends LatLng {
  label: string;
  countryCode: string;
}

/**
 * Curated verified outdoor Google Street View coordinates per region/country.
 * Used as an immediate quota-saving fallback if 10 random StreetViewService
 * attempts find no road coverage. Strictly excludes GMP Prohibited Territories.
 */
export const VERIFIED_SPOTS_BY_REGION: Record<string, VerifiedSpot[]> = {
  france: [
    { lat: 48.8584, lng: 2.2945, label: 'Париж, Франция', countryCode: 'FR' },
    { lat: 45.7640, lng: 4.8357, label: 'Лион, Франция', countryCode: 'FR' },
    { lat: 43.2965, lng: 5.3698, label: 'Марсель, Франция', countryCode: 'FR' },
    { lat: 44.8378, lng: -0.5792, label: 'Бордо, Франция', countryCode: 'FR' },
    { lat: 48.5734, lng: 7.7521, label: 'Страсбург, Франция', countryCode: 'FR' },
    { lat: 43.7102, lng: 7.2620, label: 'Ницца, Франция', countryCode: 'FR' },
  ],
  germany: [
    { lat: 52.5163, lng: 13.3777, label: 'Берлин, Германия', countryCode: 'DE' },
    { lat: 48.1372, lng: 11.5755, label: 'Мюнхен, Германия', countryCode: 'DE' },
    { lat: 53.5511, lng: 9.9937, label: 'Гамбург, Германия', countryCode: 'DE' },
    { lat: 50.9375, lng: 6.9603, label: 'Кёльн, Германия', countryCode: 'DE' },
    { lat: 51.0504, lng: 13.7373, label: 'Дрезден, Германия', countryCode: 'DE' },
    { lat: 50.1109, lng: 8.6821, label: 'Франкфурт, Германия', countryCode: 'DE' },
  ],
  italy: [
    { lat: 41.8902, lng: 12.4922, label: 'Рим, Италия', countryCode: 'IT' },
    { lat: 45.4642, lng: 9.1900, label: 'Милан, Италия', countryCode: 'IT' },
    { lat: 43.7696, lng: 11.2558, label: 'Флоренция, Италия', countryCode: 'IT' },
    { lat: 45.4408, lng: 12.3155, label: 'Венеция, Италия', countryCode: 'IT' },
    { lat: 40.8518, lng: 14.2681, label: 'Неаполь, Италия', countryCode: 'IT' },
    { lat: 38.1157, lng: 13.3615, label: 'Палермо, Италия', countryCode: 'IT' },
  ],
  spain: [
    { lat: 40.4168, lng: -3.7038, label: 'Мадрид, Испания', countryCode: 'ES' },
    { lat: 41.3874, lng: 2.1686, label: 'Барселона, Испания', countryCode: 'ES' },
    { lat: 37.3891, lng: -5.9845, label: 'Севилья, Испания', countryCode: 'ES' },
    { lat: 39.4699, lng: -0.3763, label: 'Валенсия, Испания', countryCode: 'ES' },
    { lat: 43.2630, lng: -2.9350, label: 'Бильбао, Испания', countryCode: 'ES' },
    { lat: 37.1773, lng: -3.5986, label: 'Гранада, Испания', countryCode: 'ES' },
  ],
  uk: [
    { lat: 51.5007, lng: -0.1246, label: 'Лондон, Великобритания', countryCode: 'GB' },
    { lat: 55.9533, lng: -3.1883, label: 'Эдинбург, Шотландия', countryCode: 'GB' },
    { lat: 53.4808, lng: -2.2426, label: 'Манчестер, Великобритания', countryCode: 'GB' },
    { lat: 51.4545, lng: -2.5879, label: 'Бристоль, Великобритания', countryCode: 'GB' },
    { lat: 51.4816, lng: -3.1791, label: 'Кардифф, Уэльс', countryCode: 'GB' },
    { lat: 54.5973, lng: -5.9301, label: 'Белфаст, Северная Ирландия', countryCode: 'GB' },
  ],
  norway: [
    { lat: 59.9139, lng: 10.7522, label: 'Осло, Норвегия', countryCode: 'NO' },
    { lat: 60.3913, lng: 5.3221, label: 'Берген, Норвегия', countryCode: 'NO' },
    { lat: 63.4305, lng: 10.3951, label: 'Тронхейм, Норвегия', countryCode: 'NO' },
    { lat: 69.6492, lng: 18.9553, label: 'Тромсё, Норвегия', countryCode: 'NO' },
    { lat: 58.9700, lng: 5.7331, label: 'Ставангер, Норвегия', countryCode: 'NO' },
    { lat: 62.4722, lng: 6.1495, label: 'Олесунн, Норвегия', countryCode: 'NO' },
  ],
  russia: [
    { lat: 55.7558, lng: 37.6173, label: 'Москва, Россия', countryCode: 'RU' },
    { lat: 59.9343, lng: 30.3351, label: 'Санкт-Петербург, Россия', countryCode: 'RU' },
    { lat: 55.7961, lng: 49.1064, label: 'Казань, Россия', countryCode: 'RU' },
    { lat: 56.8389, lng: 60.6057, label: 'Екатеринбург, Россия', countryCode: 'RU' },
    { lat: 55.0084, lng: 82.9357, label: 'Новосибирск, Россия', countryCode: 'RU' },
    { lat: 43.1155, lng: 131.8855, label: 'Владивосток, Россия', countryCode: 'RU' },
    { lat: 54.7104, lng: 20.4522, label: 'Калининград, Россия', countryCode: 'RU' },
  ],
  usa: [
    { lat: 40.7580, lng: -73.9855, label: 'Нью-Йорк, США', countryCode: 'US' },
    { lat: 37.7749, lng: -122.4194, label: 'Сан-Франциско, США', countryCode: 'US' },
    { lat: 41.8781, lng: -87.6298, label: 'Чикаго, США', countryCode: 'US' },
    { lat: 47.6062, lng: -122.3321, label: 'Сиэтл, США', countryCode: 'US' },
    { lat: 30.2672, lng: -97.7431, label: 'Остин, Техас', countryCode: 'US' },
    { lat: 39.7392, lng: -104.9903, label: 'Денвер, Колорадо', countryCode: 'US' },
  ],
  japan: [
    { lat: 35.6595, lng: 139.7004, label: 'Токио, Япония', countryCode: 'JP' },
    { lat: 35.0116, lng: 135.7681, label: 'Киото, Япония', countryCode: 'JP' },
    { lat: 34.6937, lng: 135.5023, label: 'Осака, Япония', countryCode: 'JP' },
    { lat: 43.0618, lng: 141.3545, label: 'Саппоро, Япония', countryCode: 'JP' },
    { lat: 33.5904, lng: 130.4017, label: 'Фукуока, Япония', countryCode: 'JP' },
    { lat: 34.3853, lng: 132.4553, label: 'Хиросима, Япония', countryCode: 'JP' },
  ],
  brazil: [
    { lat: -22.9068, lng: -43.1729, label: 'Рио-де-Жанейро, Бразилия', countryCode: 'BR' },
    { lat: -23.5505, lng: -46.6333, label: 'Сан-Паулу, Бразилия', countryCode: 'BR' },
    { lat: -15.7975, lng: -47.8919, label: 'Бразилиа, Бразилия', countryCode: 'BR' },
    { lat: -12.9714, lng: -38.5014, label: 'Салвадор, Бразилия', countryCode: 'BR' },
    { lat: -25.4284, lng: -49.2733, label: 'Куритиба, Бразилия', countryCode: 'BR' },
    { lat: -19.9167, lng: -43.9345, label: 'Белу-Оризонти, Бразилия', countryCode: 'BR' },
  ],
  australia: [
    { lat: -33.8688, lng: 151.2093, label: 'Сидней, Австралия', countryCode: 'AU' },
    { lat: -37.8136, lng: 144.9631, label: 'Мельбурн, Австралия', countryCode: 'AU' },
    { lat: -27.4698, lng: 153.0251, label: 'Брисбен, Австралия', countryCode: 'AU' },
    { lat: -31.9505, lng: 115.8605, label: 'Перт, Австралия', countryCode: 'AU' },
    { lat: -34.9285, lng: 138.6007, label: 'Аделаида, Австралия', countryCode: 'AU' },
    { lat: -42.8821, lng: 147.3272, label: 'Хобарт, Тасмания', countryCode: 'AU' },
  ],
  canada: [
    { lat: 43.6532, lng: -79.3832, label: 'Торонто, Канада', countryCode: 'CA' },
    { lat: 49.2827, lng: -123.1207, label: 'Ванкувер, Канада', countryCode: 'CA' },
    { lat: 45.5017, lng: -73.5673, label: 'Монреаль, Канада', countryCode: 'CA' },
    { lat: 51.0447, lng: -114.0719, label: 'Калгари, Канада', countryCode: 'CA' },
    { lat: 45.4215, lng: -75.6972, label: 'Оттава, Канада', countryCode: 'CA' },
    { lat: 44.6488, lng: -63.5752, label: 'Галифакс, Канада', countryCode: 'CA' },
  ],
  mexico: [
    { lat: 19.4326, lng: -99.1332, label: 'Мехико, Мексика', countryCode: 'MX' },
    { lat: 20.6597, lng: -103.3496, label: 'Гвадалахара, Мексика', countryCode: 'MX' },
    { lat: 25.6866, lng: -100.3161, label: 'Монтеррей, Мексика', countryCode: 'MX' },
    { lat: 20.9674, lng: -89.5926, label: 'Мерида, Юкатан', countryCode: 'MX' },
    { lat: 19.0414, lng: -98.2063, label: 'Пуэбла, Мексика', countryCode: 'MX' },
    { lat: 20.5888, lng: -100.3899, label: 'Керетаро, Мексика', countryCode: 'MX' },
  ],
  turkey: [
    { lat: 41.0082, lng: 28.9784, label: 'Стамбул, Турция', countryCode: 'TR' },
    { lat: 39.9334, lng: 32.8597, label: 'Анкара, Турция', countryCode: 'TR' },
    { lat: 38.4237, lng: 27.1428, label: 'Измир, Турция', countryCode: 'TR' },
    { lat: 36.8969, lng: 30.7133, label: 'Анталья, Турция', countryCode: 'TR' },
    { lat: 40.1885, lng: 29.0610, label: 'Бурса, Турция', countryCode: 'TR' },
    { lat: 38.6431, lng: 34.8289, label: 'Гёреме, Каппадокия', countryCode: 'TR' },
  ],
  europe: [
    { lat: 48.8584, lng: 2.2945, label: 'Париж, Франция', countryCode: 'FR' },
    { lat: 52.3676, lng: 4.9041, label: 'Амстердам, Нидерланды', countryCode: 'NL' },
    { lat: 50.0755, lng: 14.4378, label: 'Прага, Чехия', countryCode: 'CZ' },
    { lat: 48.2082, lng: 16.3738, label: 'Вена, Австрия', countryCode: 'AT' },
    { lat: 59.3293, lng: 18.0686, label: 'Стокгольм, Швеция', countryCode: 'SE' },
    { lat: 38.7223, lng: -9.1393, label: 'Лиссабон, Португалия', countryCode: 'PT' },
    { lat: 47.3769, lng: 8.5417, label: 'Цюрих, Швейцария', countryCode: 'CH' },
    { lat: 37.9838, lng: 23.7275, label: 'Афины, Греция', countryCode: 'GR' },
  ],
  asia: [
    { lat: 35.6595, lng: 139.7004, label: 'Токио, Япония', countryCode: 'JP' },
    { lat: 37.5665, lng: 126.9780, label: 'Сеул, Южная Корея', countryCode: 'KR' },
    { lat: 13.7563, lng: 100.5018, label: 'Бангкок, Таиланд', countryCode: 'TH' },
    { lat: 3.1390, lng: 101.6869, label: 'Куала-Лумпур, Малайзия', countryCode: 'MY' },
    { lat: 1.3521, lng: 103.8198, label: 'Сингапур', countryCode: 'SG' },
    { lat: 25.0330, lng: 121.5654, label: 'Тайбэй, Тайвань', countryCode: 'TW' },
    { lat: -6.2088, lng: 106.8456, label: 'Джакарта, Индонезия', countryCode: 'ID' },
    { lat: 41.0082, lng: 28.9784, label: 'Стамбул, Турция', countryCode: 'TR' },
  ],
  north_america: [
    { lat: 40.7580, lng: -73.9855, label: 'Нью-Йорк, США', countryCode: 'US' },
    { lat: 37.7749, lng: -122.4194, label: 'Сан-Франциско, США', countryCode: 'US' },
    { lat: 43.6532, lng: -79.3832, label: 'Торонто, Канада', countryCode: 'CA' },
    { lat: 49.2827, lng: -123.1207, label: 'Ванкувер, Канада', countryCode: 'CA' },
    { lat: 19.4326, lng: -99.1332, label: 'Мехико, Мексика', countryCode: 'MX' },
    { lat: 41.8781, lng: -87.6298, label: 'Чикаго, США', countryCode: 'US' },
  ],
  south_america: [
    { lat: -22.9068, lng: -43.1729, label: 'Рио-де-Жанейро, Бразилия', countryCode: 'BR' },
    { lat: -34.6037, lng: -58.3816, label: 'Буэнос-Айрес, Аргентина', countryCode: 'AR' },
    { lat: -33.4489, lng: -70.6693, label: 'Сантьяго, Чили', countryCode: 'CL' },
    { lat: -12.0464, lng: -77.0428, label: 'Лима, Перу', countryCode: 'PE' },
    { lat: 4.7110, lng: -74.0721, label: 'Богота, Колумбия', countryCode: 'CO' },
    { lat: -34.9011, lng: -56.1645, label: 'Монтевидео, Уругвай', countryCode: 'UY' },
  ],
  africa: [
    { lat: -33.9249, lng: 18.4241, label: 'Кейптаун, ЮАР', countryCode: 'ZA' },
    { lat: -26.2041, lng: 28.0473, label: 'Йоханнесбург, ЮАР', countryCode: 'ZA' },
    { lat: -1.2921, lng: 36.8219, label: 'Найроби, Кения', countryCode: 'KE' },
    { lat: 5.6037, lng: -0.1870, label: 'Аккра, Гана', countryCode: 'GH' },
    { lat: 14.7167, lng: -17.4677, label: 'Дакар, Сенегал', countryCode: 'SN' },
    { lat: 36.8065, lng: 10.1815, label: 'Тунис', countryCode: 'TN' },
    { lat: -24.6282, lng: 25.9231, label: 'Габороне, Ботсвана', countryCode: 'BW' },
  ],
  oceania: [
    { lat: -33.8688, lng: 151.2093, label: 'Сидней, Австралия', countryCode: 'AU' },
    { lat: -37.8136, lng: 144.9631, label: 'Мельбурн, Австралия', countryCode: 'AU' },
    { lat: -36.8485, lng: 174.7633, label: 'Окленд, Новая Зеландия', countryCode: 'NZ' },
    { lat: -41.2865, lng: 174.7762, label: 'Веллингтон, Новая Зеландия', countryCode: 'NZ' },
    { lat: -45.0312, lng: 168.6626, label: 'Квинстаун, Новая Зеландия', countryCode: 'NZ' },
    { lat: -27.4698, lng: 153.0251, label: 'Брисбен, Австралия', countryCode: 'AU' },
  ],
  world: [
    { lat: 48.8584, lng: 2.2945, label: 'Париж, Франция', countryCode: 'FR' },
    { lat: 35.6595, lng: 139.7004, label: 'Токио, Япония', countryCode: 'JP' },
    { lat: 40.7580, lng: -73.9855, label: 'Нью-Йорк, США', countryCode: 'US' },
    { lat: -33.8688, lng: 151.2093, label: 'Сидней, Австралия', countryCode: 'AU' },
    { lat: -22.9068, lng: -43.1729, label: 'Рио-де-Жанейро, Бразилия', countryCode: 'BR' },
    { lat: -33.9249, lng: 18.4241, label: 'Кейптаун, ЮАР', countryCode: 'ZA' },
    { lat: 59.9139, lng: 10.7522, label: 'Осло, Норвегия', countryCode: 'NO' },
    { lat: 41.8902, lng: 12.4922, label: 'Рим, Италия', countryCode: 'IT' },
    { lat: 55.7558, lng: 37.6173, label: 'Москва, Россия', countryCode: 'RU' },
    { lat: 49.2827, lng: -123.1207, label: 'Ванкувер, Канада', countryCode: 'CA' },
  ],
};

export function pickVerifiedSpot(
  regionId: string,
  usedLabels: string[] = [],
  rng: () => number = Math.random,
): VerifiedSpot {
  const spots = VERIFIED_SPOTS_BY_REGION[regionId] ?? VERIFIED_SPOTS_BY_REGION.world;
  const unused = spots.filter((s) => !usedLabels.includes(s.label));
  const pool = unused.length > 0 ? unused : spots;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
