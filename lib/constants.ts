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
  { id: "nobu",       name: "Nobu",              cuisine: "Japanese · Sushi",     rating: 4.3, distance: "1.2 mi" },
  { id: "kogi",       name: "Kogi BBQ",           cuisine: "Korean BBQ",           rating: 4.5, distance: "0.8 mi" },
  { id: "jitlada",    name: "Jitlada",            cuisine: "Thai",                 rating: 4.6, distance: "2.1 mi" },
  { id: "republique", name: "Republique",         cuisine: "French · Californian", rating: 4.4, distance: "1.7 mi" },
  { id: "mariscos",   name: "Mariscos Jalisco",   cuisine: "Mexican · Seafood",    rating: 4.7, distance: "3.0 mi" },
  { id: "otium",      name: "Otium",              cuisine: "American · Modern",    rating: 4.2, distance: "0.5 mi" },
  { id: "blu-jam",    name: "Blu Jam Cafe",       cuisine: "Cafe · Breakfast",     rating: 4.4, distance: "1.4 mi" },
  { id: "bestia",     name: "Bestia",             cuisine: "Italian",              rating: 4.6, distance: "2.3 mi" },
  { id: "howlin",     name: "Howlin' Ray's",      cuisine: "American · Chicken",   rating: 4.5, distance: "1.9 mi" },
  { id: "shunjuku",   name: "Shunjuku Ramen",     cuisine: "Japanese · Ramen",     rating: 4.3, distance: "1.1 mi" },
] as const;
