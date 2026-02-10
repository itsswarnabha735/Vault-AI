/**
 * Auto-Categorizer for Vault-AI
 *
 * Maps vendor/merchant names to spending categories using
 * a rule-based approach with keyword matching.
 *
 * ENHANCED with vendor-category learning:
 * When a user manually corrects a category, the mapping is persisted
 * in IndexedDB. On future imports, learned mappings take priority
 * over the default keyword rules.
 *
 * PRIVACY: All categorization happens locally in the browser.
 * No vendor data is transmitted to external servers.
 */

import { vendorCategoryLearning } from './vendor-category-learning';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Category suggestion result.
 */
export interface CategorySuggestion {
  /** Suggested category name */
  categoryName: string;

  /** Confidence in the suggestion (0-1) */
  confidence: number;

  /** Matched keyword that triggered the suggestion */
  matchedKeyword: string;

  /** If the suggestion came from user-learned mappings, the direct CategoryId */
  learnedCategoryId?: CategoryId;

  /** Whether this suggestion was from user learning vs default rules */
  isLearned?: boolean;
}

// ============================================
// Vendor-to-Category Mapping Rules
// ============================================

/**
 * Map of category names to arrays of vendor keyword patterns.
 * Keywords are matched case-insensitively against vendor names.
 * More specific patterns should come before generic ones.
 */
const CATEGORY_RULES: Record<string, string[]> = {
  'Food & Dining': [
    // Restaurants & Fast Food
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
    'grill',
    'diner',
    'pizzeria',
    'deli',
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
    'pub',
    'bar & grill',
    'tapas',
    'kebab',
    'shawarma',
    'falafel',
    'canteen',
    'mess',
    'tiffin',
    'food stall',
  ],

  Groceries: [
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
    'market',
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

  Shopping: [
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
    'mall',
    'department store',
    'retail',
    'outlet',
    'emporium',
    'gift shop',
    'souvenir',
    'boutique',
    'store',
  ],

  Transportation: [
    'uber',
    'lyft',
    'taxi',
    'cab',
    'ola',
    'grab',
    'rapido',
    'namma yatri',
    'metro',
    'subway',
    'mta',
    'bart',
    'transit',
    'bus',
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
    'enterprise',
    'avis',
    'budget rent',
    'turo',
    'zipcar',
    'zoomcar',
    'drivezy',
    'revv',
  ],

  'Gas & Fuel': [
    'shell',
    'exxon',
    'mobil',
    'chevron',
    'bp',
    'citgo',
    'sunoco',
    'marathon',
    'valero',
    'phillips 66',
    'speedway',
    'circle k',
    'wawa',
    'racetrac',
    'gas station',
    'fuel',
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

  Entertainment: [
    'netflix',
    'hulu',
    'disney+',
    'disney plus',
    'hbo',
    'max',
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
    'concert',
    'show',
    'game',
    'hotstar',
    'jiocinema',
    'zee5',
    'sonyliv',
  ],

  Healthcare: [
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
    'emergency',
    'medical',
    'health',
    'labcorp',
    'quest diagnostics',
    'lab',
    'insurance premium',
    'health insurance',
    'apollo',
    'fortis',
    'max healthcare',
    'medplus',
    'practo',
    'pharmeasy',
    '1mg',
    'netmeds',
  ],

  Utilities: [
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
    'vi ',
    'tata power',
    'adani electricity',
    'bescom',
    'trash',
    'waste',
    'sanitation',
  ],

  Travel: [
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
    'inn',
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

  Insurance: [
    'insurance',
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
    'icici prudential',
    'sbi life',
    'max life',
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
    'premium',
    'policy',
    'coverage',
  ],

  Education: [
    'tuition',
    'school',
    'university',
    'college',
    'academy',
    'coursera',
    'udemy',
    'skillshare',
    'masterclass',
    'linkedin learning',
    'textbook',
    'book store',
    'barnes & noble',
    'byjus',
    'unacademy',
    'upgrad',
    'vedantu',
    'student loan',
    'education',
  ],

  Subscriptions: [
    'subscription',
    'membership',
    'premium',
    'github',
    'gitlab',
    'notion',
    'slack',
    'zoom',
    'adobe',
    'microsoft 365',
    'office 365',
    'google one',
    'dropbox',
    'icloud',
    'evernote',
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

  Income: [
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

  Transfers: [
    'transfer',
    'wire transfer',
    'ach',
    'venmo',
    'zelle',
    'paypal',
    'cash app',
    'cashapp',
    'google pay',
    'gpay',
    'phonepe',
    'paytm',
    'upi',
    'bank transfer',
    'internal transfer',
    'online transfer',
    'neft',
    'rtgs',
    'imps',
    'nach',
    'ecs',
    'bhim',
    'mobikwik',
    'freecharge',
    'amazon pay',
  ],

  'Rent & Housing': [
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

  'Personal Care': [
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

  'Fees & Charges': [
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
};

// ============================================
// Auto-Categorizer Service
// ============================================

/**
 * Auto-categorization service using rule-based vendor matching,
 * enhanced with user-learned corrections.
 */
class AutoCategorizerService {
  /**
   * Initialize the learning subsystem.
   * Should be called once on app startup.
   */
  async initializeLearning(): Promise<void> {
    await vendorCategoryLearning.initialize();
  }

  /**
   * Suggest a category for a vendor name.
   *
   * Priority order:
   * 1. User-learned mappings (highest confidence)
   * 2. Default keyword rules (fallback)
   *
   * @param vendor - The vendor/merchant name to categorize
   * @returns CategorySuggestion or null if no match
   */
  suggestCategory(vendor: string): CategorySuggestion | null {
    if (!vendor || vendor.trim().length === 0) {
      return null;
    }

    // 1. Check learned mappings first (highest priority)
    const learned = vendorCategoryLearning.lookup(vendor);
    if (learned) {
      return {
        categoryName: `__learned__`, // Placeholder - resolved by caller via categoryId
        confidence: learned.confidence,
        matchedKeyword: learned.matchedPattern,
        learnedCategoryId: learned.categoryId,
        isLearned: true,
      };
    }

    // 2. Fall back to rule-based matching
    return this.suggestCategoryFromRules(vendor);
  }

  /**
   * Suggest a category using only the default keyword rules (no learning).
   * Useful when you want a baseline suggestion.
   */
  suggestCategoryFromRules(vendor: string): CategorySuggestion | null {
    if (!vendor || vendor.trim().length === 0) {
      return null;
    }

    const vendorLower = vendor.toLowerCase().trim();
    let bestMatch: CategorySuggestion | null = null;

    for (const [categoryName, keywords] of Object.entries(CATEGORY_RULES)) {
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();

        if (vendorLower.includes(keywordLower)) {
          // Calculate confidence based on how specific the match is
          // Longer keyword matches = higher confidence
          const specificity = keywordLower.length / vendorLower.length;
          const confidence = Math.min(0.95, 0.6 + specificity * 0.35);

          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = {
              categoryName,
              confidence,
              matchedKeyword: keyword,
              isLearned: false,
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Learn a vendor-category mapping from a user correction.
   * Delegates to the vendor-category learning service.
   */
  async learnCategory(vendor: string, categoryId: CategoryId): Promise<void> {
    await vendorCategoryLearning.learn(vendor, categoryId);
  }

  /**
   * Learn multiple vendor-category mappings at once (batch from statement confirmation).
   */
  async learnCategories(
    mappings: Array<{ vendor: string; categoryId: CategoryId }>
  ): Promise<void> {
    await vendorCategoryLearning.learnBatch(mappings);
  }

  /**
   * Get the number of learned vendor mappings.
   */
  getLearnedCount(): number {
    return vendorCategoryLearning.getMappingCount();
  }

  /**
   * Suggest categories for multiple vendors at once.
   *
   * @param vendors - Array of vendor names
   * @returns Map of vendor name to category suggestion
   */
  suggestCategories(vendors: string[]): Map<string, CategorySuggestion | null> {
    const results = new Map<string, CategorySuggestion | null>();

    for (const vendor of vendors) {
      results.set(vendor, this.suggestCategory(vendor));
    }

    return results;
  }

  /**
   * Get all available category names from the rules.
   */
  getAvailableCategories(): string[] {
    return Object.keys(CATEGORY_RULES);
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the auto-categorizer.
 */
export const autoCategorizer = new AutoCategorizerService();

/**
 * Convenience function to suggest a category for a vendor.
 */
export function suggestCategory(vendor: string): CategorySuggestion | null {
  return autoCategorizer.suggestCategory(vendor);
}
