// lib/constants.ts
// All hardcoded data for the prototype — cuisines, restaurants, dietary options.
// These are defined once here and imported wherever needed.

export const CUISINES = [
  { id: "japanese",      label: "Japanese"      },
  { id: "korean-bbq",    label: "Korean BBQ"    },
  { id: "thai",          label: "Thai"          },
  { id: "mexican",       label: "Mexican"       },
  { id: "italian",       label: "Italian"       },
  { id: "chinese",       label: "Chinese"       },
  { id: "indian",        label: "Indian"        },
  { id: "american",      label: "American"      },
  { id: "french",        label: "French"        },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "fast-food",     label: "Fast food"     },
  { id: "pizza",         label: "Pizza"         },
] as const;

export const DIETARY = [
  { id: "vegetarian",  label: "Vegetarian"        },
  { id: "vegan",       label: "Vegan"             },
  { id: "gluten-free", label: "Gluten-free"       },
  { id: "halal",       label: "Halal"             },
  { id: "kosher",      label: "Kosher"            },
  { id: "shellfish",   label: "Shellfish allergy" },
  { id: "nut-allergy", label: "Nut allergy"       },
  { id: "dairy-free",  label: "Dairy-free"        },
] as const;

export const RESTAURANTS = [
  { id: "nobu",       name: "Nobu",              cuisine: "Japanese · Sushi",     rating: 4.3, distance: "1.2 mi", price: "$$$",  knownFor: "Omakase, black cod miso",        hours: "Tue–Sun, 5pm–11pm"  },
  { id: "kogi",       name: "Kogi BBQ",           cuisine: "Korean BBQ",           rating: 4.5, distance: "0.8 mi", price: "$",    knownFor: "Short rib tacos, kimchi quesadillas", hours: "Mon–Sat, 11am–10pm" },
  { id: "jitlada",    name: "Jitlada",            cuisine: "Thai",                 rating: 4.6, distance: "2.1 mi", price: "$$",   knownFor: "Southern Thai curries, crab fried rice", hours: "Tue–Sun, 5pm–10pm"  },
  { id: "republique", name: "Republique",         cuisine: "French · Californian", rating: 4.4, distance: "1.7 mi", price: "$$$",  knownFor: "Pastries, steak frites, rotisserie chicken", hours: "Daily, 8am–10pm"    },
  { id: "mariscos",   name: "Mariscos Jalisco",   cuisine: "Mexican · Seafood",    rating: 4.7, distance: "3.0 mi", price: "$",    knownFor: "Shrimp tacos, aguachile",        hours: "Daily, 9am–6pm"     },
  { id: "otium",      name: "Otium",              cuisine: "American · Modern",    rating: 4.2, distance: "0.5 mi", price: "$$$",  knownFor: "Roasted chicken, wood-fired veggies", hours: "Tue–Sun, 5pm–10pm"  },
  { id: "blu-jam",    name: "Blu Jam Cafe",       cuisine: "Cafe · Breakfast",     rating: 4.4, distance: "1.4 mi", price: "$$",   knownFor: "Brioche French toast, egg dishes", hours: "Daily, 8am–3pm"     },
  { id: "bestia",     name: "Bestia",             cuisine: "Italian",              rating: 4.6, distance: "2.3 mi", price: "$$$",  knownFor: "House-made pasta, charcuterie",  hours: "Daily, 5pm–11pm"    },
  { id: "howlin",     name: "Howlin' Ray's",      cuisine: "American · Chicken",   rating: 4.5, distance: "1.9 mi", price: "$$",   knownFor: "Nashville hot chicken",           hours: "Wed–Mon, 11am–4pm"  },
  { id: "shunjuku",   name: "Shunjuku Ramen",     cuisine: "Japanese · Ramen",     rating: 4.3, distance: "1.1 mi", price: "$$",   knownFor: "Tonkotsu broth, chashu pork",    hours: "Daily, 11am–10pm"   },
] as const;
