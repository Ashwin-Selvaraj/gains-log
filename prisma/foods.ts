/**
 * Seed data for the Food table.
 *
 * Macros are **per 100 g**, which is the only basis that composes cleanly —
 * any portion is a multiplication, and two foods can be summed without unit
 * juggling. `serving` is the household portion you'd actually think in
 * ("1 idli", "1 katori"), with its weight in grams.
 *
 * Figures are drawn from published Indian composition data (IFCT 2017 / NIN
 * Hyderabad) and standard references, rounded to something sane. Treat them as
 * good reference values, not laboratory truth: a restaurant dosa carries far
 * more oil than a home one, and "1 katori sambar" varies by household. Every
 * value is editable in the app, and correcting a Food fixes every preset built
 * on it.
 *
 * Tuple order: name, aliases, category, kcal, protein, carbs, fat, fiber,
 *              servingLabel, servingGrams
 */

export type FoodSeed = [
  name: string,
  aliases: string,
  category: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  servingLabel: string,
  servingGrams: number,
];

export const FOODS: FoodSeed[] = [
  // ── South Indian: tiffin ────────────────────────────────────────────────
  ['Idli', 'idly,iddli,steamed rice cake', 'south-indian', 129, 4.4, 26.7, 0.6, 1.3, '1 idli', 45],
  ['Dosa, plain', 'dosai,plain dosa,sada dosa', 'south-indian', 190, 3.9, 31.4, 5.3, 1.6, '1 dosa', 70],
  ['Dosa, masala', 'masala dosai,masaal dosa', 'south-indian', 168, 3.1, 25.9, 5.9, 2.0, '1 dosa', 150],
  ['Dosa, rava', 'rava dosai,sooji dosa', 'south-indian', 202, 4.0, 30.5, 7.0, 1.4, '1 dosa', 90],
  ['Uttapam', 'uthappam,ooththappam', 'south-indian', 174, 4.3, 28.0, 4.8, 2.1, '1 uttapam', 100],
  ['Medu vada', 'vada,ulundu vadai,urad vada', 'south-indian', 296, 7.2, 30.0, 16.0, 3.4, '1 vada', 45],
  ['Upma', 'uppuma,rava upma', 'south-indian', 152, 3.4, 22.0, 5.4, 1.6, '1 katori', 150],
  ['Pongal, ven', 'ven pongal,khara pongal', 'south-indian', 168, 4.6, 24.0, 5.9, 1.5, '1 katori', 150],
  ['Appam', 'aappam,palappam', 'south-indian', 152, 2.6, 29.0, 2.7, 1.0, '1 appam', 60],
  ['Idiyappam', 'string hoppers,nool puttu', 'south-indian', 148, 2.5, 32.0, 0.6, 1.2, '1 idiyappam', 50],
  ['Puttu', 'pittu', 'south-indian', 145, 2.9, 30.0, 1.2, 1.8, '1 serving', 120],
  ['Parotta', 'porotta,malabar parotta', 'south-indian', 322, 6.6, 42.0, 14.0, 2.0, '1 parotta', 90],

  // ── South Indian: accompaniments ────────────────────────────────────────
  ['Sambar', 'saambar,sambhar', 'south-indian', 82, 3.5, 11.0, 2.6, 3.0, '1 katori', 150],
  ['Rasam', 'saaru,charu', 'south-indian', 41, 1.6, 5.8, 1.2, 1.1, '1 katori', 150],
  ['Coconut chutney', 'thengai chutney,nariyal chutney', 'south-indian', 194, 3.1, 7.4, 17.0, 4.2, '2 tbsp', 30],
  ['Tomato chutney', 'thakkali chutney', 'south-indian', 96, 1.8, 8.4, 6.3, 2.0, '2 tbsp', 30],
  ['Curd rice', 'thayir sadam,dahi bhat', 'south-indian', 118, 3.4, 18.0, 3.2, 0.7, '1 katori', 200],
  ['Lemon rice', 'chitranna,elumichai sadam', 'south-indian', 168, 3.0, 27.0, 5.4, 1.3, '1 katori', 180],
  ['Tamarind rice', 'puliyodarai,puliyogare', 'south-indian', 186, 3.6, 29.0, 6.2, 2.1, '1 katori', 180],
  ['Bisi bele bath', 'bisibelebath,bisi bele huliyanna', 'south-indian', 158, 5.1, 23.0, 4.9, 2.8, '1 katori', 200],
  ['Coconut, fresh grated', 'thengai,nariyal', 'south-indian', 354, 3.3, 15.2, 33.5, 9.0, '2 tbsp', 15],

  // ── Grains & staples ────────────────────────────────────────────────────
  ['Rice, cooked white', 'sadam,chawal,steamed rice,plain rice', 'grain', 130, 2.7, 28.2, 0.3, 0.4, '1 katori', 150],
  ['Rice, cooked brown', 'brown rice', 'grain', 123, 2.7, 25.6, 1.0, 1.8, '1 katori', 150],
  ['Chapati', 'roti,phulka,wheat roti', 'grain', 297, 9.4, 51.0, 6.4, 6.0, '1 chapati', 40],
  ['Wheat flour, atta', 'atta,gehun ka atta', 'grain', 341, 12.1, 69.4, 1.7, 11.0, '100 g', 100],
  ['Oats, dry', 'oat,rolled oats,quaker oats', 'grain', 389, 16.9, 66.3, 6.9, 10.6, '1 serving', 40],
  ['Ragi, finger millet', 'finger millet,kezhvaragu,nachni', 'grain', 328, 7.3, 72.0, 1.3, 11.5, '100 g', 100],
  ['Poha, flattened rice', 'aval,beaten rice', 'grain', 346, 6.7, 76.9, 1.2, 2.5, '1 katori', 80],
  ['Bread, white', 'sandwich bread,pav', 'grain', 265, 9.0, 49.0, 3.2, 2.7, '1 slice', 28],
  ['Bread, brown/whole wheat', 'whole wheat bread,atta bread', 'grain', 247, 13.0, 41.0, 3.4, 7.0, '1 slice', 30],
  ['Biryani, chicken', 'chicken biriyani', 'grain', 180, 9.5, 22.0, 6.0, 1.2, '1 plate', 300],
  ['Biryani, vegetable', 'veg biryani,veg biriyani', 'grain', 158, 3.8, 24.0, 5.2, 1.8, '1 plate', 300],
  ['Pulao', 'pulav,veg pulao', 'grain', 152, 3.4, 24.0, 4.6, 1.5, '1 katori', 200],

  // ── Dals & legumes ──────────────────────────────────────────────────────
  ['Toor dal, cooked', 'arhar dal,thuvaram paruppu,tur dal', 'legume', 121, 7.0, 20.0, 0.6, 5.0, '1 katori', 150],
  ['Moong dal, cooked', 'green gram dal,pasi paruppu', 'legume', 105, 7.0, 18.0, 0.4, 5.5, '1 katori', 150],
  ['Chana dal, cooked', 'bengal gram dal,kadalai paruppu', 'legume', 130, 7.5, 21.0, 1.5, 6.0, '1 katori', 150],
  ['Rajma, cooked', 'kidney beans', 'legume', 127, 8.7, 22.8, 0.5, 6.4, '1 katori', 150],
  ['Chickpeas, cooked', 'chana,kondakadalai,chole,garbanzo', 'legume', 164, 8.9, 27.4, 2.6, 7.6, '1 katori', 150],
  ['Sprouts, moong', 'moong sprouts,mulaikattiya payaru', 'legume', 30, 3.0, 5.9, 0.2, 1.8, '1 katori', 100],
  ['Peanuts, roasted', 'groundnut,verkadalai,moongphali', 'legume', 567, 25.8, 16.1, 49.2, 8.5, '1 handful', 30],

  // ── Protein: eggs, meat, fish ───────────────────────────────────────────
  ['Egg, whole boiled', 'egg,muttai,anda,boiled egg', 'protein', 155, 12.6, 1.1, 10.6, 0, '1 egg', 50],
  ['Egg white, boiled', 'egg white,anda safedi', 'protein', 52, 10.9, 0.7, 0.2, 0, '1 white', 33],
  ['Omelette, 2 egg', 'omelet,muttai poriyal', 'protein', 196, 12.0, 1.5, 15.5, 0, '1 omelette', 120],
  ['Egg curry', 'muttai kulambu,anda curry', 'protein', 142, 8.2, 5.0, 10.0, 1.2, '1 katori', 180],
  ['Chicken breast, cooked', 'chicken,grilled chicken,chicken breast', 'protein', 165, 31.0, 0, 3.6, 0, '1 piece', 100],
  ['Chicken curry', 'chicken kulambu,chicken masala', 'protein', 180, 14.5, 5.0, 11.0, 1.0, '1 katori', 180],
  ['Chicken, tandoori', 'tandoori chicken,grilled chicken tikka', 'protein', 175, 26.0, 3.0, 6.5, 0.4, '2 pieces', 150],
  ['Fish curry', 'meen kulambu,fish kuzhambu', 'protein', 130, 14.0, 4.0, 6.5, 0.8, '1 katori', 180],
  ['Fish, fried', 'meen varuval,fried fish', 'protein', 232, 22.0, 5.0, 13.5, 0.3, '1 piece', 100],
  ['Mutton curry', 'mutton kulambu,lamb curry', 'protein', 232, 16.0, 4.5, 17.0, 0.9, '1 katori', 180],
  ['Prawns, cooked', 'shrimp,eral', 'protein', 99, 24.0, 0.2, 0.3, 0, '100 g', 100],

  // ── Protein: vegetarian ─────────────────────────────────────────────────
  ['Paneer', 'cottage cheese,panir', 'protein', 265, 18.3, 6.1, 20.8, 0, '1 serving', 50],
  ['Paneer butter masala', 'paneer makhani', 'protein', 236, 9.0, 9.0, 18.5, 1.6, '1 katori', 180],
  ['Tofu', 'soya paneer,bean curd', 'protein', 76, 8.1, 1.9, 4.8, 0.3, '1 serving', 100],
  ['Soya chunks, cooked', 'meal maker,soya nuggets', 'protein', 172, 26.0, 12.0, 1.5, 5.0, '1 katori', 100],
  ['Whey protein powder', 'whey,protein powder,whey isolate', 'supplement', 380, 78.0, 8.0, 4.0, 0, '1 scoop', 30],

  // ── Dairy ───────────────────────────────────────────────────────────────
  ['Milk, full fat', 'paal,doodh,whole milk', 'dairy', 62, 3.2, 4.7, 3.3, 0, '1 glass', 200],
  ['Milk, toned', 'toned milk,skim milk', 'dairy', 47, 3.3, 4.8, 1.5, 0, '1 glass', 200],
  ['Curd', 'yoghurt,yogurt,thayir,dahi', 'dairy', 61, 3.5, 4.7, 3.3, 0, '1 katori', 150],
  ['Buttermilk', 'moru,chaas,neer mor', 'dairy', 27, 1.6, 3.5, 0.8, 0, '1 glass', 200],
  ['Ghee', 'clarified butter,nei', 'dairy', 900, 0, 0, 100, 0, '1 tsp', 5],
  ['Butter', 'makhan,vennai', 'dairy', 717, 0.9, 0.1, 81.0, 0, '1 tsp', 5],
  ['Cheese slice', 'processed cheese,cheddar', 'dairy', 350, 22.0, 2.0, 28.0, 0, '1 slice', 20],

  // ── Vegetables & curries ────────────────────────────────────────────────
  ['Potato, boiled', 'aloo,urulaikizhangu', 'vegetable', 87, 1.9, 20.1, 0.1, 1.8, '1 medium', 120],
  ['Potato fry', 'aloo fry,urulai varuval', 'vegetable', 168, 2.1, 22.0, 8.4, 2.2, '1 katori', 100],
  ['Mixed vegetable curry', 'veg curry,kootu,poriyal', 'vegetable', 96, 2.8, 10.0, 5.2, 3.0, '1 katori', 150],
  ['Spinach, cooked', 'palak,keerai', 'vegetable', 41, 3.0, 4.0, 1.8, 2.4, '1 katori', 100],
  ['Cabbage poriyal', 'cabbage thoran,muttaikose poriyal', 'vegetable', 78, 2.2, 8.0, 4.4, 2.8, '1 katori', 100],
  ['Beans poriyal', 'beans thoran,avarakkai poriyal', 'vegetable', 84, 2.6, 9.0, 4.5, 3.4, '1 katori', 100],
  ['Carrot, raw', 'gajar,carrot', 'vegetable', 41, 0.9, 9.6, 0.2, 2.8, '1 medium', 80],
  ['Cucumber', 'kheera,vellarikkai', 'vegetable', 15, 0.7, 3.6, 0.1, 0.5, '1 medium', 150],
  ['Onion, raw', 'vengayam,pyaz', 'vegetable', 40, 1.1, 9.3, 0.1, 1.7, '1 medium', 100],
  ['Tomato, raw', 'thakkali,tamatar', 'vegetable', 18, 0.9, 3.9, 0.2, 1.2, '1 medium', 100],

  // ── Fruit ───────────────────────────────────────────────────────────────
  ['Banana', 'vazhaipazham,kela', 'fruit', 89, 1.1, 22.8, 0.3, 2.6, '1 medium', 120],
  ['Apple', 'seb,apple', 'fruit', 52, 0.3, 13.8, 0.2, 2.4, '1 medium', 180],
  ['Orange', 'santra,orange', 'fruit', 47, 0.9, 11.8, 0.1, 2.4, '1 medium', 130],
  ['Mango', 'aam,maampazham', 'fruit', 60, 0.8, 15.0, 0.4, 1.6, '1 medium', 200],
  ['Papaya', 'papita,pappali', 'fruit', 43, 0.5, 10.8, 0.3, 1.7, '1 katori', 150],
  ['Grapes', 'angoor,dhratchai', 'fruit', 69, 0.7, 18.1, 0.2, 0.9, '1 katori', 100],
  ['Pomegranate', 'anar,mathulai', 'fruit', 83, 1.7, 18.7, 1.2, 4.0, '1 katori', 150],
  ['Dates', 'khajur,pericham pazham', 'fruit', 277, 1.8, 75.0, 0.2, 6.7, '2 dates', 20],

  // ── Nuts & seeds ────────────────────────────────────────────────────────
  ['Almonds', 'badam,vaadumai', 'nuts', 579, 21.2, 21.6, 49.9, 12.5, '10 almonds', 12],
  ['Cashew nuts', 'kaju,mundhiri', 'nuts', 553, 18.2, 30.2, 43.9, 3.3, '10 cashews', 15],
  ['Walnuts', 'akhrot', 'nuts', 654, 15.2, 13.7, 65.2, 6.7, '4 halves', 12],
  ['Peanut butter', 'groundnut butter', 'nuts', 588, 25.1, 20.0, 50.4, 6.0, '1 tbsp', 16],
  ['Chia seeds', 'chia', 'nuts', 486, 16.5, 42.1, 30.7, 34.4, '1 tbsp', 12],
  ['Flax seeds', 'alsi,ali vidai', 'nuts', 534, 18.3, 28.9, 42.2, 27.3, '1 tbsp', 10],

  // ── Oils & fats ─────────────────────────────────────────────────────────
  ['Coconut oil', 'thengai ennai', 'fat', 862, 0, 0, 100, 0, '1 tsp', 5],
  ['Groundnut oil', 'peanut oil,kadalai ennai', 'fat', 884, 0, 0, 100, 0, '1 tsp', 5],
  ['Sunflower oil', 'refined oil,cooking oil', 'fat', 884, 0, 0, 100, 0, '1 tsp', 5],

  // ── Snacks, drinks & misc ───────────────────────────────────────────────
  ['Samosa', 'samosa', 'snack', 308, 5.0, 32.0, 17.9, 2.5, '1 samosa', 60],
  ['Bajji', 'bonda,pakoda,pakora', 'snack', 285, 6.0, 30.0, 15.5, 3.0, '1 piece', 40],
  ['Murukku', 'chakli,thenkuzhal', 'snack', 520, 8.0, 55.0, 30.0, 3.0, '1 piece', 20],
  ['Biscuit, marie', 'marie biscuit,tea biscuit', 'snack', 416, 7.0, 76.0, 9.0, 2.0, '2 biscuits', 12],
  ['Tea with milk & sugar', 'chai,tea', 'drink', 44, 1.2, 6.5, 1.4, 0, '1 cup', 150],
  ['Coffee with milk & sugar', 'filter coffee,kaapi,coffee', 'drink', 51, 1.4, 7.0, 1.9, 0, '1 cup', 150],
  ['Black coffee, no sugar', 'black coffee,americano', 'drink', 2, 0.2, 0.3, 0, 0, '1 cup', 150],
  ['Tender coconut water', 'elaneer,nariyal pani', 'drink', 19, 0.7, 3.7, 0.2, 1.1, '1 glass', 250],
  ['Fruit juice, fresh', 'juice,fresh juice', 'drink', 45, 0.6, 10.9, 0.2, 0.3, '1 glass', 200],
  ['Sugar', 'chini,sakkarai', 'other', 387, 0, 100, 0, 0, '1 tsp', 5],
  ['Honey', 'shahad,then', 'other', 304, 0.3, 82.4, 0, 0.2, '1 tsp', 7],
];
