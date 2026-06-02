// ======================================================
// EDIT PRODUCT
// ======================================================

const params    = new URLSearchParams(window.location.search);
const productId = params.get('id');
const token     = localStorage.getItem('s4l_token');

const form              = document.getElementById('edit-product-form');
const categorySelect    = document.getElementById('product-category');
const subcategorySelect = document.getElementById('product-subcategory');

if (!productId) {
  window.location.replace('/account/vendor/products.html');
}
if (!token) {
  window.location.replace('/account/signin.html');
}

// ── Cloudinary config ──────────────────────────────
const CLD_CLOUD  = 'djpkj0s7w';
const CLD_PRESET = 'lhhkniqv';

const uploadedUrls   = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, null]));
const pendingUploads = new Set();

// ======================================================
// SUBCATEGORY MAP  (16 categories, 300+ subcategories)
// ======================================================

const subcategoriesMap = {
  fashion: [
    "Women's Dresses","Women's Tops & T-Shirts","Women's Trousers & Skirts",
    "Women's Coats & Jackets","Women's Knitwear & Cardigans","Women's Swimwear",
    "Women's Lingerie & Nightwear","Women's Activewear","Women's Plus Size",
    "Men's T-Shirts & Tops","Men's Shirts","Men's Trousers & Chinos",
    "Men's Suits & Blazers","Men's Hoodies & Sweatshirts","Men's Activewear",
    "Men's Underwear & Socks","Men's Coats & Jackets",
    "Girls Clothing (3-13)","Boys Clothing (3-13)","Baby & Infant Clothing (0-2)",
    "School Uniform",
    "Trainers & Sneakers","Boots","Heels & Wedges","Sandals & Flip Flops",
    "Formal & Smart Shoes","Sports Shoes","Slippers",
    "Bags & Handbags","Backpacks","Hats & Caps","Scarves & Wraps",
    "Belts","Sunglasses","Jewellery","Watches","Gloves & Mittens",
  ],
  electronics: [
    "Smartphones","Mobile Phone Cases & Covers","Mobile Chargers & Cables",
    "Screen Protectors","Power Banks","Tablets & E-Readers","Tablet Accessories",
    "Laptops","Desktop Computers","Computer Monitors","PC Components (CPU, GPU, RAM)",
    "Storage (SSDs, HDDs, USB Drives)","Keyboards & Mice","Laptop Bags & Sleeves",
    "Computer Accessories",
    "TVs","Projectors & Screens","Blu-ray & DVD Players","Remote Controls",
    "Headphones & Earphones","Speakers","Soundbars & Home Cinema","DAC & Amplifiers",
    "Gaming Consoles","Video Games","Gaming Controllers","Gaming Headsets",
    "Gaming Chairs & Desks","PC Gaming Accessories",
    "Digital Cameras (DSLR / Mirrorless)","Action Cameras","Camera Lenses",
    "Camera Bags & Accessories","Tripods & Stabilisers",
    "Smart Speakers & Displays","Smart Home Hubs","Smart Plugs & Switches",
    "Smart Security Cameras & Doorbells","Smart Lighting",
    "Smartwatches","Fitness Trackers","VR & AR Headsets",
    "Printers & Scanners","Ink & Toner Cartridges",
    "Routers & Networking","Range Extenders",
    "Microwaves","Coffee Machines","Kettles","Toasters","Air Fryers",
    "Cables & Adaptors","Batteries","Car Electronics",
  ],
  home: [
    "Sofas & Armchairs","Sofa Beds","Coffee Tables & Side Tables",
    "Dining Tables & Chairs","Beds & Bed Frames","Mattresses",
    "Wardrobes & Dressing Tables","Chest of Drawers","Bookcases & Shelving",
    "TV Units & Media Furniture","Office & Study Furniture","Kids Furniture",
    "Duvets & Duvets Sets","Pillows","Bed Sheets & Fitted Sheets",
    "Mattress Toppers & Protectors","Towels & Bathrobes","Weighted Blankets",
    "Pots & Pans","Kitchen Knives","Baking Trays & Tins",
    "Kitchen Utensils & Gadgets","Mixing Bowls & Measuring","Dinnerware & Plates",
    "Glasses & Mugs","Food Storage & Containers","Lunch Boxes",
    "Bathroom Accessories","Shower Curtains & Rails","Bath Mats",
    "Soap Dispensers & Toothbrush Holders","Mirrors","Towel Rails",
    "Garden Furniture & Parasols","Garden Sheds & Storage",
    "Plant Pots & Planters","Seeds, Bulbs & Compost",
    "Lawn Mowers & Garden Tools","BBQ Grills & Accessories",
    "Outdoor Heaters & Fire Pits","Hoses & Watering",
    "Ceiling Lights & Pendants","Floor & Table Lamps",
    "LED Strip Lights","Outdoor & Garden Lighting","Smart Lighting",
    "Wall Art & Prints","Clocks","Candles & Holders",
    "Cushions & Throws","Rugs","Curtains & Blinds","Vases & Ornaments",
    "Power Tools","Hand Tools","Ladders & Steps",
    "Paint, Brushes & Rollers","Wallpaper & Paste",
    "Screws, Fixings & Rawlplugs","Safety & Security (Locks, Alarms)",
    "Cleaning Products","Mops, Brushes & Cloths",
    "Laundry (Detergent, Pegs, Airers)","Storage Boxes & Baskets",
  ],
  books: [
    "Literary Fiction","Crime & Thriller","Science Fiction","Fantasy",
    "Romance","Horror & Gothic","Historical Fiction","Humour",
    "Short Stories & Poetry",
    "Biographies & Memoirs","History","Politics & Current Affairs",
    "True Crime","Science & Nature","Philosophy",
    "Psychology & Mental Health","Self-Help & Motivation",
    "Business & Entrepreneurship","Economics & Finance","Law",
    "Cookbooks & Food Writing","Travel Writing","Sport & Fitness Books",
    "Art, Architecture & Photography Books","Design & Fashion Books",
    "Parenting & Families","Religion & Spirituality",
    "Children's Picture Books (0-5)","Children's Fiction (6-9)",
    "Children's Fiction (9-12)","Young Adult (YA)",
    "Educational & Textbooks (School)","Academic & University",
    "Comics & Graphic Novels","Manga",
    "CDs & Music Albums","Vinyl Records",
    "DVDs & Blu-ray (Film)","DVDs & Blu-ray (TV Series)",
    "Magazines & Periodicals",
  ],
  toys: [
    "Baby Toys (0-12 months)","Toddler Toys (1-3 years)","Preschool Toys (3-5 years)",
    "Action Figures & Playsets","Superhero & Movie Figures",
    "Dolls & Dollhouses","Doll Accessories & Clothing",
    "LEGO Sets","Other Building & Construction",
    "Board Games","Card Games & Trading Cards","Puzzles",
    "Remote Control Cars & Trucks","Remote Control Aircraft & Drones",
    "Arts & Crafts Kits for Kids","Science & Discovery Kits",
    "Outdoor Play Equipment","Trampolines","Paddling Pools",
    "Scooters","Balance Bikes & Tricycles","Ride-On Cars",
    "Soft Toys & Stuffed Animals","Fidget & Sensory Toys",
    "Collectible Figures & Blind Boxes",
    "Role Play & Dress Up","Kitchen & Food Play",
    "Electronic & Interactive Toys","Coding & STEM Toys",
    "Sports Toys & Games","Pool & Beach Toys",
  ],
  health: [
    "Face Moisturisers & Creams","Cleansers, Toners & Micellar Water",
    "Serums & Face Oils","Face Masks & Exfoliators",
    "Sunscreen & SPF","Eye Cream & Treatments","Lip Care",
    "Foundation & Concealer","Powder, Bronzer & Blush",
    "Lipstick, Lip Gloss & Liner","Eyeshadow Palettes",
    "Eyeliner & Mascara","Eyebrow Products",
    "Makeup Setting Sprays & Primers","Makeup Brushes & Sponges",
    "Makeup Remover & Wipes",
    "Shampoo & Conditioner","Hair Treatments & Masks",
    "Hair Styling (Mousse, Gel, Wax, Spray)","Hair Oil & Serum",
    "Hair Colour & Bleach","Heated Styling Tools",
    "Hairbrushes & Combs","Hair Accessories",
    "Perfume (Women's)","Perfume (Men's)","Unisex & Niche Fragrances",
    "Body Sprays & Deodorants",
    "Shaving Razors & Blades","Shaving Foam & Gel",
    "Aftershave & Post-Shave","Electric Shavers & Trimmers",
    "Beard Care & Grooming","Men's Skincare",
    "Vitamins & Multivitamins","Protein Powder & Bars",
    "Pre-Workout & Sports Nutrition","Weight Management",
    "Omega 3, Collagen & Specialist Supplements",
    "Toothbrushes (Manual & Electric)","Toothpaste & Whitening",
    "Mouthwash & Floss","Dental Accessories",
    "Feminine Care","Sexual Health & Contraception",
    "First Aid Kits & Plasters","Pain Relief & Cold & Flu",
    "Blood Pressure Monitors & Health Monitors",
    "Mobility Aids & Supports (Knee, Back, Wrist)",
    "Aromatherapy & Essential Oils","Massage & Relaxation",
    "Bath & Shower Gels","Body Lotion & Creams","Soap & Hand Wash",
  ],
  sports: [
    "Dumbbells & Barbells","Weight Benches & Racks",
    "Resistance Bands & Tubes","Yoga Mats & Accessories",
    "Cardio Equipment (Treadmills, Bikes, Rowing)",
    "Pull-Up Bars & Suspension Trainers","Foam Rollers & Recovery",
    "Road Bikes","Mountain Bikes","Electric Bikes",
    "Cycling Helmets","Cycling Clothing","Cycling Accessories",
    "Running Shoes (Men's)","Running Shoes (Women's)",
    "Running Clothing & Tights","Running Accessories & Gadgets",
    "Swimming Costumes & Trunks","Swim Goggles & Caps",
    "Swimming Equipment & Pull Buoys",
    "Football Boots & Trainers","Footballs","Football Clothing",
    "Rugby","Cricket","Basketball","Netball",
    "Tennis Rackets & Strings","Badminton","Squash",
    "Golf Clubs","Golf Bags & Trolleys","Golf Clothing & Accessories",
    "Camping Tents","Sleeping Bags & Mats",
    "Hiking Boots & Trail Shoes","Hiking Clothing",
    "Rucksacks & Hydration Packs","Camping Cooking & Lanterns",
    "Surfing & Bodyboarding","Kayaking & Paddleboarding",
    "Water Ski & Wakeboard","Wetsuits",
    "Ski & Snowboard Equipment","Ski Clothing & Accessories",
    "Boxing Gloves & Bags","Martial Arts & MMA","Wrestling",
    "Fishing Rods","Fishing Reels & Lines","Fishing Tackle & Bait",
    "Hunting & Shooting Accessories",
    "Sports Nutrition & Recovery","Sports Protective Gear",
  ],
  automotive: [
    "Dash Cams","Sat Nav & GPS","Car Stereos & Head Units",
    "Car Speakers & Amplifiers","Parking Sensors & Cameras",
    "Car Seat Covers","Car Mats (Rubber & Carpet)",
    "Steering Wheel Covers","Phone Holders & Mounts",
    "Car Air Fresheners","Sunshades & Window Covers",
    "Car Cleaning & Valeting Kits","Car Wax & Polish",
    "Scratch Removers & Paint Protection",
    "Jump Starters & Battery Chargers","Car Inverters & Power Adapters",
    "Tyre Inflators & Gauges",
    "Engine Oil & Additives","Coolant & Antifreeze",
    "Brake Pads & Discs","Oil, Air & Fuel Filters",
    "Spark Plugs","Bulbs & LED Lighting","Wipers",
    "Tyres","Alloy Wheels","Wheel Trims & Hub Caps",
    "Car Body Trim & Accessories",
    "Car Tools & Garage Equipment","Jacks & Axle Stands",
    "Tow Ropes & Recovery Straps","Tow Bars",
    "Child Car Seats & Boosters",
    "Motorbike Helmets","Motorbike Clothing & Gloves",
    "Motorbike Parts","Motorbike Accessories",
    "Van Racking & Storage","Van Accessories",
  ],
  food: [
    "Fresh Fruit","Fresh Vegetables","Fresh Herbs",
    "Bread & Bakery","Cakes & Pastries",
    "Meat & Poultry","Fish & Seafood",
    "Dairy (Milk, Cheese, Butter, Yoghurt)","Eggs",
    "Tinned Vegetables & Beans","Tinned Fish & Meat","Tinned Soups",
    "Pasta, Noodles & Rice","Grains, Pulses & Lentils",
    "Breakfast Cereals & Granola","Porridge & Oats",
    "Sauces, Gravies & Marinades","Ketchup, Mustard & Mayo",
    "Spices, Herbs & Seasonings","Salt & Pepper",
    "Cooking Oils, Vinegar & Dressings",
    "Snacks, Crisps & Popcorn","Nuts & Dried Fruit",
    "Chocolate & Sweets","Biscuits & Cookies","Crackers",
    "Tea","Coffee & Hot Chocolate","Herbal & Fruit Infusions",
    "Soft Drinks & Juices","Energy Drinks","Water",
    "Beer & Cider","Wine","Spirits & Liqueurs","Non-Alcoholic Alternatives",
    "Organic & Natural Foods","Vegan & Plant-Based",
    "Gluten-Free","Diabetic & Low-Sugar",
    "World Foods (Asian, Caribbean, Middle Eastern, European)",
    "Baking (Flour, Sugar, Yeast, Chocolate Chips)",
    "Jam, Honey & Spreads","Pickles & Chutneys",
    "Baby Food & Formula",
  ],
  baby: [
    "Baby Bottles & Teats","Breast Pumps","Sterilisers & Warmers",
    "Bibs & Feeding Accessories","Weaning & High Chairs",
    "Baby Food & Formula","Snacks & Drinks for Toddlers",
    "Nappies (Disposable)","Reusable Nappies & Wraps",
    "Nappy Bags & Changing Mats","Baby Wipes",
    "Baby Clothing (0-6 months)","Baby Clothing (6-18 months)",
    "Baby Clothing (18m-2yr)","Toddler Clothing (2-5 years)",
    "Pram Suits & Snowsuits","Baby Footwear",
    "Pushchairs & Prams","Travel Systems","Buggy Boards",
    "Baby Car Seats (Group 0, 0+)","Toddler Car Seats (Group 1, 2, 3)",
    "Baby Monitors (Video & Audio)","Baby Alarms",
    "Cots & Cribs","Moses Baskets & Stands","Baby Bedding & Sleeping Bags",
    "Baby Baths & Changing Units",
    "Baby Skincare & Bath Products","Baby Toiletries",
    "Dummies & Teethers","Baby Carriers & Slings",
    "Baby Bouncers & Rockers","Baby Walkers & Activity Centres",
    "Baby Toys & Rattles",
    "Stair Gates & Baby Safety","Baby Monitors & Safety",
    "Kids Bedroom Furniture","Kids Bedding",
    "School Bags & Lunchboxes","Kids Stationery",
    "Children's Books (0-5)","Children's Books (5-12)",
  ],
  pets: [
    "Dog Dry Food","Dog Wet Food & Pouches","Dog Treats & Chews",
    "Dog Leads & Harnesses","Dog Collars & ID Tags",
    "Dog Beds & Crates","Dog Coats & Accessories",
    "Dog Toys","Dog Grooming (Brushes, Shampoo, Clippers)",
    "Dog Training & Behaviour","Dog Health & Dental",
    "Cat Dry Food","Cat Wet Food & Pouches","Cat Treats",
    "Cat Litter & Litter Trays","Cat Beds & Cat Trees",
    "Cat Toys","Cat Collars & Leads",
    "Cat Grooming","Cat Flaps & Doors","Cat Health",
    "Fish Tanks & Aquariums","Fish Food",
    "Aquarium Filters, Heaters & Pumps","Aquarium Decorations",
    "Bird Cages & Aviaries","Bird Food & Seed","Bird Treats & Accessories",
    "Rabbit & Guinea Pig Food","Small Animal Cages & Runs",
    "Small Animal Bedding & Accessories",
    "Reptile Vivariums & Enclosures","Reptile Heat & Lighting",
    "Reptile Food & Supplements",
    "Veterinary & Pet Health Products","Flea & Tick Treatment",
    "Pet Carriers & Travel Accessories",
  ],
  arts: [
    "Acrylic Paints & Sets","Oil Paints & Sets","Watercolour Paints",
    "Gouache & Inks","Spray Paints",
    "Paintbrushes & Palette Knives","Palette & Mixing Trays",
    "Canvas (Stretched & Boards)","Watercolour Paper","Sketchbooks",
    "Pencils, Charcoal & Pastels","Colouring Pencils & Pens",
    "Fine Liners & Technical Pens","Markers & Brush Pens",
    "Fabric & Felt","Yarn & Wool (Knitting & Crochet)",
    "Knitting Needles & Crochet Hooks",
    "Sewing Machines","Sewing Thread & Needles",
    "Fabric Scissors & Cutting Tools","Embroidery & Cross Stitch Kits",
    "Scrapbooking & Card Making","Washi Tape & Stickers",
    "Resin Art Supplies","Jewellery Making (Beads, Wire, Clasps)",
    "Clay & Air-Dry Clay","Sculpting Tools",
    "Printmaking & Lino Cutting",
    "Candle Making (Wax, Wicks, Moulds)","Soap Making",
    "Photography Equipment","Darkroom & Film Photography",
    "Acoustic Guitars","Electric Guitars & Basses",
    "Piano & Digital Keyboards","Drums & Electronic Drum Kits",
    "Ukulele","Violin & Strings","Wind & Brass Instruments",
    "Music Accessories (Strings, Picks, Stands)",
    "Sheet Music & Music Books",
    "Coin Collecting","Stamp Collecting",
    "Trading Cards & Collectibles (Pokémon, Football etc.)",
    "Model Making & Miniatures","Airfix & Scale Models",
    "3D Printing Supplies","Laser Cutting Materials",
    "Party & Event Supplies","Balloons & Decorations",
  ],
  office: [
    "Ballpoint & Rollerball Pens","Fountain Pens","Gel Pens",
    "Highlighters & Markers","Pencils & Mechanical Pencils",
    "Notebooks (Hardback)","Notebooks (Softback & Spiral)",
    "Planners & Diaries","Sticky Notes & Memo Pads",
    "Folders & Ring Binders","Document Wallets & Sleeves",
    "Filing Cabinets & Desktop Organisers",
    "Paper (A4, A3, Coloured)","Card & Envelopes",
    "Printer Labels & Stickers",
    "Ink Cartridges (Inkjet)","Toner Cartridges (Laser)",
    "Printers","Scanners","Shredders",
    "Laminators & Laminating Pouches","Binding Machines",
    "Office Chairs (Ergonomic)","Standing Desks",
    "Monitor Stands & Laptop Risers",
    "Whiteboards & Cork Boards","Notice Board Accessories",
    "Staplers, Punches & Tape Dispensers",
    "Scissors, Letter Openers & Rulers",
    "Calculators","Presentation Clickers & Pointers",
    "Desk Lamps","Cable Management",
  ],
  antiques: [
    "Antique Furniture (Victorian, Georgian, Edwardian)",
    "Mid-Century Modern Furniture",
    "Vintage Clothing & Accessories (Pre-1990)","Vintage Watches",
    "Vintage Cameras & Electronics",
    "Original Oil Paintings & Watercolours","Prints & Engravings",
    "Ceramics & Pottery (China, Porcelain, Stoneware)",
    "Glass & Crystal (Victorian, Art Deco, etc.)",
    "Silver & Silverplate","Pewter & Metalware",
    "Antique Clocks & Mantel Clocks","Pocket Watches",
    "Coins & Banknotes (UK)","Coins & Banknotes (World)",
    "Stamps (British)","Stamps (World & Thematic)",
    "First Edition & Antiquarian Books",
    "Postcards, Photographs & Ephemera",
    "Military Memorabilia & Medals","Uniforms & Badges",
    "Sports Memorabilia (Signed Shirts, Programmes)",
    "Vintage Toys & Games","Tin Toys & Dolls",
    "Vintage Jewellery","Art Nouveau & Art Deco",
    "Maps, Globes & Scientific Instruments",
    "Advertising & Breweriana","Pub & Barware",
    "Fossils, Minerals & Natural History",
  ],
  travel: [
    "Hard Shell Suitcases (Cabin)","Hard Shell Suitcases (Medium / Large)",
    "Soft Shell Suitcases","Wheeled Holdalls & Duffel Bags",
    "Backpacks (Travel & Hiking)","Day Packs & Daybags",
    "Laptop Bags & Briefcases","Handbags & Crossbody Bags",
    "Travel Pillows (Neck & Inflatable)","Eye Masks & Earplugs",
    "Luggage Locks, Straps & Tags","Packing Cubes & Compression Bags",
    "Travel Adapters & Multi-Plugs","Portable Power Banks",
    "Travel Wallets & Passport Holders","Money Belts & Pouches",
    "Toiletry Bags & Wash Bags","Mini Travel Bottles & Containers",
    "Travel Clothing (Packable Jackets, Scarves)",
    "Waterproof Bags & Dry Sacks",
    "Maps, Guidebooks & Travel Books","Travel Games & Entertainment",
  ],
  software: [
    "PC Software (Windows)","Mac Software (macOS)",
    "Antivirus & Internet Security","VPN Software",
    "Design & Creative (Adobe, Affinity etc.)","Video Editing Software",
    "Audio & Music Production Software","CAD & Engineering Software",
    "Business & Office Software","Accounting Software",
    "Educational Software & Learning Tools",
    "Gaming (PC / Digital Code)","Gaming DLC & In-Game Currency",
    "Amazon Gift Cards","iTunes & App Store Gift Cards",
    "Gaming Gift Cards (PlayStation, Xbox, Nintendo, Steam)",
    "Retail & Restaurant Gift Cards",
    "Other Digital Downloads & E-books",
  ],
  other: ["Miscellaneous"],
};

// ======================================================
// TAG SUGGESTIONS
// ======================================================

const TAG_SUGGESTIONS = {
  fashion: {
    _base: ['fashion', 'clothing', 'style', 'trendy', 'uk fashion', 'outfit', 'wardrobe'],
    "women's dresses": ['dress', 'womens dress', 'party dress', 'summer dress', 'maxi dress', 'midi dress', 'evening dress', 'floral dress', 'casual dress'],
    "women's tops & t-shirts": ['womens top', 'blouse', 'ladies top', 'tshirt', 'casual top', 'summer top', 'vest top'],
    "women's trousers & skirts": ['skirt', 'womens trousers', 'midi skirt', 'wide leg trousers', 'leggings'],
    "women's coats & jackets": ['womens coat', 'ladies jacket', 'winter coat', 'blazer', 'puffer jacket', 'trench coat'],
    "women's activewear": ['womens activewear', 'gym wear', 'yoga wear', 'leggings', 'sports bra', 'workout clothes'],
    "men's t-shirts & tops": ['mens tshirt', 'mens top', 'graphic tee', 'polo shirt', 'casual tshirt'],
    "men's shirts": ['mens shirt', 'dress shirt', 'casual shirt', 'formal shirt', 'oxford shirt', 'linen shirt'],
    "men's trousers & chinos": ['chinos', 'mens trousers', 'slim fit trousers', 'cargo trousers', 'joggers'],
    "men's suits & blazers": ['suit', 'mens suit', 'blazer', 'formal wear', 'business suit', 'wedding suit'],
    "men's hoodies & sweatshirts": ['hoodie', 'sweatshirt', 'pullover', 'mens hoodie', 'zip hoodie'],
    "men's activewear": ['mens gym wear', 'activewear', 'shorts', 'compression wear', 'training top'],
    "trainers & sneakers": ['trainers', 'sneakers', 'sports shoes', 'casual shoes', 'white trainers'],
    "boots": ['boots', 'ankle boots', 'chelsea boots', 'knee high boots', 'winter boots'],
    "bags & handbags": ['handbag', 'tote bag', 'shoulder bag', 'clutch bag', 'crossbody bag', 'leather bag'],
    "jewellery": ['jewellery', 'necklace', 'earrings', 'bracelet', 'ring', 'gold jewellery', 'silver jewellery'],
    "watches": ['watch', 'wristwatch', 'mens watch', 'womens watch', 'luxury watch'],
    "sunglasses": ['sunglasses', 'shades', 'uv400', 'fashion sunglasses', 'polarised sunglasses'],
    "hats & caps": ['hat', 'cap', 'beanie', 'baseball cap', 'bucket hat', 'snapback'],
  },
  electronics: {
    _base: ['electronics', 'gadget', 'tech', 'technology', 'uk electronics', 'gift for him'],
    'smartphones': ['smartphone', 'mobile phone', 'android phone', '5g phone', 'unlocked phone'],
    'mobile phone cases & covers': ['phone case', 'phone cover', 'protective case', 'iphone case', 'samsung case'],
    'mobile chargers & cables': ['charger', 'usb cable', 'fast charger', 'usb c', 'wireless charger'],
    'power banks': ['power bank', 'portable charger', 'battery pack', 'usb power bank', 'travel charger'],
    'tablets & e-readers': ['tablet', 'ipad', 'android tablet', 'e-reader', 'kindle'],
    'laptops': ['laptop', 'notebook', 'gaming laptop', 'business laptop', 'ultrabook'],
    'headphones & earphones': ['headphones', 'earphones', 'wireless earbuds', 'bluetooth headphones', 'noise cancelling', 'over ear headphones', 'in ear'],
    'speakers': ['bluetooth speaker', 'portable speaker', 'wireless speaker', 'waterproof speaker'],
    'tvs': ['tv', 'smart tv', '4k tv', 'oled tv', 'led tv', 'television', 'flat screen'],
    'gaming consoles': ['gaming console', 'playstation', 'xbox', 'nintendo switch', 'gaming'],
    'smartwatches': ['smartwatch', 'fitness watch', 'smart band', 'activity tracker'],
    'digital cameras (dslr / mirrorless)': ['camera', 'dslr', 'mirrorless camera', 'photography', 'digital camera', 'vlogging camera'],
    'action cameras': ['action camera', 'gopro', 'sports camera', 'waterproof camera', 'helmet camera'],
    'smart speakers & displays': ['smart speaker', 'alexa', 'google home', 'voice assistant', 'smart home'],
    'gaming headsets': ['gaming headset', 'gaming headphones', 'ps5 headset', 'xbox headset', 'surround sound'],
  },
  home: {
    _base: ['home', 'home decor', 'interior design', 'homeware', 'uk home', 'house'],
    'sofas & armchairs': ['sofa', 'couch', 'armchair', 'corner sofa', 'grey sofa', 'living room furniture'],
    'beds & bed frames': ['bed frame', 'double bed', 'king size bed', 'ottoman bed', 'wooden bed'],
    'mattresses': ['mattress', 'memory foam mattress', 'pocket sprung', 'orthopaedic mattress'],
    'duvets & duvets sets': ['duvet', 'bedding set', 'duvet cover', 'double duvet', 'king duvet'],
    'pillows': ['pillow', 'memory foam pillow', 'pillow pair', 'anti-allergy pillow'],
    'pots & pans': ['cookware', 'frying pan', 'saucepan', 'non stick pan', 'wok', 'casserole dish'],
    'kitchen knives': ['kitchen knife', 'chef knife', 'knife set', 'santoku knife'],
    'candles & holders': ['candle', 'scented candle', 'soy candle', 'candle holder', 'home fragrance'],
    'rugs': ['rug', 'area rug', 'living room rug', 'bedroom rug', 'hall runner', 'washable rug'],
    'curtains & blinds': ['curtains', 'blackout curtains', 'eyelet curtains', 'roller blind'],
    'wall art & prints': ['wall art', 'canvas print', 'framed print', 'poster', 'abstract art'],
    'cushions & throws': ['cushion', 'scatter cushion', 'throw blanket', 'velvet cushion'],
    'garden furniture & parasols': ['garden furniture', 'garden table', 'patio set', 'parasol', 'outdoor furniture'],
    'ceiling lights & pendants': ['ceiling light', 'pendant light', 'chandelier', 'led light'],
    'cleaning products': ['cleaning', 'household cleaner', 'disinfectant', 'multi-surface cleaner'],
    'lawn mowers & garden tools': ['lawn mower', 'garden tools', 'spade', 'pruners', 'garden equipment'],
  },
  books: {
    _base: ['book', 'reading', 'paperback', 'hardback', 'gift book', 'bestseller'],
    'literary fiction': ['fiction', 'novel', 'literary fiction', 'booker prize', 'contemporary fiction'],
    'crime & thriller': ['thriller', 'crime fiction', 'mystery', 'detective', 'suspense'],
    'science fiction': ['sci-fi', 'science fiction', 'space opera', 'dystopian', 'cyberpunk'],
    'fantasy': ['fantasy', 'epic fantasy', 'magic', 'dragons', 'high fantasy'],
    'romance': ['romance novel', 'love story', 'romantic fiction', 'contemporary romance'],
    'biographies & memoirs': ['biography', 'memoir', 'autobiography', 'life story', 'true story'],
    'self-help & motivation': ['self help', 'motivation', 'personal development', 'mindset', 'productivity'],
    'business & entrepreneurship': ['business book', 'entrepreneurship', 'leadership', 'management'],
    'cookbooks & food writing': ['cookbook', 'recipe book', 'cooking', 'baking book'],
    "children's picture books (0-5)": ['childrens book', 'picture book', 'toddler book', 'bedtime story'],
    "children's fiction (6-9)": ['childrens fiction', 'chapter book', 'kids novel', 'adventure story'],
    'young adult (ya)': ['ya fiction', 'teen book', 'young adult', 'ya fantasy'],
  },
  toys: {
    _base: ['toy', 'kids toy', 'children', 'play', 'gift for kids', 'educational toy'],
    'lego sets': ['lego', 'building blocks', 'construction toy', 'stem toy'],
    'board games': ['board game', 'family game', 'party game', 'strategy game', 'game night'],
    'action figures & playsets': ['action figure', 'playset', 'superhero toy', 'collectible figure'],
    'dolls & dollhouses': ['doll', 'dollhouse', 'fashion doll', 'baby doll'],
    'remote control cars & trucks': ['remote control car', 'rc car', 'toy car', 'radio controlled'],
    'arts & crafts kits for kids': ['arts and crafts', 'craft kit', 'creative toy', 'painting kit'],
    'outdoor play equipment': ['outdoor toy', 'garden toy', 'swing set', 'slide', 'climbing frame'],
    'soft toys & stuffed animals': ['soft toy', 'stuffed animal', 'teddy bear', 'plush toy', 'cuddly toy'],
    'puzzles': ['jigsaw puzzle', 'puzzle', 'brain teaser', '1000 piece puzzle'],
    'scooters': ['scooter', 'kids scooter', '3 wheel scooter', 'kick scooter'],
    'baby toys (0-12 months)': ['baby toy', 'sensory toy', 'rattle', 'activity mat', 'infant toy'],
    'coding & stem toys': ['stem toy', 'coding toy', 'robot toy', 'science kit', 'educational'],
  },
  health: {
    _base: ['health', 'beauty', 'skincare', 'wellness', 'personal care', 'self care'],
    'face moisturisers & creams': ['moisturiser', 'face cream', 'hydrating cream', 'anti-ageing', 'spf moisturiser'],
    'cleansers, toners & micellar water': ['cleanser', 'face wash', 'micellar water', 'toner'],
    'serums & face oils': ['serum', 'vitamin c serum', 'hyaluronic acid', 'face oil', 'retinol'],
    'face masks & exfoliators': ['face mask', 'sheet mask', 'exfoliator', 'clay mask', 'scrub'],
    'sunscreen & spf': ['sunscreen', 'spf', 'sun protection', 'factor 50', 'daily spf'],
    'foundation & concealer': ['foundation', 'concealer', 'full coverage', 'liquid foundation', 'bb cream'],
    'eyeshadow palettes': ['eyeshadow palette', 'eye makeup', 'neutral palette', 'smoky eye'],
    'lipstick, lip gloss & liner': ['lipstick', 'lip gloss', 'lip liner', 'lip colour', 'nude lipstick'],
    'eyeliner & mascara': ['mascara', 'eyeliner', 'volumising mascara', 'waterproof mascara'],
    'shampoo & conditioner': ['shampoo', 'conditioner', 'hair care', 'anti-frizz', 'moisturising shampoo'],
    'hair styling (mousse, gel, wax, spray)': ['hair gel', 'hair wax', 'hairspray', 'hair mousse'],
    "perfume (women's)": ['perfume', 'womens fragrance', 'eau de parfum', 'floral perfume', 'gift set'],
    "perfume (men's)": ['mens perfume', 'aftershave', 'cologne', 'mens fragrance', 'eau de toilette'],
    'vitamins & multivitamins': ['vitamins', 'multivitamins', 'supplements', 'health supplements'],
    'protein powder & bars': ['protein powder', 'whey protein', 'protein bar', 'sports nutrition'],
    'electric shavers & trimmers': ['electric shaver', 'beard trimmer', 'hair clipper', 'grooming kit'],
    'toothbrushes (manual & electric)': ['electric toothbrush', 'toothbrush', 'oral care', 'sonic toothbrush'],
  },
  sports: {
    _base: ['sports', 'fitness', 'exercise', 'gym', 'active lifestyle', 'workout'],
    'dumbbells & barbells': ['dumbbells', 'weights', 'barbell', 'strength training', 'home gym'],
    'yoga mats & accessories': ['yoga mat', 'yoga', 'pilates mat', 'exercise mat', 'non-slip yoga mat'],
    'resistance bands & tubes': ['resistance band', 'exercise band', 'booty band', 'glute band'],
    'cardio equipment (treadmills, bikes, rowing)': ['treadmill', 'exercise bike', 'rowing machine', 'home gym equipment'],
    "running shoes (men's)": ['mens running shoes', 'running trainers', 'road running', 'jogging shoes'],
    "running shoes (women's)": ['womens running shoes', 'running trainers', 'jogging shoes'],
    'running clothing & tights': ['running tights', 'compression leggings', 'running top', 'running jacket'],
    'swimming costumes & trunks': ['swimming costume', 'swimsuit', 'swim trunks', 'bikini'],
    'road bikes': ['road bike', 'bicycle', 'cycling', 'road cycling', 'racing bike'],
    'cycling helmets': ['cycling helmet', 'bike helmet', 'road helmet', 'mtb helmet'],
    'footballs': ['football', 'match ball', 'training ball', 'size 5 football'],
    'tennis rackets & strings': ['tennis racket', 'tennis', 'beginner racket', 'graphite racket'],
    'golf clubs': ['golf clubs', 'driver', 'iron set', 'golf set', 'golf equipment'],
    'camping tents': ['tent', 'camping tent', '2 man tent', 'festival tent', 'outdoor camping'],
    'sleeping bags & mats': ['sleeping bag', 'camping mat', 'sleeping mat', '3 season sleeping bag'],
    'boxing gloves & bags': ['boxing gloves', 'punch bag', 'boxing', 'mma gloves', 'martial arts'],
    'fishing rods': ['fishing rod', 'fishing', 'angling', 'carp rod', 'fishing tackle'],
  },
  automotive: {
    _base: ['car accessories', 'automotive', 'vehicle accessories', 'car parts', 'motoring'],
    'dash cams': ['dash cam', 'dashcam', 'car camera', 'driving recorder', 'dual dash cam'],
    'sat nav & gps': ['sat nav', 'gps', 'car navigation', 'satnav'],
    'car stereos & head units': ['car stereo', 'head unit', 'car radio', 'android auto', 'apple carplay'],
    'car seat covers': ['car seat cover', 'universal seat cover', 'leather seat cover'],
    'car cleaning & valeting kits': ['car cleaning', 'car wash kit', 'valeting kit', 'microfibre cloth'],
    'jump starters & battery chargers': ['jump starter', 'portable jump starter', 'battery charger'],
    'tyre inflators & gauges': ['tyre inflator', 'portable air compressor', 'tyre pump'],
    'motorbike helmets': ['motorcycle helmet', 'full face helmet', 'open face helmet'],
    'engine oil & additives': ['engine oil', 'motor oil', 'synthetic oil', '5w30'],
    'phone holders & mounts': ['phone holder', 'car phone mount', 'magnetic phone holder'],
  },
  food: {
    _base: ['food', 'grocery', 'uk food', 'gourmet', 'foodie', 'artisan'],
    'chocolate & sweets': ['chocolate', 'sweets', 'confectionery', 'gift chocolate', 'luxury chocolate'],
    'tea': ['tea', 'herbal tea', 'green tea', 'english breakfast tea', 'loose leaf tea'],
    'coffee & hot chocolate': ['coffee', 'ground coffee', 'instant coffee', 'specialty coffee'],
    'snacks, crisps & popcorn': ['snacks', 'crisps', 'popcorn', 'healthy snacks'],
    'organic & natural foods': ['organic', 'natural food', 'healthy food', 'organic groceries'],
    'vegan & plant-based': ['vegan', 'plant-based', 'dairy-free', 'meat-free'],
    'gluten-free': ['gluten free', 'coeliac', 'wheat free', 'gluten free food'],
    'spices, herbs & seasonings': ['spices', 'herbs', 'seasoning', 'chilli', 'herb blend'],
    'baking (flour, sugar, yeast, chocolate chips)': ['baking', 'flour', 'baking supplies', 'bread making'],
    "world foods (asian, caribbean, middle eastern, european)": ['world food', 'asian food', 'caribbean food', 'international food'],
  },
  baby: {
    _base: ['baby', 'infant', 'newborn', 'toddler', 'baby gift', 'new baby'],
    "nappies (disposable)": ['nappies', 'disposable nappies', 'baby nappies', 'newborn nappies'],
    "baby clothing (0-6 months)": ['baby clothes', 'newborn clothing', 'babygrow', 'sleepsuit'],
    "baby clothing (6-18 months)": ['baby clothes', 'baby outfit', 'toddler clothing', 'baby vest'],
    'pushchairs & prams': ['pushchair', 'pram', 'stroller', 'baby buggy', 'travel system'],
    'baby monitors (video & audio)': ['baby monitor', 'video baby monitor', 'wifi baby monitor'],
    'cots & cribs': ['cot', 'baby cot', 'crib', 'cotbed', 'moses basket'],
    'baby bottles & teats': ['baby bottle', 'feeding bottle', 'anti-colic bottle'],
    'baby skincare & bath products': ['baby skincare', 'baby lotion', 'baby bath', 'gentle wash'],
    'baby toys & rattles': ['baby toy', 'rattle', 'sensory toy', 'teether', 'activity toy'],
    'weaning & high chairs': ['high chair', 'weaning', 'baby food', 'first foods', 'booster seat'],
    'baby car seats (group 0, 0+)': ['baby car seat', 'infant car seat', 'group 0 seat'],
  },
  pets: {
    _base: ['pet', 'pet supplies', 'pet care', 'animal', 'uk pets'],
    'dog dry food': ['dog food', 'dry dog food', 'kibble', 'grain free dog food'],
    'dog leads & harnesses': ['dog lead', 'dog harness', 'no pull harness', 'dog walking'],
    'dog beds & crates': ['dog bed', 'dog crate', 'pet bed', 'washable dog bed'],
    'dog toys': ['dog toy', 'chew toy', 'rope toy', 'interactive dog toy', 'squeaky toy'],
    'dog grooming (brushes, shampoo, clippers)': ['dog grooming', 'dog brush', 'dog shampoo', 'dog clippers'],
    'cat dry food': ['cat food', 'dry cat food', 'cat kibble', 'indoor cat food'],
    'cat litter & litter trays': ['cat litter', 'clumping litter', 'litter tray', 'silica gel litter'],
    'cat trees': ['cat tree', 'cat scratching post', 'cat furniture', 'cat tower'],
    'cat toys': ['cat toy', 'cat wand', 'interactive cat toy', 'catnip toy'],
    'flea & tick treatment': ['flea treatment', 'tick treatment', 'flea collar', 'pet health'],
    'bird food & seed': ['bird food', 'wild bird seed', 'sunflower seeds', 'fat balls'],
  },
  arts: {
    _base: ['art', 'craft', 'creative', 'art supplies', 'handmade', 'diy'],
    'acrylic paints & sets': ['acrylic paint', 'painting set', 'artist paint', 'canvas painting'],
    'oil paints & sets': ['oil paint', 'oil painting', 'artist oil', 'fine art'],
    'watercolour paints': ['watercolour', 'watercolor', 'water colour painting', 'watercolour set'],
    'canvas (stretched & boards)': ['canvas', 'stretched canvas', 'canvas board', 'artist canvas'],
    'pencils, charcoal & pastels': ['pencil', 'charcoal', 'pastel', 'drawing pencil', 'sketching'],
    'markers & brush pens': ['markers', 'brush pens', 'alcohol markers', 'art pens'],
    'yarn & wool (knitting & crochet)': ['yarn', 'wool', 'knitting yarn', 'crochet yarn', 'chunky wool'],
    'sewing machines': ['sewing machine', 'dressmaking', 'quilting', 'beginner sewing machine'],
    'embroidery & cross stitch kits': ['embroidery kit', 'cross stitch', 'needlework', 'embroidery hoop'],
    'acoustic guitars': ['guitar', 'acoustic guitar', 'beginner guitar', 'classical guitar'],
    'electric guitars & basses': ['electric guitar', 'bass guitar', 'guitar', 'rock guitar'],
    'piano & digital keyboards': ['keyboard', 'digital piano', 'piano', 'synthesizer'],
    'candle making (wax, wicks, moulds)': ['candle making', 'soy wax', 'candle supplies', 'diy candle'],
    'jewellery making (beads, wire, clasps)': ['jewellery making', 'beading', 'craft beads', 'diy jewellery'],
    'clay & air-dry clay': ['clay', 'air dry clay', 'polymer clay', 'sculpting clay'],
    'resin art supplies': ['resin art', 'epoxy resin', 'resin mould', 'uv resin', 'resin craft'],
  },
  office: {
    _base: ['office', 'stationery', 'desk', 'workspace', 'school supplies', 'work from home'],
    'notebooks (hardback)': ['notebook', 'hardback notebook', 'journal', 'a5 notebook'],
    'notebooks (softback & spiral)': ['notebook', 'spiral notebook', 'notepad', 'a4 notebook'],
    'planners & diaries': ['planner', 'diary', '2026 planner', 'organiser', 'weekly planner'],
    'ballpoint & rollerball pens': ['pen', 'ballpoint pen', 'rollerball pen', 'writing pen'],
    'highlighters & markers': ['highlighter', 'marker pen', 'fluorescent highlighter'],
    'sticky notes & memo pads': ['sticky notes', 'post it notes', 'memo pad', 'desk notes'],
    'office chairs (ergonomic)': ['ergonomic chair', 'office chair', 'desk chair', 'lumbar support'],
    'standing desks': ['standing desk', 'sit stand desk', 'adjustable desk', 'height adjustable'],
    'desk lamps': ['desk lamp', 'led desk lamp', 'study lamp', 'eye care lamp'],
    'printers': ['printer', 'inkjet printer', 'laser printer', 'wireless printer'],
    'whiteboards & cork boards': ['whiteboard', 'dry erase board', 'corkboard', 'notice board'],
    'monitor stands & laptop risers': ['monitor stand', 'laptop stand', 'laptop riser', 'ergonomic stand'],
  },
  antiques: {
    _base: ['antique', 'vintage', 'collectible', 'rare', 'retro', 'period piece', 'uk antiques'],
    'antique furniture (victorian, georgian, edwardian)': ['antique furniture', 'victorian furniture', 'georgian', 'edwardian'],
    'original oil paintings & watercolours': ['original painting', 'oil painting', 'original artwork', 'fine art'],
    'vintage clothing & accessories (pre-1990)': ['vintage clothing', 'retro fashion', 'vintage style', 'vintage dress'],
    'vintage watches': ['vintage watch', 'mechanical watch', 'antique watch', 'collectors watch'],
    'ceramics & pottery (china, porcelain, stoneware)': ['ceramics', 'pottery', 'porcelain', 'china'],
    'coins & banknotes (uk)': ['coin', 'uk coin', 'numismatics', 'old coins', 'collectors coin'],
    'vintage jewellery': ['vintage jewellery', 'antique jewellery', 'art deco jewellery'],
    'sports memorabilia (signed shirts, programmes)': ['sports memorabilia', 'signed shirt', 'football memorabilia'],
    'first edition & antiquarian books': ['first edition', 'rare book', 'antiquarian book', 'collectors book'],
    'military memorabilia & medals': ['military memorabilia', 'medal', 'ww2 memorabilia', 'military badge'],
  },
  travel: {
    _base: ['travel', 'luggage', 'holiday', 'travel accessories', 'trip', 'travel gift'],
    'hard shell suitcases (cabin)': ['cabin suitcase', 'carry on luggage', 'hand luggage', 'cabin bag'],
    'hard shell suitcases (medium / large)': ['suitcase', 'large suitcase', 'hold luggage', '4 wheel suitcase'],
    'soft shell suitcases': ['soft suitcase', 'lightweight suitcase', 'fabric suitcase'],
    'travel pillows (neck & inflatable)': ['travel pillow', 'neck pillow', 'inflatable pillow', 'flight pillow'],
    'travel adapters & multi-plugs': ['travel adapter', 'universal adapter', 'world plug', 'usb travel adapter'],
    'travel wallets & passport holders': ['passport holder', 'travel wallet', 'rfid blocking', 'travel organiser'],
    'backpacks (travel & hiking)': ['travel backpack', 'hiking rucksack', 'backpack', 'carry on backpack'],
    'toiletry bags & wash bags': ['wash bag', 'toiletry bag', 'travel toiletry bag', 'waterproof wash bag'],
    'luggage locks, straps & tags': ['luggage lock', 'tsa lock', 'luggage strap', 'luggage tag'],
  },
  software: {
    _base: ['software', 'digital download', 'activation key', 'license key', 'instant delivery'],
    'antivirus & internet security': ['antivirus', 'internet security', 'cybersecurity', 'malware protection'],
    'vpn software': ['vpn', 'virtual private network', 'privacy software', 'anonymous browsing'],
    'design & creative (adobe, affinity etc.)': ['design software', 'photo editing', 'creative suite'],
    'gaming (pc / digital code)': ['pc game', 'digital game', 'steam key', 'game code'],
    'amazon gift cards': ['amazon gift card', 'amazon voucher', 'gift card', 'amazon code'],
    'gaming gift cards (playstation, xbox, nintendo, steam)': ['psn gift card', 'xbox gift card', 'nintendo eshop', 'steam wallet'],
    'business & office software': ['office software', 'microsoft office', 'business tools'],
  },
  other: {
    _base: ['miscellaneous', 'general', 'unique', 'gift idea', 'variety'],
  },
};

function getSuggestedTags(catValue, subcatText) {
  const catData = TAG_SUGGESTIONS[catValue];
  if (!catData) return [];
  const base = catData._base || [];
  if (subcatText) {
    const key = subcatText.toLowerCase();
    const subTags = catData[key] || [];
    const all = [...subTags, ...base.filter(t => !subTags.includes(t))];
    return all.slice(0, 20);
  }
  return base;
}

function getCurrentTagList() {
  const input = document.getElementById('product-tags');
  if (!input || !input.value.trim()) return [];
  return input.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

function renderTagChips(catValue, subcatText) {
  const container = document.getElementById('tag-suggestions');
  const chipsEl   = document.getElementById('tag-chips');
  if (!container || !chipsEl) return;
  const tags = getSuggestedTags(catValue, subcatText);
  if (!tags.length) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  chipsEl.innerHTML = '';
  const current = getCurrentTagList();
  tags.forEach(tag => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ap-tag-chip' + (current.includes(tag.toLowerCase()) ? ' selected' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      const input = document.getElementById('product-tags');
      if (!input) return;
      let list = getCurrentTagList();
      const idx = list.indexOf(tag.toLowerCase());
      if (idx >= 0) { list.splice(idx, 1); chip.classList.remove('selected'); }
      else          { list.push(tag);       chip.classList.add('selected'); }
      input.value = list.join(', ');
    });
    chipsEl.appendChild(chip);
  });
}

function bindTagSuggestions() {
  const catSel = document.getElementById('product-category');
  const subSel = document.getElementById('product-subcategory');
  catSel?.addEventListener('change', () => {
    renderTagChips(catSel.value, '');
  });
  subSel?.addEventListener('change', () => {
    const subcatText = subSel.options[subSel.selectedIndex]?.text || '';
    renderTagChips(catSel.value, subcatText);
  });
}

// ======================================================
// IMAGE UPLOADS (Cloudinary)
// ======================================================

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`,
    { method: 'POST', body: fd }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed');
  }

  const data = await res.json();
  return data.secure_url;
}

async function handleFile(n, file) {
  if (!file.type.startsWith('image/')) {
    window.showToast?.('Please select an image file', 'error');
    return;
  }

  const zone    = document.querySelector(`.ap-upload-zone[data-slot="${n}"]`);
  const preview = document.getElementById(`preview-${n}`);
  const overlay = document.getElementById(`overlay-${n}`);

  const blobUrl = URL.createObjectURL(file);
  preview.src = blobUrl;
  zone.classList.add('has-image');
  overlay.style.display = 'flex';
  pendingUploads.add(n);

  try {
    const cdnUrl = await uploadToCloudinary(file);
    uploadedUrls[n] = cdnUrl;
    preview.src = cdnUrl;
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    clearSlot(n);
    window.showToast?.('Image upload failed — try again', 'error');
  } finally {
    pendingUploads.delete(n);
    if (overlay) overlay.style.display = 'none';
  }
}

function clearSlot(n) {
  const zone    = document.querySelector(`.ap-upload-zone[data-slot="${n}"]`);
  const preview = document.getElementById(`preview-${n}`);
  const overlay = document.getElementById(`overlay-${n}`);
  const input   = document.getElementById(`img-input-${n}`);
  if (zone)    zone.classList.remove('has-image');
  if (preview) preview.src = '';
  if (overlay) overlay.style.display = 'none';
  if (input)   input.value = '';
  uploadedUrls[n] = null;
}

function preloadSlot(n, url) {
  if (!url) return;
  const zone    = document.querySelector(`.ap-upload-zone[data-slot="${n}"]`);
  const preview = document.getElementById(`preview-${n}`);
  if (!zone || !preview) return;
  uploadedUrls[n] = url;
  preview.src = url;
  zone.classList.add('has-image');
}

function bindSlot(n) {
  const zone      = document.querySelector(`.ap-upload-zone[data-slot="${n}"]`);
  const input     = document.getElementById(`img-input-${n}`);
  const removeBtn = document.querySelector(`.ap-remove-btn[data-slot="${n}"]`);
  if (!zone || !input) return;

  zone.addEventListener('click', (e) => {
    if (e.target.closest('.ap-remove-btn')) return;
    if (uploadedUrls[n] || pendingUploads.has(n)) return;
    input.click();
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(n, file);
  });

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(n, file);
    input.value = '';
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSlot(n);
    });
  }

  // Paste URL input
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'Or paste image URL…';
  urlInput.className = 'ap-url-input';
  zone.parentNode.appendChild(urlInput);

  urlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      const url = urlInput.value.trim();
      if (url.startsWith('http')) {
        preloadSlot(n, url);
        urlInput.value = '';
      }
    }, 0);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = urlInput.value.trim();
      if (url.startsWith('http')) {
        preloadSlot(n, url);
        urlInput.value = '';
      }
    }
  });
}

// ======================================================
// VIDEO UPLOADS (Cloudinary)
// ======================================================

async function uploadVideoToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLD_CLOUD}/video/upload`,
    { method: 'POST', body: fd }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed');
  }
  const data = await res.json();
  return data.secure_url;
}

async function handleVideoFile(n, file) {
  const urlId   = n === 1 ? 'product-video-url' : 'product-video-url2';
  const zone    = document.querySelector(`.ap-video-zone[data-video="${n}"]`);
  const preview = document.getElementById(`video-preview-${n}`);
  const overlay = document.getElementById(`video-overlay-${n}`);
  const urlInput = document.getElementById(urlId);
  if (!zone) return;

  const blobUrl = URL.createObjectURL(file);
  if (preview) preview.src = blobUrl;
  zone.classList.add('has-video');
  if (overlay) overlay.style.display = 'flex';

  try {
    const cdnUrl = await uploadVideoToCloudinary(file);
    if (urlInput) urlInput.value = cdnUrl;
    if (preview) { URL.revokeObjectURL(blobUrl); preview.src = cdnUrl; }
  } catch (err) {
    console.error('Video upload error:', err);
    clearVideoSlot(n);
    window.showToast?.('Video upload failed — try again', 'error');
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

function clearVideoSlot(n) {
  const urlId   = n === 1 ? 'product-video-url' : 'product-video-url2';
  const zone    = document.querySelector(`.ap-video-zone[data-video="${n}"]`);
  const preview = document.getElementById(`video-preview-${n}`);
  const urlInput = document.getElementById(urlId);
  if (zone)    zone.classList.remove('has-video');
  if (preview) preview.src = '';
  if (urlInput) urlInput.value = '';
}

function preloadVideoSlot(n, url) {
  if (!url) return;
  if (!/\.(mp4|webm|ogv|mov)(\?.*)?$/i.test(url) && !url.includes('cloudinary.com')) return;
  const zone    = document.querySelector(`.ap-video-zone[data-video="${n}"]`);
  const preview = document.getElementById(`video-preview-${n}`);
  if (!zone || !preview) return;
  preview.src = url;
  zone.classList.add('has-video');
}

function bindVideoSlots() {
  [1, 2].forEach((n) => {
    const zone      = document.querySelector(`.ap-video-zone[data-video="${n}"]`);
    const fileInput = document.getElementById(`video-file-${n}`);
    const removeBtn = zone?.querySelector('.ap-remove-btn');
    if (!zone || !fileInput) return;

    zone.addEventListener('click', (e) => {
      if (e.target.closest('.ap-remove-btn')) return;
      if (zone.classList.contains('has-video')) return;
      fileInput.click();
    });

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) handleVideoFile(n, file);
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleVideoFile(n, file);
      fileInput.value = '';
    });

    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearVideoSlot(n);
    });
  });
}

function bindImageUploads() {
  Array.from({ length: 20 }, (_, i) => i + 1).forEach(bindSlot);

  const showMoreBtn = document.getElementById('ap-show-more');
  const extraSlots  = document.getElementById('ap-extra-slots');
  if (showMoreBtn && extraSlots) {
    showMoreBtn.addEventListener('click', () => {
      const open = extraSlots.classList.toggle('open');
      showMoreBtn.textContent = open ? '− Hide extra photo slots' : '+ Show more photo slots';
    });
  }

  const multiInput   = document.getElementById('ap-multi-input');
  const selectAllBtn = document.getElementById('ap-select-all-btn');
  if (multiInput && selectAllBtn) {
    selectAllBtn.addEventListener('click', () => multiInput.click());
    multiInput.addEventListener('change', () => {
      const files = Array.from(multiInput.files);
      const emptySlots = Array.from({ length: 20 }, (_, i) => i + 1)
        .filter(n => !uploadedUrls[n] && !pendingUploads.has(n));
      const toFill = files.slice(0, emptySlots.length);
      if (toFill.some((_, i) => emptySlots[i] > 5) && extraSlots) {
        extraSlots.classList.add('open');
        if (showMoreBtn) showMoreBtn.textContent = '− Hide extra photo slots';
      }
      toFill.forEach((file, i) => handleFile(emptySlots[i], file));
      multiInput.value = '';
    });
  }
}

// ======================================================
// VARIANT BUILDER
// ======================================================

let _variantRowId = 0;
let _variantGlobalMode = 'color';

function syncVariantHeaders() {
  const n1 = document.getElementById('attr-name-1')?.value.trim() || 'Attribute 1';
  const n2 = document.getElementById('attr-name-2')?.value.trim() || '';
  const th1 = document.getElementById('vb-th-1');
  const th2 = document.getElementById('vb-th-2');
  if (th1) th1.textContent = n1;
  if (th2) {
    th2.textContent = n2 || 'Attribute 2';
    th2.classList.toggle('vb-th-hidden', !n2);
    document.querySelectorAll('.vb-attr2-cell').forEach((cell) => {
      cell.classList.toggle('vb-th-hidden', !n2);
    });
  }
}

function setRowMode(tr, mode) {
  tr.dataset.mode = mode;
  tr.querySelectorAll('.vr-mode-btn').forEach(b => {
    const active = b.dataset.pick === mode;
    b.classList.toggle('vr-mode-active', active);
    b.style.background  = active ? (mode === 'image' ? '#6366f1' : '#14b8a6') : '';
    b.style.color       = active ? '#fff' : '';
    b.style.borderColor = active ? (mode === 'image' ? '#6366f1' : '#14b8a6') : '';
  });
}

function addVariantRow(data) {
  data = data || {};
  const tbody = document.getElementById('variant-rows');
  if (!tbody) return;
  const id = ++_variantRowId;
  const n2 = document.getElementById('attr-name-2')?.value.trim();
  const color = data.color || '#ffffff';
  const imgSrc = data.image || '';
  const rowMode = data.displayMode || _variantGlobalMode;
  const tr = document.createElement('tr');
  tr.dataset.rowId = id;
  tr.innerHTML = `
    <td><input type="text" class="vb-input" name="vr-attr1" value="${data.attr1 || ''}" placeholder="e.g. Black" /></td>
    <td class="vb-attr2-cell${n2 ? '' : ' vb-th-hidden'}"><input type="text" class="vb-input" name="vr-attr2" value="${data.attr2 || ''}" placeholder="e.g. Large" /></td>
    <td class="vb-color-cell">
      <input type="color" class="vb-color-pick" name="vr-color" value="${color}" data-user-set="${data.color ? 'true' : 'false'}" title="Pick swatch colour" />
      <span class="vr-mode-sel"><button type="button" class="vr-mode-btn" data-pick="color" title="Show as colour swatch on product page">Clr</button><button type="button" class="vr-mode-btn" data-pick="image" title="Show as image thumbnail on product page">Img</button></span>
    </td>
    <td class="ao-img-cell">
      <div class="ao-img-wrap">
        <div class="vr-thumb-wrap${imgSrc ? ' has-img' : ''}">
          <img class="vr-img-preview" src="${imgSrc}" alt="" />
          <div class="vr-thumb-overlay">
            <button type="button" class="vr-img-clear">CLR</button>
          </div>
        </div>
        <input type="text" class="vb-input ao-img-url vr-img-url" name="vr-image" value="${imgSrc}" placeholder="Paste image URL…" />
      </div>
    </td>
    <td><input type="number" class="vb-input vb-input-sm" name="vr-price" step="0.01" min="0" value="${data.price != null ? data.price : ''}" placeholder="0.00" /></td>
    <td><input type="number" class="vb-input vb-input-sm" name="vr-stock" min="0" value="${data.stock != null ? data.stock : ''}" placeholder="0" /></td>
    <td><input type="text" class="vb-input" name="vr-sku" value="${data.sku || ''}" placeholder="SKU-001" /></td>
    <td><button type="button" class="vb-remove-btn" data-row="${id}">✕</button></td>
  `;
  tbody.appendChild(tr);
  setRowMode(tr, rowMode);

  // Auto-sample dominant colour from image when no colour is stored yet
  if (imgSrc && !data.color) {
    sampleDominantColor(imgSrc, (hex) => {
      const picker = tr.querySelector('[name="vr-color"]');
      if (picker) { picker.value = hex; picker.dataset.userSet = 'true'; }
    });
  }
}

function getVariants() {
  if (!document.getElementById('has-variants')?.checked) return [];
  const attr1Name = document.getElementById('attr-name-1')?.value.trim() || 'Option 1';
  const attr2Name = document.getElementById('attr-name-2')?.value.trim() || '';
  const variants = [];
  document.querySelectorAll('#variant-rows tr').forEach((tr, idx) => {
    const a1Raw = tr.querySelector('[name="vr-attr1"]')?.value.trim();
    const imgVal = tr.querySelector('[name="vr-image"]')?.value.trim() || '';
    // Skip rows that have neither a name nor an image (truly blank rows)
    if (!a1Raw && !imgVal) return;
    const a1 = a1Raw || `Variant ${idx + 1}`;
    const a2 = tr.querySelector('[name="vr-attr2"]')?.value.trim();
    const priceRaw = parseFloat(tr.querySelector('[name="vr-price"]')?.value);
    const stockRaw = parseInt(tr.querySelector('[name="vr-stock"]')?.value, 10);
    const sku = tr.querySelector('[name="vr-sku"]')?.value.trim();
    const color = tr.querySelector('[name="vr-color"]')?.value || '';
    const image = tr.querySelector('[name="vr-image"]')?.value.trim() || '';
    const displayMode = tr.dataset.mode || 'color';
    const attributes = { [attr1Name]: a1 };
    if (attr2Name && a2) attributes[attr2Name] = a2;
    variants.push({
      attributes,
      price: isNaN(priceRaw) ? undefined : priceRaw,
      stock: isNaN(stockRaw) ? 0 : stockRaw,
      sku: sku || undefined,
      color: tr.querySelector('[name="vr-color"]')?.dataset.userSet === 'true' ? color : '',
      image,
      displayMode,
    });
  });
  return variants;
}

function loadVariants(variants) {
  if (!variants || !variants.length) return;
  const keys = Object.keys(variants[0].attributes || {});
  if (keys[0]) {
    const el = document.getElementById('attr-name-1');
    if (el) el.value = keys[0];
  }
  if (keys[1]) {
    const el = document.getElementById('attr-name-2');
    if (el) el.value = keys[1];
  }
  const toggle = document.getElementById('has-variants');
  const builder = document.getElementById('variant-builder');
  if (toggle) toggle.checked = true;
  if (builder) builder.style.display = '';
  syncVariantHeaders();
  variants.forEach((v) => {
    const attrs = v.attributes || {};
    const vKeys = Object.keys(attrs);
    addVariantRow({
      attr1: attrs[vKeys[0]] || '',
      attr2: vKeys[1] ? (attrs[vKeys[1]] || '') : '',
      price: v.price,
      stock: v.stock,
      sku: v.sku,
      color: v.color || '',
      image: v.image || '',
      displayMode: v.displayMode || 'color',
    });
  });
}

function sampleDominantColor(src, onColor) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  // Append cache-bust so the browser makes a fresh CORS request instead of
  // reusing a cached non-CORS response (which would taint the canvas).
  img.src = src + (src.includes('?') ? '&' : '?') + '_s4l=1';
  img.onload = () => {
    try {
      const SIZE = 80;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

      // Bucket pixels by 4-bit quantised RGB (16×16×16 = 4 096 buckets).
      // Each bucket stores [rSum, gSum, bSum, count] so we can average
      // within the winning bucket for accuracy.
      const buckets = new Map();

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;           // skip transparent
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Skip near-white backgrounds (lum > 235) and near-black shadows (lum < 20)
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        if (lum > 235 || lum < 20) continue;

        // Quantise: keep top 4 bits of each channel
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const e = buckets.get(key);
        if (e) { e[0] += r; e[1] += g; e[2] += b; e[3]++; }
        else    { buckets.set(key, [r, g, b, 1]); }
      }

      if (!buckets.size) return;

      // Find the bucket with the most pixels — that is the dominant colour by area
      let best = 0, winner = null;
      for (const e of buckets.values()) {
        if (e[3] > best) { best = e[3]; winner = e; }
      }

      // Average within the winning bucket gives the true representative colour
      const r = Math.round(winner[0] / winner[3]);
      const g = Math.round(winner[1] / winner[3]);
      const b = Math.round(winner[2] / winner[3]);

      const hex = (v) => v.toString(16).padStart(2, '0');
      onColor(`#${hex(r)}${hex(g)}${hex(b)}`);
    } catch { /* CORS blocked — leave picker as-is */ }
  };
}

function bindVariants() {
  const toggle = document.getElementById('has-variants');
  const builder = document.getElementById('variant-builder');
  if (!toggle || !builder) return;

  toggle.addEventListener('change', () => {
    builder.style.display = toggle.checked ? '' : 'none';
    if (toggle.checked && !document.querySelector('#variant-rows tr')) {
      addVariantRow();
    }
  });

  document.getElementById('btn-add-variant')?.addEventListener('click', () => addVariantRow());

  /* ── Bulk variant image upload ─────────────────────── */
  const vbMultiInput  = document.getElementById('vb-multi-img-input');
  const btnVariantImgs = document.getElementById('btn-variant-imgs');

  btnVariantImgs?.addEventListener('click', () => vbMultiInput?.click());

  function nameFromFilename(file) {
    return file.name
      .replace(/\.[^.]+$/, '')          // remove extension
      .replace(/[-_\.]+/g, ' ')         // hyphens/underscores → spaces
      .replace(/\s+/g, ' ').trim()      // collapse spaces
      .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
  }

  vbMultiInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Ensure variants section is visible without auto-adding a blank row
    const hasVariantsChk = document.getElementById('has-variants');
    if (hasVariantsChk && !hasVariantsChk.checked) {
      hasVariantsChk.checked = true;
      const builder = document.getElementById('variant-builder');
      if (builder) builder.style.display = '';
    }

    // ── Pass 1: create/fill rows with names from filenames ──
    for (let i = 0; i < files.length; i++) {
      const name = nameFromFilename(files[i]);
      const rows = Array.from(document.querySelectorAll('#variant-rows tr'));
      if (i >= rows.length) {
        // Create row with name pre-filled
        addVariantRow({ attr1: name });
      } else {
        // Fill existing row's name only if blank
        const ni = rows[i].querySelector('[name="vr-attr1"]');
        if (ni && !ni.value.trim()) ni.value = name;
      }
    }

    // ── Pass 2: upload images ───────────────────────────────
    const count = files.length;
    btnVariantImgs.disabled = true;
    btnVariantImgs.textContent = `Uploading 0 / ${count}…`;

    let uploaded = 0;
    for (let i = 0; i < count; i++) {
      const file = files[i];
      const rows = Array.from(document.querySelectorAll('#variant-rows tr'));
      const row  = rows[i];
      if (!row) continue;

      const imgInput   = row.querySelector('[name="vr-image"]');
      const imgPreview = row.querySelector('.vr-img-preview');
      if (!imgInput) continue;

      const blobUrl = URL.createObjectURL(file);
      if (imgPreview) { imgPreview.src = blobUrl; imgPreview.style.display = ''; }

      btnVariantImgs.textContent = `Uploading ${i + 1} / ${count}…`;

      try {
        const cdnUrl = await uploadToCloudinary(file);
        imgInput.value = cdnUrl;
        if (imgPreview) { imgPreview.src = cdnUrl; URL.revokeObjectURL(blobUrl); }
        uploaded++;
      } catch (err) {
        console.error('Variant image upload error:', err);
        window.showToast?.(`Image ${i + 1} failed — try again`, 'error');
        if (imgPreview) { imgPreview.src = ''; imgPreview.style.display = 'none'; }
      }
    }

    btnVariantImgs.disabled = false;
    btnVariantImgs.textContent = '📁 Bulk upload images';
    vbMultiInput.value = '';
    if (uploaded) window.showToast?.(`${uploaded} variant image${uploaded > 1 ? 's' : ''} uploaded ✓`);
  });

  document.getElementById('attr-name-1')?.addEventListener('input', syncVariantHeaders);
  document.getElementById('attr-name-2')?.addEventListener('input', syncVariantHeaders);

  const variantRows = document.getElementById('variant-rows');
  variantRows?.addEventListener('click', (e) => {
    if (e.target.classList.contains('vr-mode-btn')) {
      const tr = e.target.closest('tr');
      setRowMode(tr, e.target.dataset.pick);
      if (e.target.dataset.pick === 'color') {
        const picker = tr.querySelector('[name="vr-color"]');
        const imgUrl = tr.querySelector('[name="vr-image"]')?.value.trim();
        if (picker && picker.dataset.userSet !== 'true' && imgUrl) {
          sampleDominantColor(imgUrl, (hex) => {
            picker.value = hex;
            picker.dataset.userSet = 'true';
          });
        }
      }
    }
    if (e.target.classList.contains('vb-remove-btn')) {
      e.target.closest('tr').remove();
    }
    // Clear just the thumbnail — confirm before wiping
    if (e.target.classList.contains('vr-img-clear')) {
      const td   = e.target.closest('td');
      const wrap = td.querySelector('.vr-thumb-wrap');
      const img  = td.querySelector('.vr-img-preview');
      const url  = td.querySelector('[name="vr-image"]');
      const doIt = async () => {
        const ok = await showConfirm('Clear this variant image? The colour swatch will remain.');
        if (!ok) return;
        if (img)  img.src = '';
        if (url)  url.value = '';
        if (wrap) wrap.classList.remove('has-img');
      };
      doIt();
    }
  });
  // Bulk variant image upload
  const vrBulkBtn   = document.getElementById('vr-bulk-img-btn');
  const vrBulkInput = document.getElementById('vr-bulk-img-input');
  if (vrBulkBtn && vrBulkInput) {
    vrBulkBtn.addEventListener('click', () => vrBulkInput.click());
    vrBulkInput.addEventListener('change', async () => {
      const files = Array.from(vrBulkInput.files);
      if (!files.length) return;
      vrBulkBtn.disabled = true;
      vrBulkBtn.textContent = 'Uploading…';
      const tbody = document.getElementById('variant-rows');
      for (const file of files) {
        try {
          const url = await uploadToCloudinary(file);
          const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
          let targetRow = rows.find(r => !r.querySelector('[name="vr-image"]')?.value.trim());
          if (!targetRow) { addVariantRow({}); targetRow = tbody?.querySelector('tr:last-child'); }
          if (!targetRow) continue;
          const urlInput = targetRow.querySelector('[name="vr-image"]');
          const img      = targetRow.querySelector('.vr-img-preview');
          const wrap     = targetRow.querySelector('.vr-thumb-wrap');
          if (urlInput) urlInput.value = url;
          if (img)      img.src = url;
          if (wrap)     wrap.classList.add('has-img');
          sampleDominantColor(url, (hex) => {
            const picker = targetRow.querySelector('[name="vr-color"]');
            if (picker && picker.dataset.userSet !== 'true') {
              picker.value = hex; picker.dataset.userSet = 'true';
            }
          });
        } catch {
          window.showToast?.('One image failed — skipped', 'error');
        }
      }
      vrBulkInput.value = '';
      vrBulkBtn.disabled = false;
      vrBulkBtn.textContent = '📷 Bulk upload images';
    });
  }

  variantRows?.addEventListener('input', (e) => {
    if (e.target.classList.contains('vb-color-pick')) {
      e.target.dataset.userSet = 'true';
    }
    if (e.target.classList.contains('vr-img-url')) {
      const url     = e.target.value.trim();
      const td      = e.target.closest('td');
      const preview = td.querySelector('.vr-img-preview');
      const wrap    = td.querySelector('.vr-thumb-wrap');
      if (preview) preview.src = url;
      if (wrap)    wrap.classList.toggle('has-img', !!url);
      if (url) sampleDominantColor(url, (hex) => {
        const picker = e.target.closest('tr')?.querySelector('[name="vr-color"]');
        if (picker) { picker.value = hex; picker.dataset.userSet = 'true'; }
      });
    }
  });

  // Inject "Set all: [Clr] [Img]" control above variant table — works regardless of HTML version
  const vbTable = document.querySelector('.vb-table');
  if (vbTable && !document.getElementById('vb-global-ctrl')) {
    const ctrl = document.createElement('div');
    ctrl.id = 'vb-global-ctrl';
    ctrl.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280';
    const lbl = document.createElement('span');
    lbl.textContent = 'Set all rows:';
    const btnClr = document.createElement('button');
    btnClr.type = 'button'; btnClr.id = 'vb-btn-clr';
    btnClr.textContent = 'Colour';
    btnClr.style.cssText = 'padding:3px 10px;background:#14b8a6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600';
    const btnImg = document.createElement('button');
    btnImg.type = 'button'; btnImg.id = 'vb-btn-img';
    btnImg.textContent = 'Image';
    btnImg.style.cssText = 'padding:3px 10px;background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600';
    function setGlobalMode(mode) {
      _variantGlobalMode = mode;
      btnClr.style.cssText = mode === 'color'
        ? 'padding:3px 10px;background:#14b8a6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600'
        : 'padding:3px 10px;background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600';
      btnImg.style.cssText = mode === 'image'
        ? 'padding:3px 10px;background:#6366f1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600'
        : 'padding:3px 10px;background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600';
      document.querySelectorAll('#variant-rows tr').forEach(tr => setRowMode(tr, mode));
    }
    btnClr.addEventListener('click', () => setGlobalMode('color'));
    btnImg.addEventListener('click', () => setGlobalMode('image'));
    ctrl.appendChild(lbl); ctrl.appendChild(btnClr); ctrl.appendChild(btnImg);
    vbTable.parentNode.insertBefore(ctrl, vbTable);
  }
  // Also wire existing checkbox if HTML was uploaded
  const colorModeEl = document.getElementById('vb-color-mode');
  if (colorModeEl) colorModeEl.addEventListener('change', () => {
    document.getElementById(colorModeEl.checked ? 'vb-btn-clr' : 'vb-btn-img')?.click();
  });
}

// ======================================================
// ADD-ONS BUILDER
// ======================================================

let _addonRowId = 0;

function addAddonRow(data) {
  data = data || {};
  const tbody = document.getElementById('addon-rows');
  if (!tbody) return;
  const id = ++_addonRowId;
  const tr = document.createElement('tr');
  tr.dataset.rowId = id;
  const imgSrc = data.image || '';
  tr.innerHTML = `
    <td class="ao-img-cell">
      <div class="ao-img-wrap">
        <img class="ao-img-preview" src="${imgSrc}" alt="" style="${imgSrc ? '' : 'display:none'}" />
        <input type="text" class="vb-input ao-img-url" name="ao-image" value="${imgSrc}" placeholder="Paste image URL…" />
      </div>
    </td>
    <td><input type="text" class="vb-input" name="ao-name" value="${data.name || ''}" placeholder="e.g. Battery pack" /></td>
    <td><input type="number" class="vb-input vb-input-sm" name="ao-price" step="0.01" min="0" value="${data.price != null ? data.price : ''}" placeholder="0.00" /></td>
    <td><input type="text" class="vb-input" name="ao-desc" value="${data.description || ''}" placeholder="Short description (optional)" /></td>
    <td><button type="button" class="vb-remove-btn" data-row="${id}">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function getAddOns() {
  if (!document.getElementById('has-addons')?.checked) return [];
  const addOns = [];
  document.querySelectorAll('#addon-rows tr').forEach((tr) => {
    const name = tr.querySelector('[name="ao-name"]')?.value.trim();
    if (!name) return;
    const price = parseFloat(tr.querySelector('[name="ao-price"]')?.value);
    const description = tr.querySelector('[name="ao-desc"]')?.value.trim();
    const image = tr.querySelector('[name="ao-image"]')?.value.trim();
    addOns.push({
      name,
      price: isNaN(price) ? 0 : price,
      description: description || '',
      image: image || '',
    });
  });
  return addOns;
}

function loadAddOns(addOns) {
  if (!addOns || !addOns.length) return;
  const toggle = document.getElementById('has-addons');
  const builder = document.getElementById('addon-builder');
  if (toggle) toggle.checked = true;
  if (builder) builder.style.display = '';
  addOns.forEach((ao) => addAddonRow(ao));
}

function bindAddOns() {
  const toggle = document.getElementById('has-addons');
  const builder = document.getElementById('addon-builder');
  if (!toggle || !builder) return;

  toggle.addEventListener('change', () => {
    builder.style.display = toggle.checked ? '' : 'none';
    if (toggle.checked && !document.querySelector('#addon-rows tr')) {
      addAddonRow();
    }
  });

  document.getElementById('btn-add-addon')?.addEventListener('click', () => addAddonRow());

  const tbody = document.getElementById('addon-rows');
  tbody?.addEventListener('click', (e) => {
    if (e.target.classList.contains('vb-remove-btn')) {
      e.target.closest('tr').remove();
    }
  });
  tbody?.addEventListener('input', (e) => {
    if (e.target.classList.contains('ao-img-url')) {
      const url = e.target.value.trim();
      const preview = e.target.closest('td').querySelector('.ao-img-preview');
      if (preview) { preview.src = url; preview.style.display = url ? '' : 'none'; }
    }
  });
}

// ======================================================
// SUBCATEGORY LOGIC
// ======================================================

function populateSubcategories(catValue, savedSubcat) {
  subcategorySelect.innerHTML = '<option value="">Select subcategory</option>';

  if (!catValue || !subcategoriesMap[catValue]) {
    subcategorySelect.disabled = true;
    return;
  }

  subcategorySelect.disabled = false;
  subcategoriesMap[catValue].forEach((sub) => {
    const opt = document.createElement('option');
    opt.value = sub.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    opt.textContent = sub;
    subcategorySelect.appendChild(opt);
  });

  if (savedSubcat) subcategorySelect.value = savedSubcat;
}

function bindSubcategory() {
  categorySelect.addEventListener('change', () => {
    populateSubcategories(categorySelect.value, null);
  });
}

// ======================================================
// STATUS RADIO VISUAL
// ======================================================

function bindStatusRadio() {
  document.querySelectorAll('input[name="productStatus"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.ap-status-opt').forEach((el) => el.classList.remove('selected'));
      radio.closest('.ap-status-opt').classList.add('selected');
    });
  });
}

// ======================================================
// SEO COLLAPSIBLE
// ======================================================

function bindSeoToggle() {
  const toggle = document.getElementById('seo-toggle');
  const body   = document.getElementById('seo-body');
  const icon   = document.getElementById('seo-icon');
  if (!toggle || !body) return;

  toggle.addEventListener('click', () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    icon.textContent = open ? '▸' : '▾';
    toggle.style.paddingBottom = open ? '0' : '10px';
    toggle.style.borderBottom  = open ? 'none' : '1px solid #f3f4f6';
    toggle.style.marginBottom  = open ? '0' : '16px';
  });
}

// ======================================================
// HELPERS
// ======================================================

function numOrNull(id) {
  const v = parseFloat(document.getElementById(id)?.value);
  return isNaN(v) || v === 0 ? undefined : v;
}

function val(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function setVal(id, v) {
  const el = document.getElementById(id);
  if (el && v !== undefined && v !== null) el.value = v;
}

// ======================================================
// LOAD PRODUCT
// ======================================================

async function loadProduct() {
  const loading = document.getElementById('ep-loading');

  try {
    const res = await fetch(`${window.API_BASE}/vendor/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (loading) loading.innerHTML = '<p style="color:#dc2626">Product not found. <a href="/account/vendor/products.html">Go back</a></p>';
      return;
    }

    const p = await res.json();

    // Page title
    const titleEl = document.getElementById('page-title');
    if (titleEl && p.name) titleEl.textContent = `Edit: ${p.name}`;
    const stickyTitleEl = document.getElementById('ep-sticky-title');
    if (stickyTitleEl && p.name) stickyTitleEl.textContent = p.name;

    // Basic info
    setVal('product-name', p.name);
    setVal('product-short-desc', p.shortDescription);
    setVal('product-bullet-points', p.bulletPoints);
    setVal('product-description', p.description);

    // Pricing
    if (p.price !== undefined)        setVal('product-price', p.price);
    if (p.comparePrice !== undefined)  setVal('product-compare-price', p.comparePrice);
    if (p.costPrice !== undefined)     setVal('product-cost-price', p.costPrice);
    if (p.shippingCost !== undefined)  setVal('product-shipping-cost', p.shippingCost);

    // Images — pre-populate slots with existing URLs
    (p.images || []).slice(0, 20).forEach((url, i) => preloadSlot(i + 1, url));

    // Auto-expand extra slots if product already has images in slots 6–10
    if ((p.images || []).length > 5) {
      const extraSlots  = document.getElementById('ap-extra-slots');
      const showMoreBtn = document.getElementById('ap-show-more');
      if (extraSlots) extraSlots.classList.add('open');
      if (showMoreBtn) showMoreBtn.textContent = '− Hide extra photo slots';
    }

    // Category + subcategory
    if (p.category) {
      categorySelect.value = p.category;
      populateSubcategories(p.category, p.subcategory);
      const subcatText = subcategorySelect?.options[subcategorySelect?.selectedIndex]?.text || '';
      renderTagChips(p.category, subcatText);
    }

    // Tags
    if (p.tags?.length) setVal('product-tags', p.tags.join(', '));

    // Inventory
    if (p.stock !== undefined) setVal('product-stock', p.stock);
    setVal('product-sku', p.sku);
    if (p.trackInventory !== undefined) document.getElementById('track-inventory').checked = p.trackInventory;
    if (p.allowBackorder !== undefined) document.getElementById('allow-backorder').checked  = p.allowBackorder;

    // Shipping
    if (p.weight)                setVal('product-weight', p.weight);
    if (p.dimensions?.width)     setVal('product-width',  p.dimensions.width);
    if (p.dimensions?.height)    setVal('product-height', p.dimensions.height);
    if (p.dimensions?.length)    setVal('product-length', p.dimensions.length);

    // Refurbished fields
    if (p.conditionGrade)     { const el = document.getElementById('refurb-condition-grade'); if (el) el.value = p.conditionGrade; }
    if (p.testedStatus)       { const el = document.getElementById('refurb-tested-status');  if (el) el.value = p.testedStatus; }
    if (p.warrantyPeriod)     setVal('refurb-warranty', p.warrantyPeriod);
    if (p.serialNumber)       setVal('refurb-serial',   p.serialNumber);
    if (p.refurbishmentNotes) setVal('refurb-notes',    p.refurbishmentNotes);

    // SEO
    setVal('product-seo-title', p.seoTitle);
    setVal('product-seo-desc',  p.seoDescription);

    // Variant display
    const colorModeEl = document.getElementById('vb-color-mode');
    if (colorModeEl) colorModeEl.checked = p.variantDisplay !== 'image';

    // Video
    if (p.videoUrl)  { setVal('product-video-url',  p.videoUrl);  preloadVideoSlot(1, p.videoUrl);  }
    if (p.videoUrl2) { setVal('product-video-url2', p.videoUrl2); preloadVideoSlot(2, p.videoUrl2); }

    // Variants
    if (p.variants && p.variants.length) loadVariants(p.variants);

    // Add-ons
    if (p.addOns && p.addOns.length) loadAddOns(p.addOns);

    // Status
    const statusVal = p.active === false ? 'draft' : 'active';
    const radio = document.querySelector(`input[name="productStatus"][value="${statusVal}"]`);
    if (radio) {
      radio.checked = true;
      document.querySelectorAll('.ap-status-opt').forEach(el => el.classList.remove('selected'));
      radio.closest('.ap-status-opt').classList.add('selected');
    }

    // Coming Soon
    const comingSoonEl = document.getElementById('coming-soon');
    if (comingSoonEl) comingSoonEl.checked = !!p.comingSoon;

    // Show form, hide loader
    if (loading) loading.style.display = 'none';
    if (form)    form.style.display = '';

  } catch (err) {
    console.error('Could not load product:', err);
    if (loading) loading.innerHTML = '<p style="color:#dc2626">Failed to load product. <a href="/account/vendor/products.html">Go back</a></p>';
  }
}

// ======================================================
// SUBMIT
// ======================================================

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (pendingUploads.size > 0) {
      window.showToast?.('Please wait for images to finish uploading', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    const floatBtn = document.getElementById('ep-float-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    if (floatBtn) {
      floatBtn.disabled = true;
      floatBtn.classList.add('saving');
      const lbl = floatBtn.querySelector('.ep-save-label');
      if (lbl) lbl.textContent = 'Saving…';
    }

    const images = Array.from({ length: 20 }, (_, i) => i + 1).map(n => uploadedUrls[n]).filter(Boolean);

    const tagsRaw = val('product-tags');
    const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const w = numOrNull('product-width');
    const h = numOrNull('product-height');
    const l = numOrNull('product-length');
    const dimensions = (w || h || l) ? { width: w, height: h, length: l } : undefined;

    const active = document.querySelector('input[name="productStatus"]:checked')?.value !== 'draft';

    const product = {
      name:             val('product-name'),
      shortDescription: val('product-short-desc') || undefined,
      bulletPoints:     val('product-bullet-points') || undefined,
      description:      val('product-description'),
      price:            Number(document.getElementById('product-price')?.value),
      comparePrice:     numOrNull('product-compare-price'),
      costPrice:        numOrNull('product-cost-price'),
      shippingCost:     numOrNull('product-shipping-cost'),
      images,
      category:         categorySelect.value,
      subcategory:      subcategorySelect.value || undefined,
      tags,
      stock:            Number(document.getElementById('product-stock')?.value),
      sku:              val('product-sku') || undefined,
      trackInventory:   document.getElementById('track-inventory')?.checked,
      allowBackorder:   document.getElementById('allow-backorder')?.checked,
      weight:           numOrNull('product-weight'),
      dimensions,
      seoTitle:         val('product-seo-title') || undefined,
      seoDescription:   val('product-seo-desc')  || undefined,
      active,
      comingSoon:       !!(document.getElementById('coming-soon')?.checked),
      videoUrl:         val('product-video-url')  || '',
      videoUrl2:        val('product-video-url2') || '',
      variantDisplay:   document.getElementById('vb-color-mode')?.checked !== false ? 'color' : 'image',
      variants:         getVariants(),
      addOns:           getAddOns(),
      conditionGrade:     document.getElementById('refurb-condition-grade')?.value  || undefined,
      testedStatus:       document.getElementById('refurb-tested-status')?.value    || undefined,
      warrantyPeriod:     val('refurb-warranty') || undefined,
      serialNumber:       val('refurb-serial')   || undefined,
      refurbishmentNotes: val('refurb-notes')    || undefined,
    };

    if (!product.name)                                   { window.showToast?.('Product name required', 'error');  reset(btn); return; }
    if (!Number.isFinite(product.price) || product.price < 0) { window.showToast?.('Invalid price', 'error');    reset(btn); return; }
    if (!product.category)                               { window.showToast?.('Select a category', 'error');      reset(btn); return; }
    if (!product.subcategory)                            { window.showToast?.('Select a subcategory', 'error');   reset(btn); return; }

    try {
      const res = await fetch(`${window.API_BASE}/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(product),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      window.showToast?.('Product saved!');
      if (floatBtn) {
        floatBtn.classList.remove('saving');
        floatBtn.style.background = '#16a34a';
        const lbl = floatBtn.querySelector('.ep-save-label');
        if (lbl) lbl.textContent = '✓ Saved!';
      }
      setTimeout(() => { window.location.href = '/account/vendor/products.html'; }, 1200);
    } catch (err) {
      console.error('Product update error:', err);
      reset(btn);
      window.showToast?.(err.message || 'Update failed', 'error');
    }
  });
}

function reset(btn) {
  btn.disabled = false;
  btn.textContent = 'Save Changes';
  const floatBtn = document.getElementById('ep-float-save');
  if (floatBtn) {
    floatBtn.disabled = false;
    floatBtn.classList.remove('saving');
    floatBtn.style.background = '';
    const lbl = floatBtn.querySelector('.ep-save-label');
    if (lbl) lbl.textContent = '💾 Save';
  }
}

// ======================================================
// INIT
// ======================================================

function initEditProduct() {
  bindSubcategory();
  bindImageUploads();
  bindVideoSlots();
  bindTagSuggestions();
  bindStatusRadio();
  bindSeoToggle();
  bindVariants();
  bindAddOns();
  loadProduct();
}

// Script is injected dynamically — window.load may have already fired.
if (document.readyState === 'complete') {
  initEditProduct();
} else {
  window.addEventListener('load', initEditProduct, { once: true });
}
