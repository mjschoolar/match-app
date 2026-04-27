// lib/constants.ts
// All hardcoded data for the prototype — cuisines, restaurants, dietary options.
// These are defined once here and imported wherever needed.

export const CUISINES = [
  { id: "american",       label: "American"       },
  { id: "italian",        label: "Italian"        },
  { id: "mexican",        label: "Mexican"        },
  { id: "chinese",        label: "Chinese"        },
  { id: "japanese",       label: "Japanese"       },
  { id: "indian",         label: "Indian"         },
  { id: "thai",           label: "Thai"           },
  { id: "korean",         label: "Korean"         },
  { id: "mediterranean",  label: "Mediterranean"  },
  { id: "vietnamese",     label: "Vietnamese"     },
  { id: "seafood",        label: "Seafood"        },
  { id: "french",         label: "French"         },
  { id: "pizza",          label: "Pizza"          },
  { id: "burgers",        label: "Burgers"        },
  { id: "bbq",            label: "BBQ"            },
  { id: "fast-food",      label: "Fast food"      },
  { id: "middle-eastern", label: "Middle Eastern" },
  { id: "ethiopian",      label: "Ethiopian"      },
  { id: "filipino",       label: "Filipino"       },
  { id: "caribbean",      label: "Caribbean"      },
  { id: "latin-american", label: "Latin American" },
  { id: "spanish",        label: "Spanish"        },
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
  { id: "other",       label: "Other"             },
] as const;

export const RESTAURANTS = [
  { id: "nobu",       name: "Nobu",              cuisine: "Japanese · Sushi",     rating: 4.3, distance: "1.2 mi", price: "$$$",  knownFor: "Omakase, black cod miso",               hours: "Tue–Sun, 5pm–11pm",  image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "kogi",       name: "Kogi BBQ",           cuisine: "Korean BBQ",           rating: 4.5, distance: "0.8 mi", price: "$",    knownFor: "Short rib tacos, kimchi quesadillas",   hours: "Mon–Sat, 11am–10pm", image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "jitlada",    name: "Jitlada",            cuisine: "Thai",                 rating: 4.6, distance: "2.1 mi", price: "$$",   knownFor: "Southern Thai curries, crab fried rice", hours: "Tue–Sun, 5pm–10pm",  image: "https://images.unsplash.com/photo-1455619452474-d2be8182ae9a?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "republique", name: "Republique",         cuisine: "French · Californian", rating: 4.4, distance: "1.7 mi", price: "$$$",  knownFor: "Pastries, steak frites, rotisserie chicken", hours: "Daily, 8am–10pm",  image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "mariscos",   name: "Mariscos Jalisco",   cuisine: "Mexican · Seafood",    rating: 4.7, distance: "3.0 mi", price: "$",    knownFor: "Shrimp tacos, aguachile",               hours: "Daily, 9am–6pm",     image: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "otium",      name: "Otium",              cuisine: "American · Modern",    rating: 4.2, distance: "0.5 mi", price: "$$$",  knownFor: "Roasted chicken, wood-fired veggies",   hours: "Tue–Sun, 5pm–10pm",  image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "blu-jam",    name: "Blu Jam Cafe",       cuisine: "Cafe · Breakfast",     rating: 4.4, distance: "1.4 mi", price: "$$",   knownFor: "Brioche French toast, egg dishes",      hours: "Daily, 8am–3pm",     image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "bestia",     name: "Bestia",             cuisine: "Italian",              rating: 4.6, distance: "2.3 mi", price: "$$$",  knownFor: "House-made pasta, charcuterie",         hours: "Daily, 5pm–11pm",    image: "https://images.unsplash.com/photo-1551183053-bf91798d792d?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "howlin",     name: "Howlin' Ray's",      cuisine: "American · Chicken",   rating: 4.5, distance: "1.9 mi", price: "$$",   knownFor: "Nashville hot chicken",                 hours: "Wed–Mon, 11am–4pm",  image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=800&h=1200&q=80" },
  { id: "shunjuku",   name: "Shunjuku Ramen",     cuisine: "Japanese · Ramen",     rating: 4.3, distance: "1.1 mi", price: "$$",   knownFor: "Tonkotsu broth, chashu pork",           hours: "Daily, 11am–10pm",   image: "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?auto=format&fit=crop&w=800&h=1200&q=80" },
] as const;
