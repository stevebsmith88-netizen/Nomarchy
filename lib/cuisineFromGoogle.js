// Suggests one of Nomarchy's cuisines from the category Google gives a
// place (e.g. "ramen_restaurant"). Only maps categories that clearly point
// at one cuisine - a generic "restaurant" or "fine_dining_restaurant" gets
// no suggestion rather than a guess. The caller still has to find a
// cuisine with the returned name in the person's own list, so a cuisine
// they've hidden or never had simply gets no suggestion.
const GOOGLE_TYPE_TO_CUISINE = {
  pizza_restaurant: "Pizza",
  hamburger_restaurant: "Burgers",
  coffee_shop: "Coffee",
  coffee_roastery: "Coffee",
  cafe: "Coffee",
  sushi_restaurant: "Sushi",
  italian_restaurant: "Italian",
  chinese_restaurant: "Chinese",
  indian_restaurant: "Indian",
  thai_restaurant: "Thai",
  ramen_restaurant: "Japanese and Ramen",
  japanese_restaurant: "Japanese and Ramen",
  mexican_restaurant: "Mexican",
  greek_restaurant: "Greek",
  korean_restaurant: "Korean",
  vietnamese_restaurant: "Vietnamese",
  steak_house: "Steak",
  bakery: "Dessert and Bakery",
  dessert_shop: "Dessert and Bakery",
  dessert_restaurant: "Dessert and Bakery",
  ice_cream_shop: "Dessert and Bakery",
  donut_shop: "Dessert and Bakery",
  chocolate_shop: "Dessert and Bakery",
  breakfast_restaurant: "Breakfast and Brunch",
  brunch_restaurant: "Breakfast and Brunch",
  middle_eastern_restaurant: "Shawarma and Middle Eastern",
  lebanese_restaurant: "Shawarma and Middle Eastern",
  turkish_restaurant: "Shawarma and Middle Eastern",
  vegetarian_restaurant: "Vegetarian",
  vegan_restaurant: "Vegetarian",
  french_restaurant: "French",
  seafood_restaurant: "Seafood",
  american_restaurant: "American",
  spanish_restaurant: "Spanish",
  mediterranean_restaurant: "Mediterranean",
  diner: "Diner",
  bar: "Bar",
  pub: "Bar",
  wine_bar: "Bar",
  bar_and_grill: "Bar",
};

// The primary type wins; otherwise the first recognised one in Google's
// full list of types for the place.
export function suggestCuisineName(primaryType, types = []) {
  for (const t of [primaryType, ...(Array.isArray(types) ? types : [])]) {
    if (t && GOOGLE_TYPE_TO_CUISINE[t]) return GOOGLE_TYPE_TO_CUISINE[t];
  }
  return null;
}
