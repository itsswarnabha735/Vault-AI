/**
 * Category Registry - Single Source of Truth for Vault-AI
 *
 * This is the CANONICAL definition of all transaction categories.
 * Every system that needs category information MUST derive from this registry:
 *   - Auto-categorizer (vendor → category rules)
 *   - LLM statement parser (allowed categories + guidelines)
 *   - Query router (chat query → category matching)
 *   - Database seed (default categories for new users)
 *   - DEFAULT_CATEGORIES type export
 *
 * ADDING A NEW CATEGORY:
 * 1. Add an entry to CATEGORY_REGISTRY below
 * 2. Add a DB migration in lib/storage/db.ts to seed it for existing users
 * 3. That's it — all consumers derive from this file automatically.
 *
 * PRIVACY: All categorization happens locally in the browser.
 * No vendor data is transmitted to external servers.
 */

// ============================================
// Types
// ============================================

/**
 * A vendor-matching pattern for auto-categorization.
 *
 * Can be either:
 * - A plain string (matched via case-insensitive `.includes()`)
 * - A VendorPattern object for advanced matching (word boundaries, exclusions)
 */
export type VendorKeyword = string | VendorPattern;

/**
 * Advanced vendor pattern with word-boundary matching and exclusions.
 * Use this for ambiguous keywords like "shell", "bar", "store", etc.
 */
export interface VendorPattern {
  /** The keyword to match */
  keyword: string;

  /**
   * If true, only match when the keyword appears as a whole word
   * (surrounded by word boundaries, spaces, or start/end of string).
   * Prevents "seashell" from matching the "shell" gas station rule.
   */
  wordBoundary?: boolean;

  /**
   * Exclude the match if any of these patterns appear in the vendor name.
   * Prevents "Shell Beach Hotel" from matching Gas & Fuel.
   */
  exclude?: string[];
}

/**
 * Amount-range hint for multi-signal scoring.
 * When a vendor matches a category rule, the amount is checked against
 * these ranges to boost or penalise confidence — useful for disambiguation.
 *
 * Example: "Shell" + ₹500–₹3000 → Gas & Fuel (boosted),
 *          "Shell" + ₹15,000 → probably not Gas & Fuel (penalised).
 */
export interface AmountHint {
  /** Typical minimum amount for this category (inclusive) */
  typicalMin?: number;
  /** Typical maximum amount for this category (inclusive) */
  typicalMax?: number;
}

/**
 * Full category definition in the registry.
 */
export interface CategoryDefinition {
  /** Unique slug identifier (kebab-case, e.g., 'food-dining') */
  slug: string;

  /** Display name (used in UI, DB, and LLM prompts) */
  name: string;

  /** Emoji icon */
  icon: string;

  /** Hex color for UI */
  color: string;

  /** Sort order for display (lower = first) */
  sortOrder: number;

  /** Whether this is seeded as a default category for new users */
  isDefault: boolean;

  /**
   * Vendor keyword patterns for rule-based auto-categorization.
   * Matched case-insensitively against vendor names.
   * More specific patterns should come before generic ones.
   */
  vendorPatterns: VendorKeyword[];

  /**
   * Query aliases for the chat system.
   * These are words/phrases a user might type when asking about this category
   * (e.g., "dining", "restaurant", "food", "meal" for Food & Dining).
   */
  queryAliases: string[];

  /**
   * Guideline text for the LLM when assigning this category.
   * Included in the statement parsing prompt.
   * Example: "Restaurants, cafes, food delivery (Swiggy, Zomato), bars, pubs"
   */
  llmGuideline: string;

  /**
   * Amount-range hints for multi-signal scoring.
   * When a vendor keyword matches, the amount is compared against these
   * ranges to boost confidence (in-range) or penalise it (out-of-range).
   * Optional — categories without hints rely solely on vendor matching.
   */
  amountHints?: AmountHint;

  /**
   * Transaction types that strongly suggest this category.
   * Used as a secondary signal: if the transaction type matches,
   * confidence is boosted; if it contradicts, confidence is unchanged.
   */
  preferredTypes?: Array<
    'debit' | 'credit' | 'fee' | 'refund' | 'payment' | 'interest'
  >;

  /**
   * Optional sub-categories for two-level hierarchy.
   * Each sub-category inherits the parent's color unless overridden.
   * Sub-categories appear in the DB as separate rows with parentId set.
   */
  subcategories?: SubcategoryDefinition[];
}

/**
 * Sub-category definition within a parent category.
 */
export interface SubcategoryDefinition {
  /** Unique slug (kebab-case, scoped to parent, e.g., 'restaurants') */
  slug: string;
  /** Display name */
  name: string;
  /** Emoji icon (optional, falls back to parent icon) */
  icon?: string;
  /** Override color (optional, falls back to parent color) */
  color?: string;
  /** Sort order within parent */
  sortOrder: number;
}

// ============================================
// The Registry
// ============================================

/**
 * Canonical list of all transaction categories.
 *
 * ORDER MATTERS for display — `sortOrder` controls the UI ordering.
 * Vendor patterns are matched top-to-bottom; more specific patterns
 * in earlier categories won't be overridden by generic patterns later.
 */
export const CATEGORY_REGISTRY: readonly CategoryDefinition[] = [
  // --------------------------------------------------
  // 1. Food & Dining
  // --------------------------------------------------
  {
    slug: 'food-dining',
    name: 'Food & Dining',
    icon: '🍽️',
    color: '#f59e0b',
    sortOrder: 1,
    isDefault: true,
    vendorPatterns: [
      // Restaurants & Fast Food (US)
      'mcdonald',
      'burger king',
      'wendy',
      'subway',
      'starbucks',
      'dunkin',
      'chipotle',
      'taco bell',
      'pizza hut',
      'domino',
      'papa john',
      'chick-fil-a',
      'popeye',
      'kfc',
      'panera',
      'five guys',
      'panda express',
      'olive garden',
      'applebee',
      'ihop',
      'denny',
      'waffle house',
      'chili',
      'outback',
      'red lobster',
      'buffalo wild',
      'sushi',
      'thai',
      'chinese restaurant',
      'indian restaurant',
      // Food delivery
      'doordash',
      'uber eats',
      'grubhub',
      'postmates',
      'instacart',
      'zomato',
      'swiggy',
      'food delivery',
      'eatsure',
      'box8',
      // Indian Restaurant Chains & QSRs
      'haldiram',
      'barbeque nation',
      'mainland china',
      'sagar ratna',
      'saravana bhavan',
      'paradise biryani',
      'behrouz',
      'faasos',
      'mojo pizza',
      'burger singh',
      'wow momo',
      'chai point',
      'chaayos',
      'third wave coffee',
      'blue tokai',
      'starbucks india',
      'chowman',
      // Coffee & Bakeries
      'coffee',
      'cafe',
      'bakery',
      'tim horton',
      'peet',
      // General / International
      'restaurant',
      'dining',
      'eatery',
      'bistro',
      { keyword: 'grill', wordBoundary: true },
      'diner',
      'pizzeria',
      { keyword: 'deli', wordBoundary: true },
      'catering',
      'dhaba',
      'bhojanalaya',
      'food court',
      'hawker',
      'noodle',
      'ramen',
      'pho',
      'patisserie',
      'boulangerie',
      'trattoria',
      'tavern',
      {
        keyword: 'pub',
        wordBoundary: true,
        exclude: ['public', 'publish', 'republic'],
      },
      'bar & grill',
      'tapas',
      'kebab',
      'shawarma',
      'falafel',
      'canteen',
      { keyword: 'mess', wordBoundary: true },
      'tiffin',
      'food stall',
    ],
    queryAliases: [
      'dining',
      'restaurant',
      'food',
      'meal',
      'lunch',
      'dinner',
      'breakfast',
      'eating out',
      'takeout',
      'delivery',
      'dine',
      'eat',
      'cafe',
      'coffee',
    ],
    llmGuideline:
      'Restaurants, cafes, food delivery (Swiggy, Zomato, DoorDash), bars, pubs, coffee shops',
    amountHints: { typicalMin: 3, typicalMax: 500 },
    preferredTypes: ['debit'],
    subcategories: [
      { slug: 'restaurants', name: 'Restaurants', icon: '🍴', sortOrder: 1 },
      {
        slug: 'coffee-cafes',
        name: 'Coffee & Cafes',
        icon: '☕',
        sortOrder: 2,
      },
      {
        slug: 'food-delivery',
        name: 'Food Delivery',
        icon: '🛵',
        sortOrder: 3,
      },
      { slug: 'fast-food', name: 'Fast Food', icon: '🍔', sortOrder: 4 },
      { slug: 'bars-pubs', name: 'Bars & Pubs', icon: '🍻', sortOrder: 5 },
    ],
  },

  // --------------------------------------------------
  // 2. Groceries
  // --------------------------------------------------
  {
    slug: 'groceries',
    name: 'Groceries',
    icon: '🛒',
    color: '#22c55e',
    sortOrder: 2,
    isDefault: true,
    vendorPatterns: [
      'walmart',
      'target',
      'costco',
      'kroger',
      'safeway',
      'whole foods',
      'trader joe',
      'aldi',
      'publix',
      'h-e-b',
      'heb',
      'meijer',
      'stop & shop',
      'giant',
      'food lion',
      'wegman',
      'sprout',
      'fresh market',
      'piggly wiggly',
      'winn dixie',
      'grocery',
      'supermarket',
      {
        keyword: 'market',
        wordBoundary: true,
        exclude: ['stock market', 'marketing', 'marketplace'],
      },
      'farm stand',
      'big bazaar',
      'reliance fresh',
      'dmart',
      'more supermarket',
      'nature basket',
      'bigbasket',
      'jiomart',
      'blinkit',
      'zepto',
      // International convenience stores / groceries
      '7-eleven',
      '7 eleven',
      'seven eleven',
      'lawson',
      'familymart',
      'family mart',
      'ministop',
      'circle k',
      'wawa',
      'cold storage',
      'fairprice',
      'don don donki',
      'hypermarket',
      'provision',
      'kirana',
    ],
    queryAliases: [
      'groceries',
      'grocery',
      'supermarket',
      'food shopping',
      'provisions',
    ],
    llmGuideline:
      'Grocery stores, supermarkets, convenience stores (7-Eleven, FamilyMart, Lawson)',
    amountHints: { typicalMin: 10, typicalMax: 1000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 3. Shopping
  // --------------------------------------------------
  {
    slug: 'shopping',
    name: 'Shopping',
    icon: '🛍️',
    color: '#ec4899',
    sortOrder: 3,
    isDefault: true,
    vendorPatterns: [
      'amazon',
      'ebay',
      'etsy',
      'shopify',
      'best buy',
      'apple store',
      'apple.com',
      'nike',
      'adidas',
      'zara',
      'h&m',
      'uniqlo',
      'gap',
      'old navy',
      'nordstrom',
      'macy',
      'marshalls',
      'tj maxx',
      'ross',
      'ikea',
      'home depot',
      'lowe',
      'bed bath',
      'pottery barn',
      'wayfair',
      'overstock',
      'wish.com',
      'aliexpress',
      'flipkart',
      'myntra',
      'ajio',
      'meesho',
      'snapdeal',
      'nykaa',
      'tata cliq',
      'croma',
      'reliance digital',
      'vijay sales',
      'pepperfry',
      'urban ladder',
      'lenskart',
      'firstcry',
      'purplle',
      'mamaearth',
      'bewakoof',
      'boat',
      'amazon pay',
      'amazon india',
      // International / generic shopping keywords
      'duty free',
      'lotte',
      'don quijote',
      'daiso',
      'miniso',
      'muji',
      'decathlon',
      'cotton on',
      'charles & keith',
      { keyword: 'mall', wordBoundary: true },
      'department store',
      'retail',
      'outlet',
      'emporium',
      'gift shop',
      'souvenir',
      'boutique',
      {
        keyword: 'store',
        wordBoundary: true,
        exclude: ['app store', 'play store'],
      },
    ],
    queryAliases: [
      'shopping',
      'clothes',
      'clothing',
      'amazon',
      'online shopping',
      'retail',
      'store',
      'purchase',
    ],
    llmGuideline:
      'Duty-free shops, malls, retail stores, online shopping (Amazon, Flipkart)',
    amountHints: { typicalMin: 5, typicalMax: 50000 },
    preferredTypes: ['debit'],
    subcategories: [
      {
        slug: 'online-shopping',
        name: 'Online Shopping',
        icon: '📦',
        sortOrder: 1,
      },
      {
        slug: 'clothing',
        name: 'Clothing & Apparel',
        icon: '👕',
        sortOrder: 2,
      },
      { slug: 'electronics', name: 'Electronics', icon: '📱', sortOrder: 3 },
      { slug: 'home-garden', name: 'Home & Garden', icon: '🏡', sortOrder: 4 },
    ],
  },

  // --------------------------------------------------
  // 4. Transportation
  // --------------------------------------------------
  {
    slug: 'transportation',
    name: 'Transportation',
    icon: '🚗',
    color: '#3b82f6',
    sortOrder: 4,
    isDefault: true,
    vendorPatterns: [
      'uber',
      'lyft',
      'taxi',
      'cab',
      'ola',
      'grab',
      'rapido',
      'namma yatri',
      'yulu',
      'metro',
      { keyword: 'subway', exclude: ['subway sandwich', 'subway restaurant'] },
      'mta',
      'bart',
      'transit',
      { keyword: 'bus', wordBoundary: true },
      'amtrak',
      'train',
      'railway',
      'irctc',
      'redbus',
      'abhibus',
      'parking',
      'toll',
      'e-z pass',
      'fastag',
      'netc',
      'hertz',
      'enterprise rent',
      'avis',
      'budget rent',
      'turo',
      'zipcar',
      'zoomcar',
      'drivezy',
      'revv',
    ],
    queryAliases: [
      'transport',
      'transportation',
      'uber',
      'lyft',
      'taxi',
      'cab',
      'parking',
      'car',
      'commute',
      'ride',
      'metro',
    ],
    llmGuideline:
      'Cab/taxi/metro/train/bus/toll/parking, Uber, Ola, Yulu, ride-hailing',
    amountHints: { typicalMin: 2, typicalMax: 5000 },
    preferredTypes: ['debit'],
    subcategories: [
      { slug: 'ride-hailing', name: 'Ride-hailing', icon: '🚕', sortOrder: 1 },
      {
        slug: 'public-transit',
        name: 'Public Transit',
        icon: '🚇',
        sortOrder: 2,
      },
      {
        slug: 'parking-tolls',
        name: 'Parking & Tolls',
        icon: '🅿️',
        sortOrder: 3,
      },
      { slug: 'car-rental', name: 'Car Rental', icon: '🚙', sortOrder: 4 },
    ],
  },

  // --------------------------------------------------
  // 5. Gas & Fuel
  // --------------------------------------------------
  {
    slug: 'gas-fuel',
    name: 'Gas & Fuel',
    icon: '⛽',
    color: '#ea580c',
    sortOrder: 5,
    isDefault: true,
    vendorPatterns: [
      {
        keyword: 'shell',
        wordBoundary: true,
        exclude: ['hotel', 'beach', 'resort', 'sea'],
      },
      'exxon',
      'mobil',
      'chevron',
      { keyword: 'bp', wordBoundary: true },
      'citgo',
      'sunoco',
      {
        keyword: 'marathon',
        wordBoundary: true,
        exclude: ['marathon sports', 'marathon run'],
      },
      'valero',
      'phillips 66',
      'speedway',
      'racetrac',
      'gas station',
      { keyword: 'fuel', wordBoundary: true },
      'petrol',
      'diesel',
      'indian oil',
      'bharat petroleum',
      'hindustan petroleum',
      'hp petrol',
      'ev charging',
      'chargepoint',
      'tesla supercharger',
    ],
    queryAliases: [
      'gas',
      'fuel',
      'petrol',
      'diesel',
      'gas station',
      'filling station',
      'ev charging',
    ],
    llmGuideline: 'Gas stations, petrol pumps, fuel, EV charging',
    amountHints: { typicalMin: 10, typicalMax: 5000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 6. Entertainment
  // --------------------------------------------------
  {
    slug: 'entertainment',
    name: 'Entertainment',
    icon: '🎬',
    color: '#8b5cf6',
    sortOrder: 6,
    isDefault: true,
    vendorPatterns: [
      'netflix',
      'hulu',
      'disney+',
      'disney plus',
      'hbo',
      {
        keyword: 'max',
        wordBoundary: true,
        exclude: ['max life', 'max healthcare', 'max bupa'],
      },
      'paramount',
      'peacock',
      'apple tv',
      'amazon prime',
      'prime video',
      'spotify',
      'apple music',
      'youtube',
      'audible',
      'kindle',
      'xbox',
      'playstation',
      'nintendo',
      'steam',
      'epic games',
      'amc theatre',
      'regal cinema',
      'cinemark',
      'fandango',
      'ticketmaster',
      'stubhub',
      'live nation',
      'eventbrite',
      'movie',
      'theater',
      'theatre',
      'concert',
      { keyword: 'show', wordBoundary: true, exclude: ['showroom'] },
      { keyword: 'game', wordBoundary: true, exclude: ['game changer'] },
      'hotstar',
      'jiocinema',
      'zee5',
      'sonyliv',
      'pvr',
      'inox',
      'bookmyshow',
    ],
    queryAliases: [
      'entertainment',
      'movie',
      'movies',
      'cinema',
      'concert',
      'show',
      'streaming',
      'netflix',
      'spotify',
      'gaming',
    ],
    llmGuideline:
      'Streaming services, movies, concerts, gaming, entertainment venues',
    amountHints: { typicalMin: 2, typicalMax: 5000 },
    preferredTypes: ['debit'],
    subcategories: [
      {
        slug: 'streaming',
        name: 'Streaming Services',
        icon: '📺',
        sortOrder: 1,
      },
      {
        slug: 'movies-shows',
        name: 'Movies & Shows',
        icon: '🎥',
        sortOrder: 2,
      },
      { slug: 'gaming', name: 'Gaming', icon: '🎮', sortOrder: 3 },
      {
        slug: 'events-concerts',
        name: 'Events & Concerts',
        icon: '🎫',
        sortOrder: 4,
      },
    ],
  },

  // --------------------------------------------------
  // 7. Healthcare
  // --------------------------------------------------
  {
    slug: 'healthcare',
    name: 'Healthcare',
    icon: '🏥',
    color: '#ef4444',
    sortOrder: 7,
    isDefault: true,
    vendorPatterns: [
      'cvs',
      'walgreens',
      'rite aid',
      'pharmacy',
      'drug store',
      'hospital',
      'clinic',
      'doctor',
      'dentist',
      'optometrist',
      'urgent care',
      { keyword: 'emergency', wordBoundary: true },
      'medical',
      {
        keyword: 'health',
        wordBoundary: true,
        exclude: [
          'health insurance',
          'star health',
          'niva bupa',
          'care health',
        ],
      },
      'labcorp',
      'quest diagnostics',
      { keyword: 'lab', wordBoundary: true, exclude: ['lab grown', 'collab'] },
      'apollo',
      'fortis',
      'max healthcare',
      'medplus',
      'practo',
      'pharmeasy',
      '1mg',
      'netmeds',
    ],
    queryAliases: [
      'healthcare',
      'health',
      'medical',
      'doctor',
      'hospital',
      'pharmacy',
      'medicine',
      'dentist',
      'dental',
    ],
    llmGuideline: 'Hospitals, clinics, pharmacies, doctors, medical expenses',
    amountHints: { typicalMin: 5, typicalMax: 100000 },
    preferredTypes: ['debit'],
    subcategories: [
      { slug: 'pharmacy', name: 'Pharmacy', icon: '💊', sortOrder: 1 },
      {
        slug: 'doctor-visits',
        name: 'Doctor Visits',
        icon: '👨‍⚕️',
        sortOrder: 2,
      },
      { slug: 'hospital', name: 'Hospital', icon: '🏥', sortOrder: 3 },
      { slug: 'lab-tests', name: 'Lab Tests', icon: '🔬', sortOrder: 4 },
    ],
  },

  // --------------------------------------------------
  // 8. Utilities
  // --------------------------------------------------
  {
    slug: 'utilities',
    name: 'Utilities',
    icon: '💡',
    color: '#06b6d4',
    sortOrder: 8,
    isDefault: true,
    vendorPatterns: [
      'electric',
      'power',
      'energy',
      'water',
      'sewer',
      'gas bill',
      'natural gas',
      'heating',
      'internet',
      'comcast',
      'xfinity',
      'at&t',
      'verizon',
      'spectrum',
      'cox',
      't-mobile',
      'sprint',
      'cricket',
      'phone bill',
      'mobile bill',
      'broadband',
      'wifi',
      'jio',
      'airtel',
      'vodafone',
      'bsnl',
      { keyword: 'vi ', wordBoundary: false },
      'tata power',
      'adani electricity',
      'bescom',
      'trash',
      'waste',
      'sanitation',
    ],
    queryAliases: [
      'utilities',
      'electricity',
      'water',
      'gas',
      'internet',
      'phone',
      'bill',
      'bills',
      'recharge',
      'broadband',
    ],
    llmGuideline:
      'Jio Fiber, electricity, water, broadband, mobile recharge, phone bills',
    amountHints: { typicalMin: 50, typicalMax: 10000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 9. Travel
  // --------------------------------------------------
  {
    slug: 'travel',
    name: 'Travel',
    icon: '✈️',
    color: '#14b8a6',
    sortOrder: 9,
    isDefault: true,
    vendorPatterns: [
      'airline',
      'flight',
      'airfare',
      'american airlines',
      'delta',
      'united',
      'southwest',
      'jetblue',
      'spirit',
      'frontier',
      'alaska air',
      'air india',
      'indigo',
      'vistara',
      'spicejet',
      'air asia',
      'akasa air',
      'go first',
      'hotel',
      'motel',
      'marriott',
      'hilton',
      'hyatt',
      'ihg',
      'airbnb',
      'vrbo',
      'booking.com',
      'expedia',
      'hotels.com',
      'makemytrip',
      'goibibo',
      'oyo',
      'cleartrip',
      'ixigo',
      'yatra',
      'easemytrip',
      'happyeasygo',
      'trivago',
      'kayak',
      'priceline',
      'resort',
      'lodge',
      { keyword: 'inn', wordBoundary: true },
      'hostel',
      'cruise',
      'carnival',
      'royal caribbean',
      'luggage',
      'baggage',
      'travel insurance',
      'thomas cook',
      'cox & kings',
      'sotc',
      'club mahindra',
    ],
    queryAliases: [
      'travel',
      'trip',
      'vacation',
      'holiday',
      'flight',
      'hotel',
      'airbnb',
      'booking',
      'airline',
    ],
    llmGuideline:
      'Airlines, hotels, booking platforms, airports, travel agencies',
    amountHints: { typicalMin: 100, typicalMax: 500000 },
    preferredTypes: ['debit'],
    subcategories: [
      { slug: 'flights', name: 'Flights', icon: '✈️', sortOrder: 1 },
      {
        slug: 'hotels-lodging',
        name: 'Hotels & Lodging',
        icon: '🏨',
        sortOrder: 2,
      },
      {
        slug: 'travel-booking',
        name: 'Travel Booking',
        icon: '🗺️',
        sortOrder: 3,
      },
    ],
  },

  // --------------------------------------------------
  // 10. Insurance
  // --------------------------------------------------
  {
    slug: 'insurance',
    name: 'Insurance',
    icon: '🛡️',
    color: '#0891b2',
    sortOrder: 10,
    isDefault: true,
    vendorPatterns: [
      'geico',
      'state farm',
      'allstate',
      'progressive',
      'liberty mutual',
      'farmers',
      'usaa',
      'nationwide',
      'lic',
      'hdfc life',
      'hdfc ergo',
      'icici prudential',
      'icici lombard',
      'sbi life',
      'max life',
      'max bupa',
      'bajaj allianz',
      'tata aia',
      'kotak life',
      'star health',
      'niva bupa',
      'care health',
      'digit insurance',
      'acko',
      'policybazaar',
      'coverfox',
      'life insurance',
      'health insurance',
      'term insurance',
      'term plan',
      'motor insurance',
      'car insurance',
      'bike insurance',
      'vehicle insurance',
      'mediclaim',
      'policy premium',
      'insurance premium',
      'policy renewal',
      { keyword: 'insurance', wordBoundary: true },
      {
        keyword: 'premium',
        wordBoundary: true,
        exclude: ['youtube premium', 'spotify premium', 'linkedin premium'],
      },
      { keyword: 'policy', wordBoundary: true },
      'coverage',
    ],
    queryAliases: [
      'insurance',
      'premium',
      'life insurance',
      'health insurance',
      'car insurance',
      'motor insurance',
      'term plan',
      'policy',
      'lic',
      'mediclaim',
    ],
    llmGuideline:
      'Insurance premiums (life, health, motor, term), policy renewals',
    amountHints: { typicalMin: 500, typicalMax: 200000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 11. Education
  // --------------------------------------------------
  {
    slug: 'education',
    name: 'Education',
    icon: '📚',
    color: '#ca8a04',
    sortOrder: 11,
    isDefault: true,
    vendorPatterns: [
      'tuition',
      'school',
      'school fee',
      'college',
      'college fee',
      'university',
      'academy',
      'coursera',
      'udemy',
      'edx',
      'skillshare',
      'masterclass',
      'brilliant',
      'khan academy',
      'linkedin learning',
      'textbook',
      'book store',
      'books',
      'stationery',
      'barnes & noble',
      'byjus',
      'byju',
      'unacademy',
      'upgrad',
      'vedantu',
      'student loan',
      'education',
      'course fee',
      'coaching',
      'exam fee',
      'training',
      'certification',
    ],
    queryAliases: [
      'education',
      'school',
      'college',
      'university',
      'tuition',
      'course',
      'training',
      'books',
      'textbook',
      'fees',
      'coaching',
      'exam',
    ],
    llmGuideline:
      'Tuition fees, courses, books, coaching, online learning platforms',
    amountHints: { typicalMin: 10, typicalMax: 500000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 12. Subscriptions
  // --------------------------------------------------
  {
    slug: 'subscriptions',
    name: 'Subscriptions',
    icon: '🔄',
    color: '#7c3aed',
    sortOrder: 12,
    isDefault: true,
    vendorPatterns: [
      'subscription',
      'membership',
      'github',
      'gitlab',
      'notion',
      'slack',
      'zoom',
      'adobe',
      'creative cloud',
      'microsoft 365',
      'office 365',
      'google one',
      'dropbox',
      'icloud',
      'evernote',
      'canva',
      'figma',
      'chatgpt',
      'openai',
      'grammarly',
      'nordvpn',
      'expressvpn',
      'gym',
      'fitness',
      'planet fitness',
      'la fitness',
      'ymca',
      'cult.fit',
      'curefit',
      'gold gym',
      'anytime fitness',
      'newspaper',
      'magazine',
      'wall street journal',
      'nyt',
      'patreon',
      'substack',
      'cred',
      'gpay rewards',
    ],
    queryAliases: [
      'subscription',
      'subscriptions',
      'recurring',
      'membership',
      'plan',
      'premium',
      'renewal',
      'auto-pay',
      'autopay',
      'monthly charge',
    ],
    llmGuideline:
      'Apple Services, Spotify, Netflix, software subscriptions, gym memberships',
    amountHints: { typicalMin: 2, typicalMax: 5000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 13. Income
  // --------------------------------------------------
  {
    slug: 'income',
    name: 'Income',
    icon: '💰',
    color: '#10b981',
    sortOrder: 13,
    isDefault: true,
    vendorPatterns: [
      'payroll',
      'salary',
      'direct deposit',
      'wage',
      'dividend',
      'interest income',
      'interest payment',
      'tax refund',
      'irs',
      'income tax refund',
      'venmo payment',
      'zelle payment',
      'paypal payment',
      'freelance',
      'invoice payment',
    ],
    queryAliases: [
      'income',
      'salary',
      'paycheck',
      'payment received',
      'deposit',
      'earning',
      'earnings',
      'wage',
      'wages',
    ],
    llmGuideline: 'Salary, income credits, freelance payments, dividends',
    preferredTypes: ['credit', 'payment'],
  },

  // --------------------------------------------------
  // 14. Transfers
  // --------------------------------------------------
  {
    slug: 'transfers',
    name: 'Transfers',
    icon: '🔀',
    color: '#6366f1',
    sortOrder: 14,
    isDefault: true,
    vendorPatterns: [
      'transfer',
      'wire transfer',
      { keyword: 'ach', wordBoundary: true },
      'venmo',
      'zelle',
      'paypal',
      'cash app',
      'cashapp',
      'google pay',
      'gpay',
      'phonepe',
      'paytm',
      { keyword: 'upi', wordBoundary: true },
      'bank transfer',
      'internal transfer',
      'online transfer',
      { keyword: 'neft', wordBoundary: true },
      { keyword: 'rtgs', wordBoundary: true },
      { keyword: 'imps', wordBoundary: true },
      { keyword: 'nach', wordBoundary: true },
      { keyword: 'ecs', wordBoundary: true },
      'bhim',
      'mobikwik',
      'freecharge',
    ],
    queryAliases: [
      'transfer',
      'transfers',
      'upi',
      'neft',
      'rtgs',
      'imps',
      'wire',
      'remittance',
      'sent to',
      'received from',
      'p2p',
      'peer to peer',
    ],
    llmGuideline:
      'ATM withdrawal, personal fund transfers (to people), UPI to individuals',
  },

  // --------------------------------------------------
  // 15. Rent & Housing
  // --------------------------------------------------
  {
    slug: 'rent-housing',
    name: 'Rent & Housing',
    icon: '🏠',
    color: '#b45309',
    sortOrder: 15,
    isDefault: true,
    vendorPatterns: [
      'rent',
      'mortgage',
      'lease',
      'landlord',
      'property',
      'hoa',
      'homeowner',
      'condo fee',
      'maintenance',
      'repair',
      'plumbing',
      'electrician',
      'pest control',
      'cleaning service',
      'maid',
    ],
    queryAliases: [
      'rent',
      'lease',
      'rental',
      'landlord',
      'tenant',
      'housing',
      'accommodation',
      'mortgage',
    ],
    llmGuideline: 'Rent, mortgage, maintenance, housing-related expenses',
    amountHints: { typicalMin: 1000, typicalMax: 200000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 16. Personal Care
  // --------------------------------------------------
  {
    slug: 'personal-care',
    name: 'Personal Care',
    icon: '💆',
    color: '#e879f9',
    sortOrder: 16,
    isDefault: true,
    vendorPatterns: [
      'salon',
      'barber',
      'spa',
      'massage',
      'nail',
      'beauty',
      'cosmetic',
      'skincare',
      'sephora',
      'ulta',
      'dry cleaner',
      'laundry',
      'tailor',
    ],
    queryAliases: [
      'personal care',
      'salon',
      'barber',
      'spa',
      'beauty',
      'grooming',
      'haircut',
      'laundry',
    ],
    llmGuideline: 'Salons, spas, beauty, grooming, dry cleaning',
    amountHints: { typicalMin: 5, typicalMax: 5000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 17. Fees & Charges
  // --------------------------------------------------
  {
    slug: 'fees-charges',
    name: 'Fees & Charges',
    icon: '💳',
    color: '#f43f5e',
    sortOrder: 17,
    isDefault: true,
    vendorPatterns: [
      'annual fee',
      'monthly fee',
      'service fee',
      'late fee',
      'overdraft',
      'nsf fee',
      'atm fee',
      'foreign transaction fee',
      'finance charge',
      'interest charge',
      'minimum interest',
      'membership fee',
      'convenience fee',
    ],
    queryAliases: [
      'fees',
      'charges',
      'fee',
      'charge',
      'penalty',
      'late fee',
      'interest',
      'finance charge',
      'annual fee',
    ],
    llmGuideline:
      'Annual fee, late fee, interest charge, finance charge, service charge, CRED, credit card bill payments',
    amountHints: { typicalMin: 1, typicalMax: 50000 },
    preferredTypes: ['debit', 'fee', 'interest'],
  },

  // --------------------------------------------------
  // 18. Investments
  // --------------------------------------------------
  {
    slug: 'investments',
    name: 'Investments',
    icon: '📈',
    color: '#059669',
    sortOrder: 18,
    isDefault: true,
    vendorPatterns: [
      // Brokerages & Trading Platforms
      'zerodha',
      'groww',
      'upstox',
      'angel',
      'angel one',
      'kite',
      { keyword: 'coin', wordBoundary: true, exclude: ['coinbase'] },
      'motilal oswal',
      'icici direct',
      'hdfc securities',
      'kotak securities',
      'sharekhan',
      '5paisa',
      'paytm money',
      'et money',
      'smallcase',
      'kuvera',
      'vested',
      'robinhood',
      'fidelity',
      'schwab',
      'vanguard',
      'e*trade',
      'td ameritrade',
      'webull',
      // Investment keywords
      'mutual fund',
      { keyword: 'sip', wordBoundary: true },
      { keyword: 'nps', wordBoundary: true },
      { keyword: 'ppf', wordBoundary: true },
      { keyword: 'epf', wordBoundary: true },
      'fixed deposit',
      'recurring deposit',
      'fd renewal',
      'rd instalment',
      'demat',
      'nsdl',
      'cdsl',
      'stock purchase',
      'share purchase',
      'investment',
      'bond purchase',
      'sovereign gold bond',
      { keyword: 'sgb', wordBoundary: true },
    ],
    queryAliases: [
      'investment',
      'investments',
      'invest',
      'invested',
      'mutual fund',
      'mutual funds',
      'mf',
      'sip',
      'stocks',
      'stock',
      'shares',
      'equity',
      'bonds',
      'bond',
      'fixed deposit',
      'fd',
      'rd',
      'recurring deposit',
      'nps',
      'ppf',
      'epf',
      'provident fund',
      'demat',
      'trading',
      'portfolio',
      'dividend',
      'dividends',
      'capital gains',
      'groww',
      'zerodha',
      'etmoney',
      'et money',
      'upstox',
      'kuvera',
      'smallcase',
      'coin',
      'angel one',
      'paytm money',
      '5paisa',
      'vested',
    ],
    llmGuideline:
      'Groww, Zerodha, mutual fund SIPs, stock purchases, fixed deposits, ACH/Indian Clearing Corp (if amount pattern suggests SIP)',
    amountHints: { typicalMin: 100, typicalMax: 5000000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 19. EMI & Loans
  // --------------------------------------------------
  {
    slug: 'emi-loans',
    name: 'EMI & Loans',
    icon: '🏦',
    color: '#dc2626',
    sortOrder: 19,
    isDefault: true,
    vendorPatterns: [
      'emi',
      'home loan',
      'car loan',
      'personal loan',
      'education loan',
      'loan repayment',
      'instalment',
      'installment',
      'equated monthly',
      'loan emi',
      'credit card emi',
    ],
    queryAliases: [
      'emi',
      'loan',
      'instalment',
      'installment',
      'mortgage',
      'home loan',
      'car loan',
      'personal loan',
      'repayment',
    ],
    llmGuideline: 'EMI payments, loan repayments, installments',
    amountHints: { typicalMin: 500, typicalMax: 500000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 20. Taxes
  // --------------------------------------------------
  {
    slug: 'taxes',
    name: 'Taxes',
    icon: '🏛️',
    color: '#475569',
    sortOrder: 20,
    isDefault: true,
    vendorPatterns: [
      'income tax',
      'advance tax',
      'self assessment tax',
      { keyword: 'tds', wordBoundary: true },
      { keyword: 'gst', wordBoundary: true },
      'property tax',
      'road tax',
      'professional tax',
      'tax payment',
      'challan',
    ],
    queryAliases: [
      'tax',
      'taxes',
      'income tax',
      'gst',
      'tds',
      'property tax',
      'tax return',
      'tax refund',
    ],
    llmGuideline: 'Income tax, advance tax, GST, TDS, property tax, challans',
    amountHints: { typicalMin: 100, typicalMax: 5000000 },
    preferredTypes: ['debit'],
  },

  // --------------------------------------------------
  // 21. Other
  // --------------------------------------------------
  {
    slug: 'other',
    name: 'Other',
    icon: '📦',
    color: '#6b7280',
    sortOrder: 99,
    isDefault: true,
    vendorPatterns: [],
    queryAliases: ['other', 'miscellaneous', 'uncategorized', 'unknown'],
    llmGuideline: 'Only use when no other category fits',
  },
] as const;

// ============================================
// Derived Helpers
// ============================================

/** Map of category slug → definition (for fast lookup) */
const _slugMap = new Map<string, CategoryDefinition>();
for (const cat of CATEGORY_REGISTRY) {
  _slugMap.set(cat.slug, cat);
}

/** Map of category name (lowercase) → definition (for name-based lookup) */
const _nameMap = new Map<string, CategoryDefinition>();
for (const cat of CATEGORY_REGISTRY) {
  _nameMap.set(cat.name.toLowerCase(), cat);
}

/**
 * Get a category definition by slug.
 */
export function getCategoryBySlug(
  slug: string
): CategoryDefinition | undefined {
  return _slugMap.get(slug);
}

/**
 * Get a category definition by display name (case-insensitive).
 */
export function getCategoryByName(
  name: string
): CategoryDefinition | undefined {
  return _nameMap.get(name.toLowerCase());
}

/**
 * Get all category names as a flat array (for LLM allowed-categories list).
 */
export function getAllCategoryNames(): string[] {
  return CATEGORY_REGISTRY.map((c) => c.name);
}

/**
 * Get the vendor → category rules map (for auto-categorizer).
 * Returns Record<categoryName, VendorKeyword[]>.
 */
export function getVendorRulesMap(): Record<string, VendorKeyword[]> {
  const map: Record<string, VendorKeyword[]> = {};
  for (const cat of CATEGORY_REGISTRY) {
    if (cat.vendorPatterns.length > 0) {
      map[cat.name] = [...cat.vendorPatterns];
    }
  }
  return map;
}

/**
 * Get the amount-hint map (for multi-signal scoring in auto-categorizer).
 * Returns Record<categoryName, AmountHint>.
 */
export function getAmountHintMap(): Record<string, AmountHint> {
  const map: Record<string, AmountHint> = {};
  for (const cat of CATEGORY_REGISTRY) {
    if (cat.amountHints) {
      map[cat.name] = cat.amountHints;
    }
  }
  return map;
}

/**
 * Get the preferred-type map (for multi-signal scoring in auto-categorizer).
 * Returns Record<categoryName, string[]>.
 */
export function getPreferredTypeMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const cat of CATEGORY_REGISTRY) {
    if (cat.preferredTypes && cat.preferredTypes.length > 0) {
      map[cat.name] = [...cat.preferredTypes];
    }
  }
  return map;
}

/**
 * Get the query-alias map (for chat query router).
 * Returns Record<categoryName, string[]>.
 */
export function getQueryAliasMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const cat of CATEGORY_REGISTRY) {
    if (cat.queryAliases.length > 0) {
      map[cat.name] = [...cat.queryAliases];
    }
  }
  return map;
}

/**
 * Build the LLM category guidelines string for the statement parser prompt.
 * Returns a formatted string like:
 *   "Allowed categories: Food & Dining, Shopping, ...\n
 *    Guidelines:\n- Food & Dining: Restaurants, cafes, ...\n- ..."
 */
export function buildLLMCategoryBlock(): string {
  const names = CATEGORY_REGISTRY.filter((c) => c.slug !== 'other')
    .map((c) => c.name)
    .join(', ');

  const guidelines = CATEGORY_REGISTRY.filter(
    (c) => c.slug !== 'other' && c.llmGuideline
  )
    .map((c) => `   - ${c.name}: ${c.llmGuideline}`)
    .join('\n');

  return `Allowed categories: ${names}.\n   Guidelines for category assignment:\n${guidelines}\n   - If truly uncertain, use "Shopping" as default for purchases.`;
}

/**
 * Get default category definitions for DB seeding.
 * Returns data in the format expected by db.ts initializeDefaults().
 */
export function getDefaultCategorySeeds(): ReadonlyArray<{
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  parentId: null;
}> {
  return CATEGORY_REGISTRY.filter((c) => c.isDefault).map((c) => ({
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sortOrder,
    isDefault: true,
    parentId: null,
  }));
}

/**
 * Get sub-category seed definitions for DB seeding.
 * Returns data with parentSlug so the caller can resolve the actual parentId.
 */
export function getSubcategorySeeds(): ReadonlyArray<{
  parentSlug: string;
  parentName: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}> {
  const seeds: Array<{
    parentSlug: string;
    parentName: string;
    slug: string;
    name: string;
    icon: string;
    color: string;
    sortOrder: number;
  }> = [];

  for (const cat of CATEGORY_REGISTRY) {
    if (cat.subcategories && cat.subcategories.length > 0) {
      for (const sub of cat.subcategories) {
        seeds.push({
          parentSlug: cat.slug,
          parentName: cat.name,
          slug: sub.slug,
          name: sub.name,
          icon: sub.icon || cat.icon,
          color: sub.color || cat.color,
          sortOrder: sub.sortOrder,
        });
      }
    }
  }

  return seeds;
}

/**
 * Get all sub-category names grouped by parent name (for LLM prompts).
 */
export function getSubcategoryMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const cat of CATEGORY_REGISTRY) {
    if (cat.subcategories && cat.subcategories.length > 0) {
      map[cat.name] = cat.subcategories.map((s) => s.name);
    }
  }
  return map;
}

/**
 * Category name rename map for DB migrations.
 * Maps old DB names → new canonical names from the registry.
 */
export const CATEGORY_RENAME_MAP: Record<string, string> = {
  Dining: 'Food & Dining',
  Transport: 'Transportation',
  Rent: 'Rent & Housing',
};

/**
 * Categories that were missing from the old DB defaults and need to be added.
 */
export const NEW_DEFAULT_CATEGORIES = CATEGORY_REGISTRY.filter((c) =>
  ['gas-fuel', 'personal-care', 'fees-charges'].includes(c.slug)
);
