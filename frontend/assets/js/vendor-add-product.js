// ======================================================
// ADD PRODUCT
// ======================================================

const form              = document.getElementById('add-product-form');
const categorySelect    = document.getElementById('product-category');
const subcategorySelect = document.getElementById('product-subcategory');

// ── Cloudinary config ──────────────────────────────
const CLD_CLOUD  = 'djpkj0s7w';
const CLD_PRESET = 'lhhkniqv';

// Tracks the final Cloudinary URL per slot (null = empty)
const uploadedUrls   = { 1: null, 2: null, 3: null, 4: null, 5: null };
// Tracks slots currently mid-upload
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

  // Instant local preview
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

function bindSlot(n) {
  const zone  = document.querySelector(`.ap-upload-zone[data-slot="${n}"]`);
  const input = document.getElementById(`img-input-${n}`);
  const removeBtn = document.querySelector(`.ap-remove-btn[data-slot="${n}"]`);
  if (!zone || !input) return;

  // Tap/click → open file picker (skip if clicking remove button or slot already filled)
  zone.addEventListener('click', (e) => {
    if (e.target.closest('.ap-remove-btn')) return;
    if (uploadedUrls[n] || pendingUploads.has(n)) return;
    input.click();
  });

  // Drag-and-drop
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

  // File selected from picker / camera
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(n, file);
    input.value = '';
  });

  // Remove
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSlot(n);
    });
  }
}

function bindImageUploads() {
  [1, 2, 3, 4, 5].forEach(bindSlot);
}

// ======================================================
// SUBCATEGORY LOGIC
// ======================================================

function bindSubcategory() {
  categorySelect.addEventListener('change', () => {
    const val = categorySelect.value;
    subcategorySelect.innerHTML = '<option value="">Select subcategory</option>';
    if (!val || !subcategoriesMap[val]) {
      subcategorySelect.disabled = true;
      return;
    }
    subcategorySelect.disabled = false;
    subcategoriesMap[val].forEach((sub) => {
      const opt = document.createElement('option');
      opt.value = sub.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      opt.textContent = sub;
      subcategorySelect.appendChild(opt);
    });
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
    toggle.style.borderBottom = open ? 'none' : '1px solid #f3f4f6';
    toggle.style.marginBottom = open ? '0' : '16px';
  });
}

// ======================================================
// HELPERS
// ======================================================

function setMsg(text, type) {
  const el = document.getElementById('form-msg');
  if (!el) return;
  el.textContent = text;
  el.className = `ap-form-msg ${type}`;
}

function numOrNull(id) {
  const v = parseFloat(document.getElementById(id)?.value);
  return isNaN(v) || v === 0 ? undefined : v;
}

// ======================================================
// INIT
// ======================================================

function initAddProduct() {
  bindSubcategory();
  bindImageUploads();
  bindStatusRadio();
  bindSeoToggle();
}

if (document.readyState === 'complete') {
  initAddProduct();
} else {
  window.addEventListener('load', initAddProduct, { once: true });
}

// ======================================================
// SUBMIT
// ======================================================

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('s4l_token');
    if (!token) { alert('Not authenticated'); return; }

    const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { vendor } = await vendorRes.json();
    if (!vendor)                      { alert('Create your store first'); return; }
    if (vendor.status === 'pending')  { alert('Your store is under review'); return; }
    if (vendor.status === 'suspended'){ alert('Your store is suspended'); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    // Block submit if any upload is still in progress
    if (pendingUploads.size > 0) {
      window.showToast?.('Please wait for images to finish uploading', 'error');
      reset(btn);
      return;
    }

    // Collect uploaded Cloudinary URLs
    const images = [1, 2, 3, 4, 5].map((n) => uploadedUrls[n]).filter(Boolean);

    // Collect tags
    const tagsRaw = document.getElementById('product-tags')?.value.trim();
    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // Dimensions (only include if at least one is set)
    const w = numOrNull('product-width');
    const h = numOrNull('product-height');
    const l = numOrNull('product-length');
    const dimensions = (w || h || l) ? { width: w, height: h, length: l } : undefined;

    // SEO title/desc
    const seoTitle = document.getElementById('product-seo-title')?.value.trim() || undefined;
    const seoDesc  = document.getElementById('product-seo-desc')?.value.trim()  || undefined;

    // Compare & cost price
    const comparePrice  = numOrNull('product-compare-price');
    const costPrice     = numOrNull('product-cost-price');
    const shippingCost  = numOrNull('product-shipping-cost');
    const weight        = numOrNull('product-weight');

    const active = document.querySelector('input[name="productStatus"]:checked')?.value !== 'draft';

    const product = {
      name:             document.getElementById('product-name')?.value.trim(),
      shortDescription: document.getElementById('product-short-desc')?.value.trim() || undefined,
      description:      document.getElementById('product-description')?.value.trim(),
      price:            Number(document.getElementById('product-price')?.value),
      comparePrice,
      costPrice,
      shippingCost,
      images,
      category:         categorySelect.value,
      subcategory:      subcategorySelect.value,
      tags,
      stock:            Number(document.getElementById('product-stock')?.value),
      sku:              document.getElementById('product-sku')?.value.trim() || undefined,
      trackInventory:   document.getElementById('track-inventory')?.checked,
      allowBackorder:   document.getElementById('allow-backorder')?.checked,
      weight,
      dimensions,
      seoTitle,
      seoDescription:  seoDesc,
      active,
    };

    // Validation
    if (!product.name)                              { showToast('Product name required', 'error'); reset(btn); return; }
    if (!Number.isFinite(product.price) || product.price < 0) { showToast('Invalid price', 'error'); reset(btn); return; }
    if (!product.category)                          { showToast('Select a category', 'error'); reset(btn); return; }
    if (!product.subcategory)                       { showToast('Select a subcategory', 'error'); reset(btn); return; }

    try {
      showToast('Creating product…');
      const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(product),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Product creation failed');

      showToast('Product created!');
      setTimeout(() => { window.location.href = '/account/vendor/products.html'; }, 1000);
    } catch (err) {
      reset(btn);
      showToast(err.message || 'Product creation failed', 'error');
    }
  });
}

function reset(btn) {
  btn.disabled = false;
  btn.textContent = 'Create Product';
}
