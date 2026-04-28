# Google Places API — Dallas Exploration Report
*Match app Phase 2 data exploration*  
*Generated: 4/27/2026, 11:36:33 AM*

> **Note:** Google Places API (New) returns a maximum of 20 results per
> query. ✦ indicates the API returned the maximum — actual market size is larger.

---

## 1 — Category Coverage

| Category | 1 mile | 2 miles | 5 miles |
|---|---:|---:|---:|
| American | **20 ✦** | **20 ✦** | **20 ✦** |
| Italian | 11 | **20 ✦** | **20 ✦** |
| Mexican | **20 ✦** | **20 ✦** | **20 ✦** |
| Chinese | 4 | 8 | **20 ✦** |
| Japanese | 15 | **20 ✦** | **20 ✦** |
| Indian | 7 | 9 | 16 |
| Thai | 2 | 9 | **20 ✦** |
| Korean | 3 | 7 | 17 |
| Mediterranean | 4 | 6 | **20 ✦** |
| Vietnamese | 4 | 5 | 19 |
| Seafood | 14 | **20 ✦** | **20 ✦** |
| French | 6 | 9 | 17 |
| Pizza | **20 ✦** | **20 ✦** | **20 ✦** |
| Burgers | 14 | **20 ✦** | **20 ✦** |
| BBQ | 9 | 19 | **20 ✦** |
| Fast food | **20 ✦** | **20 ✦** | **20 ✦** |
| Middle Eastern | 2 | 2 | 6 |
| Ethiopian | 0 | 0 | 0 |
| Filipino | 0 | 0 | 1 |
| Caribbean | 2 | 3 | 4 |
| Latin American | 4 | 10 | **20 ✦** |
| Spanish | 0 | 1 | 5 |

---

## 2 — Rating Distribution (2-mile radius)

| Category | No rating | <3.5 | 3.5–3.9 | 4.0–4.4 | 4.5+ | Total |
|---|---:|---:|---:|---:|---:|---:|
| American | 0 | 1 | 1 | 4 | 14 | 20 |
| Italian | 0 | 0 | 2 | 11 | 7 | 20 |
| Mexican | 0 | 2 | 2 | 5 | 11 | 20 |
| Chinese | 0 | 0 | 2 | 4 | 2 | 8 |
| Japanese | 0 | 0 | 0 | 5 | 15 | 20 |
| Indian | 0 | 0 | 0 | 1 | 8 | 9 |
| Thai | 0 | 0 | 0 | 3 | 6 | 9 |
| Korean | 0 | 1 | 1 | 4 | 1 | 7 |
| Mediterranean | 1 | 0 | 0 | 1 | 4 | 6 |
| Vietnamese | 0 | 0 | 0 | 4 | 1 | 5 |
| Seafood | 0 | 0 | 3 | 7 | 10 | 20 |
| French | 1 | 0 | 0 | 4 | 4 | 9 |
| Pizza | 0 | 7 | 0 | 8 | 5 | 20 |
| Burgers | 0 | 2 | 5 | 7 | 6 | 20 |
| BBQ | 1 | 0 | 2 | 7 | 9 | 19 |
| Fast food | 0 | 5 | 8 | 6 | 1 | 20 |
| Middle Eastern | 0 | 0 | 0 | 2 | 0 | 2 |
| Ethiopian | 0 | 0 | 0 | 0 | 0 | 0 |
| Filipino | 0 | 0 | 0 | 0 | 0 | 0 |
| Caribbean | 1 | 0 | 0 | 1 | 1 | 3 |
| Latin American | 0 | 0 | 0 | 6 | 4 | 10 |
| Spanish | 0 | 0 | 0 | 1 | 0 | 1 |

### Quality floor simulation — restaurants surviving each rating threshold

| Category | Total | ≥3.5 | ≥4.0 | ≥4.2 | ≥4.5 |
|---|---:|---:|---:|---:|---:|
| American | 20 | 19 | 18 | 18 | 14 |
| Italian | 20 | 20 | 18 | 15 | 7 |
| Mexican | 20 | 18 | 16 | 14 | 11 |
| Chinese | 8 | 8 | 6 | 6 | 2 |
| Japanese | 20 | 20 | 20 | 19 | 15 |
| Indian | 9 | 9 | 9 | 8 | 8 |
| Thai | 9 | 9 | 9 | 9 | 6 |
| Korean | 7 | 6 | 5 | 3 | 1 |
| Mediterranean | 6 | 5 | 5 | 5 | 4 |
| Vietnamese | 5 | 5 | 5 | 4 | 1 |
| Seafood | 20 | 20 | 17 | 15 | 10 |
| French | 9 | 8 | 8 | 6 | 4 |
| Pizza | 20 | 13 | 13 | 10 | 5 |
| Burgers | 20 | 18 | 13 | 12 | 6 |
| BBQ | 19 | 18 | 16 | 15 | 9 |
| Fast food | 20 | 15 | 7 | 6 | 1 |
| Middle Eastern | 2 | 2 | 2 | 2 | 0 |
| Ethiopian | 0 | 0 | 0 | 0 | 0 |
| Filipino | 0 | 0 | 0 | 0 | 0 |
| Caribbean | 3 | 2 | 2 | 1 | 1 |
| Latin American | 10 | 10 | 10 | 7 | 4 |
| Spanish | 1 | 1 | 1 | 1 | 0 |

---

## 3 — Review Count Distribution (2-mile radius)

| Category | <20 | 20–49 | 50–99 | 100–499 | 500+ | Total |
|---|---:|---:|---:|---:|---:|---:|
| American | 0 | 0 | 0 | 0 | 20 | 20 |
| Italian | 0 | 0 | 0 | 4 | 16 | 20 |
| Mexican | 0 | 0 | 0 | 1 | 19 | 20 |
| Chinese | 0 | 0 | 2 | 2 | 4 | 8 |
| Japanese | 0 | 0 | 0 | 7 | 13 | 20 |
| Indian | 1 | 1 | 0 | 4 | 3 | 9 |
| Thai | 1 | 0 | 1 | 2 | 5 | 9 |
| Korean | 0 | 1 | 1 | 1 | 4 | 7 |
| Mediterranean | 1 | 1 | 0 | 2 | 2 | 6 |
| Vietnamese | 0 | 0 | 0 | 2 | 3 | 5 |
| Seafood | 0 | 0 | 0 | 4 | 16 | 20 |
| French | 2 | 0 | 0 | 4 | 3 | 9 |
| Pizza | 0 | 0 | 3 | 4 | 13 | 20 |
| Burgers | 0 | 0 | 0 | 1 | 19 | 20 |
| BBQ | 2 | 0 | 2 | 5 | 10 | 19 |
| Fast food | 0 | 0 | 0 | 4 | 16 | 20 |
| Middle Eastern | 0 | 0 | 0 | 1 | 1 | 2 |
| Ethiopian | 0 | 0 | 0 | 0 | 0 | 0 |
| Filipino | 0 | 0 | 0 | 0 | 0 | 0 |
| Caribbean | 2 | 0 | 0 | 0 | 1 | 3 |
| Latin American | 0 | 0 | 1 | 2 | 7 | 10 |
| Spanish | 0 | 0 | 0 | 0 | 1 | 1 |

### Review floor simulation — restaurants surviving each threshold

| Category | Total | ≥20 | ≥50 | ≥100 |
|---|---:|---:|---:|---:|
| American | 20 | 20 | 20 | 20 |
| Italian | 20 | 20 | 20 | 20 |
| Mexican | 20 | 20 | 20 | 20 |
| Chinese | 8 | 8 | 8 | 6 |
| Japanese | 20 | 20 | 20 | 20 |
| Indian | 9 | 8 | 7 | 7 |
| Thai | 9 | 8 | 8 | 7 |
| Korean | 7 | 7 | 6 | 5 |
| Mediterranean | 6 | 5 | 4 | 4 |
| Vietnamese | 5 | 5 | 5 | 5 |
| Seafood | 20 | 20 | 20 | 20 |
| French | 9 | 7 | 7 | 7 |
| Pizza | 20 | 20 | 20 | 17 |
| Burgers | 20 | 20 | 20 | 20 |
| BBQ | 19 | 17 | 17 | 15 |
| Fast food | 20 | 20 | 20 | 20 |
| Middle Eastern | 2 | 2 | 2 | 2 |
| Ethiopian | 0 | 0 | 0 | 0 |
| Filipino | 0 | 0 | 0 | 0 |
| Caribbean | 3 | 1 | 1 | 1 |
| Latin American | 10 | 10 | 10 | 9 |
| Spanish | 1 | 1 | 1 | 1 |

---

## 4 — Combined Quality Floor: Rating ≥ 4.0 AND Reviews ≥ 50 (2-mile radius)

| Category | Before | After | % surviving |
|---|---:|---:|---:|
| American | 20 | 18 | 90% |
| Italian | 20 | 18 | 90% |
| Mexican | 20 | 16 | 80% |
| Chinese | 8 | 6 ⚠ | 75% |
| Japanese | 20 | 20 | 100% |
| Indian | 9 | 7 ⚠ | 78% |
| Thai | 9 | 8 | 89% |
| Korean | 7 | 5 ⚠ | 71% |
| Mediterranean | 6 | 4 ⚠ | 67% |
| Vietnamese | 5 | 5 ⚠ | 100% |
| Seafood | 20 | 17 | 85% |
| French | 9 | 7 ⚠ | 78% |
| Pizza | 20 | 13 | 65% |
| Burgers | 20 | 13 | 65% |
| BBQ | 19 | 15 | 79% |
| Fast food | 20 | 7 ⚠ | 35% |
| Middle Eastern | 2 | 2 ⚠ | 100% |
| Ethiopian | 0 | 0 ⚠ | 0% |
| Filipino | 0 | 0 ⚠ | 0% |
| Caribbean | 3 | 1 ⚠ | 33% |
| Latin American | 10 | 10 | 100% |
| Spanish | 1 | 1 ⚠ | 100% |

*⚠ = fewer than 8 qualifying restaurants — likely defaults to graceful expansion*

---

## 5 — Price Level Distribution (2-mile radius)

| Category | $ | $$ | $$$ | $$$$ | — | Total |
|---|---:|---:|---:|---:|---:|---:|
| American | 2 | 15 | 1 | 2 | 0 | 20 |
| Italian | 3 | 11 | 4 | 0 | 2 | 20 |
| Mexican | 6 | 14 | 0 | 0 | 0 | 20 |
| Chinese | 2 | 4 | 0 | 0 | 2 | 8 |
| Japanese | 0 | 11 | 2 | 1 | 6 | 20 |
| Indian | 0 | 6 | 0 | 0 | 3 | 9 |
| Thai | 1 | 7 | 0 | 0 | 1 | 9 |
| Korean | 2 | 3 | 0 | 0 | 2 | 7 |
| Mediterranean | 1 | 2 | 0 | 0 | 3 | 6 |
| Vietnamese | 3 | 2 | 0 | 0 | 0 | 5 |
| Seafood | 1 | 7 | 2 | 7 | 3 | 20 |
| French | 0 | 0 | 1 | 3 | 5 | 9 |
| Pizza | 9 | 10 | 0 | 0 | 1 | 20 |
| Burgers | 12 | 7 | 0 | 0 | 1 | 20 |
| BBQ | 2 | 10 | 0 | 0 | 7 | 19 |
| Fast food | 17 | 3 | 0 | 0 | 0 | 20 |
| Middle Eastern | 0 | 2 | 0 | 0 | 0 | 2 |
| Ethiopian | 0 | 0 | 0 | 0 | 0 | 0 |
| Filipino | 0 | 0 | 0 | 0 | 0 | 0 |
| Caribbean | 0 | 1 | 0 | 0 | 2 | 3 |
| Latin American | 5 | 5 | 0 | 0 | 0 | 10 |
| Spanish | 0 | 1 | 0 | 0 | 0 | 1 |

---

## 6 — Field Inventory

*50 restaurants sampled across American, Japanese, Mexican, Thai, Korean, Ethiopian, Italian at 2-mile radius.*

| Field | Populated | % |
|---|---:|---:|
| `types` | 50/50 | 100% |
| `formattedAddress` | 50/50 | 100% |
| `rating` | 50/50 | 100% |
| `userRatingCount` | 50/50 | 100% |
| `displayName` | 50/50 | 100% |
| `displayName.text` | 50/50 | 100% |
| `displayName.languageCode` | 50/50 | 100% |
| `paymentOptions` | 50/50 | 100% |
| `accessibilityOptions` | 50/50 | 100% |
| `websiteUri` | 49/50 | 98% |
| `paymentOptions.acceptsCreditCards` | 49/50 | 98% |
| `regularOpeningHours` | 48/50 | 96% |
| `regularOpeningHours.periods` | 48/50 | 96% |
| `regularOpeningHours.weekdayDescriptions` | 48/50 | 96% |
| `takeout` | 48/50 | 96% |
| `dineIn` | 48/50 | 96% |
| `paymentOptions.acceptsDebitCards` | 48/50 | 96% |
| `parkingOptions` | 48/50 | 96% |
| `servesDinner` | 47/50 | 94% |
| `accessibilityOptions.wheelchairAccessibleEntrance` | 47/50 | 94% |
| `accessibilityOptions.wheelchairAccessibleParking` | 46/50 | 92% |
| `priceLevel` | 45/50 | 90% |
| `parkingOptions.paidParkingLot` | 43/50 | 86% |
| `accessibilityOptions.wheelchairAccessibleSeating` | 43/50 | 86% |
| `paymentOptions.acceptsNfc` | 42/50 | 84% |
| `delivery` | 41/50 | 82% |
| `servesLunch` | 41/50 | 82% |
| `servesBeer` | 41/50 | 82% |
| `accessibilityOptions.wheelchairAccessibleRestroom` | 41/50 | 82% |
| `servesWine` | 39/50 | 78% |
| `goodForGroups` | 39/50 | 78% |
| `servesCocktails` | 37/50 | 74% |
| `regularOpeningHours.openNow` | 36/50 | 72% |
| `reservable` | 35/50 | 70% |
| `servesVegetarianFood` | 35/50 | 70% |
| `outdoorSeating` | 35/50 | 70% |
| `parkingOptions.freeParkingLot` | 35/50 | 70% |
| `parkingOptions.freeStreetParking` | 35/50 | 70% |
| `regularOpeningHours.nextCloseTime` | 34/50 | 68% |
| `servesCoffee` | 34/50 | 68% |
| `editorialSummary` | 33/50 | 66% |
| `editorialSummary.text` | 33/50 | 66% |
| `editorialSummary.languageCode` | 33/50 | 66% |
| `goodForChildren` | 30/50 | 60% |
| `parkingOptions.paidStreetParking` | 27/50 | 54% |
| `menuForChildren` | 24/50 | 48% |
| `parkingOptions.valetParking` | 18/50 | 36% |
| `servesBrunch` | 12/50 | 24% |
| `regularOpeningHours.nextOpenTime` | 12/50 | 24% |
| `parkingOptions.freeGarageParking` | 9/50 | 18% |
| `parkingOptions.paidGarageParking` | 9/50 | 18% |
| `servesBreakfast` | 7/50 | 14% |
| `liveMusic` | 6/50 | 12% |
| `goodForWatchingSports` | 5/50 | 10% |

### Dietary-relevant fields

| Field | Populated | % |
|---|---:|---:|
| `servesDinner` | 47/50 | 94% |
| `servesLunch` | 41/50 | 82% |
| `servesBeer` | 41/50 | 82% |
| `servesWine` | 39/50 | 78% |
| `servesCocktails` | 37/50 | 74% |
| `servesVegetarianFood` | 35/50 | 70% |
| `servesCoffee` | 34/50 | 68% |
| `servesBrunch` | 12/50 | 24% |
| `servesBreakfast` | 7/50 | 14% |

### Raw response — first 3 sample restaurants

**The Henry**
```json
{
  "types": [
    "american_restaurant",
    "vegan_restaurant",
    "brunch_restaurant",
    "vegetarian_restaurant",
    "breakfast_restaurant",
    "coffee_shop",
    "bar",
    "cafe",
    "restaurant",
    "food_store",
    "store",
    "food",
    "point_of_interest",
    "establishment"
  ],
  "formattedAddress": "2301 N Akard St Suite 250, Dallas, TX 75201, USA",
  "rating": 4.4,
  "websiteUri": "https://www.thehenryrestaurant.com/locations/the-henry-dallas/?utm_source=Google&utm_medium=Organic&utm_campaign=Maps",
  "regularOpeningHours": {
    "openNow": true,
    "periods": [
      {
        "open": {
          "day": 0,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 0,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 1,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 1,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 2,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 2,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 3,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 3,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 4,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 4,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 5,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 5,
          "hour": 23,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 6,
          "hour": 8,
          "minute": 0
        },
        "close": {
          "day": 6,
          "hour": 23,
          "minute": 0
        }
      }
    ],
    "weekdayDescriptions": [
      "Monday: 8:00 AM – 10:00 PM",
      "Tuesday: 8:00 AM – 10:00 PM",
      "Wednesday: 8:00 AM – 10:00 PM",
      "Thursday: 8:00 AM – 10:00 PM",
      "Friday: 8:00 AM – 11:00 PM",
      "Saturday: 8:00 AM – 11:00 PM",
      "Sunday: 8:00 AM – 10:00 PM"
    ],
    "nextCloseTime": "2026-04-28T03:00:00Z"
  },
  "priceLevel": "PRICE_LEVEL_MODERATE",
  "userRatingCount": 3427,
  "displayName": {
    "text": "The Henry",
    "languageCode": "en"
  },
  "takeout": true,
  "delivery": true,
  "dineIn": true,
  "reservable": true,
  "servesBreakfast": true,
  "servesLunch": true,
  "servesDinner": true,
  "servesBeer": true,
  "servesWine": true,
  "servesBrunch": true,
  "servesVegetarianFood": true,
  "outdoorSeating": true,
  "liveMusic": false,
  "menuForChildren": true,
  "servesCocktails": true,
  "servesCoffee": true,
  "goodForChildren": false,
  "goodForGroups": true,
  "goodForWatchingSports": false,
  "paymentOptions": {
    "acceptsCreditCards": true,
    "acceptsDebitCards": true,
    "acceptsCashOnly": false,
    "acceptsNfc": true
  },
  "parkingOptions": {
    "freeParkingLot": true,
    "paidParkingLot": true,
    "freeStreetParking": true,
    "paidStreetParking": true,
    "valetParking": true
  },
  "accessibilityOptions": {
    "wheelchairAccessibleParking": true,
    "wheelchairAccessibleEntrance": true,
    "wheelchairAccessibleRestroom": true,
    "wheelchairAccessibleSeating": true
  }
}
```

**Las Palmas Tex-Mex**
```json
{
  "types": [
    "tex_mex_restaurant",
    "american_restaurant",
    "mexican_restaurant",
    "bar",
    "restaurant",
    "food",
    "point_of_interest",
    "establishment"
  ],
  "formattedAddress": "2708 Routh St, Dallas, TX 75201, USA",
  "rating": 4.5,
  "websiteUri": "https://laspalmasdallas.com/",
  "regularOpeningHours": {
    "openNow": true,
    "periods": [
      {
        "open": {
          "day": 0,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 0,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 1,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 1,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 2,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 2,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 3,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 3,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 4,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 4,
          "hour": 23,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 5,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 5,
          "hour": 23,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 6,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 6,
          "hour": 23,
          "minute": 0
        }
      }
    ],
    "weekdayDescriptions": [
      "Monday: 11:00 AM – 10:00 PM",
      "Tuesday: 11:00 AM – 10:00 PM",
      "Wednesday: 11:00 AM – 10:00 PM",
      "Thursday: 11:00 AM – 11:00 PM",
      "Friday: 11:00 AM – 11:00 PM",
      "Saturday: 11:00 AM – 11:00 PM",
      "Sunday: 11:00 AM – 10:00 PM"
    ],
    "nextCloseTime": "2026-04-28T03:00:00Z"
  },
  "priceLevel": "PRICE_LEVEL_MODERATE",
  "userRatingCount": 2213,
  "displayName": {
    "text": "Las Palmas Tex-Mex",
    "languageCode": "en"
  },
  "takeout": true,
  "delivery": true,
  "dineIn": true,
  "reservable": true,
  "servesLunch": true,
  "servesDinner": true,
  "servesBeer": true,
  "servesWine": true,
  "servesVegetarianFood": true,
  "editorialSummary": {
    "text": "Tex-Mex combination plates & creative south-of-the-border cocktails inside a bright pink building.",
    "languageCode": "en"
  },
  "outdoorSeating": true,
  "liveMusic": false,
  "menuForChildren": true,
  "servesCocktails": true,
  "servesCoffee": true,
  "goodForChildren": true,
  "goodForGroups": true,
  "goodForWatchingSports": false,
  "paymentOptions": {
    "acceptsCreditCards": true,
    "acceptsDebitCards": true,
    "acceptsCashOnly": false,
    "acceptsNfc": true
  },
  "parkingOptions": {
    "freeParkingLot": true,
    "paidParkingLot": true,
    "freeStreetParking": true,
    "paidStreetParking": true,
    "valetParking": true
  },
  "accessibilityOptions": {
    "wheelchairAccessibleParking": true,
    "wheelchairAccessibleEntrance": true,
    "wheelchairAccessibleRestroom": true,
    "wheelchairAccessibleSeating": true
  }
}
```

**Kitchen + Kocktails**
```json
{
  "types": [
    "soul_food_restaurant",
    "fine_dining_restaurant",
    "catering_service",
    "brunch_restaurant",
    "cocktail_bar",
    "american_restaurant",
    "meal_takeaway",
    "food_delivery",
    "fast_food_restaurant",
    "live_music_venue",
    "bar",
    "event_venue",
    "restaurant",
    "food",
    "point_of_interest",
    "service",
    "establishment"
  ],
  "formattedAddress": "1933 Elm St, Dallas, TX 75201, USA",
  "rating": 4.7,
  "websiteUri": "https://kitchenkocktailsusa.com/",
  "regularOpeningHours": {
    "openNow": true,
    "periods": [
      {
        "open": {
          "day": 0,
          "hour": 10,
          "minute": 0
        },
        "close": {
          "day": 0,
          "hour": 23,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 1,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 1,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 2,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 2,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 3,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 3,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 4,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 4,
          "hour": 22,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 5,
          "hour": 11,
          "minute": 0
        },
        "close": {
          "day": 5,
          "hour": 23,
          "minute": 0
        }
      },
      {
        "open": {
          "day": 6,
          "hour": 10,
          "minute": 0
        },
        "close": {
          "day": 6,
          "hour": 23,
          "minute": 0
        }
      }
    ],
    "weekdayDescriptions": [
      "Monday: 11:00 AM – 10:00 PM",
      "Tuesday: 11:00 AM – 10:00 PM",
      "Wednesday: 11:00 AM – 10:00 PM",
      "Thursday: 11:00 AM – 10:00 PM",
      "Friday: 11:00 AM – 11:00 PM",
      "Saturday: 10:00 AM – 11:00 PM",
      "Sunday: 10:00 AM – 11:00 PM"
    ],
    "nextCloseTime": "2026-04-28T03:00:00Z"
  },
  "priceLevel": "PRICE_LEVEL_MODERATE",
  "userRatingCount": 19690,
  "displayName": {
    "text": "Kitchen + Kocktails",
    "languageCode": "en"
  },
  "takeout": true,
  "delivery": true,
  "dineIn": true,
  "reservable": true,
  "servesBreakfast": true,
  "servesLunch": true,
  "servesDinner": true,
  "servesBeer": true,
  "servesWine": true,
  "servesBrunch": true,
  "servesVegetarianFood": true,
  "editorialSummary": {
    "text": "Creative cocktails & generous comfort-food dishes served in a popular, classy venue.",
    "languageCode": "en"
  },
  "outdoorSeating": false,
  "liveMusic": true,
  "menuForChildren": false,
  "servesCocktails": true,
  "servesCoffee": true,
  "goodForChildren": false,
  "goodForGroups": true,
  "goodForWatchingSports": false,
  "paymentOptions": {
    "acceptsCreditCards": true,
    "acceptsDebitCards": true,
    "acceptsCashOnly": false,
    "acceptsNfc": true
  },
  "parkingOptions": {
    "paidParkingLot": true,
    "paidStreetParking": true
  },
  "accessibilityOptions": {
    "wheelchairAccessibleParking": true,
    "wheelchairAccessibleEntrance": true,
    "wheelchairAccessibleRestroom": true,
    "wheelchairAccessibleSeating": true
  }
}
```

---

## 7 — Recovery Trigger Assessment

*Recovery trigger = 6 cards. Categories below 8 qualifying results (4.0/50 floor) at 2 miles are flagged as structurally thin.*

| Category | Qualifying @ 2 mi | Qualifying @ 5 mi |
|---|---:|---:|
| Chinese | 6 | 15 |
| Indian | 7 | 12 |
| Korean | 5 | 13 |
| Mediterranean | 4 | 20 |
| Vietnamese | 5 | 18 |
| French | 7 | 14 |
| Fast food | 7 | 10 |
| Middle Eastern | 2 | 6 |
| Ethiopian | 0 | 0 |
| Filipino | 0 | 0 |
| Caribbean | 1 | 2 |
| Spanish | 1 | 5 |

**12 categories are structurally thin** at 2 miles with a 4.0/50 floor. These will default to graceful expansion in most sessions.

---

*End of report.*
