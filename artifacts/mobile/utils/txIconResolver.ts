export interface TxIconMeta {
  iconName: string;
  iconSet: "MaterialCommunityIcons" | "FontAwesome5" | "Feather";
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

/**
 * Intelligent transaction icon and brand resolver.
 * Detects specific brands (Walmart, Costco, Netflix, Spotify, Amazon, Apple, Banks, etc.)
 * or infers category context (Cafe, Dine-in restaurant, Groceries, Transit, Utilities, etc.)
 * and assigns signature glowing fintech colors and icons.
 */
export function getTxIconMeta(
  rawTitle?: string | null,
  rawMerchant?: string | null,
  rawCategory?: string | null,
  type?: string | null
): TxIconMeta {
  const title = (rawTitle || "").toLowerCase();
  const merchant = (rawMerchant || "").toLowerCase();
  const cat = (rawCategory || "").toLowerCase();
  const combined = `${title} ${merchant} ${cat}`;

  const makeMeta = (
    iconName: string,
    color: string,
    label: string,
    iconSet: "MaterialCommunityIcons" | "FontAwesome5" | "Feather" = "MaterialCommunityIcons"
  ): TxIconMeta => ({
    iconName,
    iconSet,
    color,
    bgColor: `${color}18`,
    borderColor: `${color}3D`,
    label,
  });

  // ── 1. Income, Salary, Payroll, Direct Deposit ───────────────────────────
  if (
    type === "income" ||
    combined.includes("payroll") ||
    combined.includes("salary") ||
    combined.includes("wages") ||
    combined.includes("direct dep") ||
    combined.includes("paycheque") ||
    combined.includes("paycheck") ||
    combined.includes("bonus")
  ) {
    return makeMeta("cash-multiple", "#10B981", "Income");
  }

  // ── 2. Transfers & Interac e-Transfers ────────────────────────────────────
  if (
    combined.includes("interac") ||
    combined.includes("etransfer") ||
    combined.includes("e-transfer") ||
    combined.includes("wire") ||
    combined.includes("virement") ||
    combined.includes("zelle") ||
    combined.includes("venmo") ||
    combined.includes("transfer")
  ) {
    return makeMeta("swap-horizontal", "#06B6D4", "Transfer");
  }

  // ── 3. Specific Banks & Financial Institutions ────────────────────────────
  if (combined.includes("td bank") || combined.includes("td canada") || combined.includes("td trust")) {
    return makeMeta("bank", "#008A00", "TD Bank");
  }
  if (combined.includes("rbc") || combined.includes("royal bank")) {
    return makeMeta("bank", "#0051A5", "RBC");
  }
  if (combined.includes("bmo") || combined.includes("bank of montreal")) {
    return makeMeta("bank", "#0079C1", "BMO");
  }
  if (combined.includes("scotiabank") || combined.includes("scotia")) {
    return makeMeta("bank", "#EC111A", "Scotiabank");
  }
  if (combined.includes("cibc")) {
    return makeMeta("bank", "#C41230", "CIBC");
  }
  if (combined.includes("desjardins")) {
    return makeMeta("bank", "#00874E", "Desjardins");
  }
  if (combined.includes("chase") || combined.includes("jpmorgan")) {
    return makeMeta("bank", "#117ACA", "Chase");
  }
  if (combined.includes("bank of america") || combined.includes("bofa")) {
    return makeMeta("bank", "#E31837", "Bank of America");
  }
  if (combined.includes("wells fargo")) {
    return makeMeta("bank", "#CD1309", "Wells Fargo");
  }
  if (combined.includes("citi") || combined.includes("citibank")) {
    return makeMeta("bank", "#003B70", "Citibank");
  }
  if (combined.includes("capital one")) {
    return makeMeta("bank", "#D03027", "Capital One");
  }
  if (combined.includes("american express") || combined.includes("amex")) {
    return makeMeta("credit-card-outline", "#006FCF", "Amex");
  }
  if (combined.includes("wealthsimple")) {
    return makeMeta("bank", "#F59E0B", "Wealthsimple");
  }
  if (combined.includes("tangerine") || combined.includes("simplii")) {
    return makeMeta("bank", "#EA580C", "Bank");
  }
  if (combined.includes("revolut") || combined.includes("monzo")) {
    return makeMeta("bank", "#8B5CF6", "Fintech Bank");
  }
  if (
    combined.includes("credit union") ||
    combined.includes("caisse") ||
    combined.includes("bank") ||
    cat.includes("bank")
  ) {
    return makeMeta("bank", "#3B82F6", "Bank");
  }

  // ── 4. Subscriptions & Digital Services ──────────────────────────────────
  if (combined.includes("netflix")) {
    return makeMeta("netflix", "#E50914", "Netflix");
  }
  if (combined.includes("spotify")) {
    return makeMeta("spotify", "#1DB954", "Spotify");
  }
  if (combined.includes("apple") || combined.includes("itunes") || combined.includes("icloud") || combined.includes("app store")) {
    return makeMeta("apple", "#94A3B8", "Apple");
  }
  if (combined.includes("amazon") || combined.includes("amzn") || combined.includes("prime video") || combined.includes("aws")) {
    return makeMeta("amazon", "#FF9900", "Amazon", "FontAwesome5");
  }
  if (combined.includes("youtube")) {
    return makeMeta("youtube", "#FF0000", "YouTube");
  }
  if (combined.includes("google") || combined.includes("gsuite") || combined.includes("google play")) {
    return makeMeta("google", "#4285F4", "Google");
  }
  if (
    combined.includes("disney") ||
    combined.includes("hulu") ||
    combined.includes("hbo") ||
    combined.includes("max") ||
    combined.includes("paramount") ||
    combined.includes("peacock") ||
    combined.includes("crave")
  ) {
    return makeMeta("television-play", "#3B82F6", "Streaming");
  }
  if (
    combined.includes("openai") ||
    combined.includes("chatgpt") ||
    combined.includes("github") ||
    combined.includes("cursor") ||
    combined.includes("anthropic") ||
    combined.includes("claude")
  ) {
    return makeMeta("robot", "#10A37F", "AI Subscription");
  }
  if (combined.includes("microsoft") || combined.includes("office 365") || combined.includes("xbox")) {
    return makeMeta("laptop", "#00A4EF", "Microsoft");
  }
  if (combined.includes("playstation") || combined.includes("sony playstation") || combined.includes("psn")) {
    return makeMeta("television-play", "#00439C", "PlayStation");
  }
  if (
    cat.includes("subscription") ||
    combined.includes("subscr") ||
    combined.includes("patreon") ||
    combined.includes("substack")
  ) {
    return makeMeta("television-play", "#8B5CF6", "Subscription");
  }

  // ── 5. Wholesale & Mega Retailers: Walmart & Costco ─────────────────────
  if (combined.includes("walmart") || combined.includes("wal-mart")) {
    return makeMeta("cart", "#0071CE", "Walmart");
  }
  if (combined.includes("costco")) {
    return makeMeta("cart-variant", "#E31837", "Costco");
  }
  if (combined.includes("target")) {
    return makeMeta("bullseye-arrow", "#CC0000", "Target");
  }
  if (combined.includes("best buy")) {
    return makeMeta("laptop", "#0046BE", "Best Buy");
  }
  if (combined.includes("home depot") || combined.includes("lowes") || combined.includes("lowe's") || combined.includes("rona")) {
    return makeMeta("hammer", "#F96302", "Home Depot");
  }
  if (combined.includes("ikea")) {
    return makeMeta("home-outline", "#0051BA", "IKEA");
  }
  if (combined.includes("dollarama") || combined.includes("dollar tree")) {
    return makeMeta("currency-usd", "#10B981", "Dollar Store");
  }

  // ── 6. Coffee Brands & Local / Non-popular Cafes ──────────────────────────
  if (combined.includes("starbucks")) {
    return makeMeta("coffee", "#00704A", "Starbucks");
  }
  if (combined.includes("tim hortons") || combined.includes("tim horton")) {
    return makeMeta("coffee", "#C8102E", "Tim Hortons");
  }
  if (combined.includes("dunkin")) {
    return makeMeta("coffee", "#FF671F", "Dunkin");
  }
  // Generic / Local / Non-popular Cafe & Bakery
  if (
    combined.includes("cafe") ||
    combined.includes("café") ||
    combined.includes("coffee") ||
    combined.includes("espresso") ||
    combined.includes("bakery") ||
    combined.includes("roaster") ||
    combined.includes("tea") ||
    combined.includes("boulangerie") ||
    combined.includes("patisserie") ||
    combined.includes("bagel") ||
    combined.includes("boba") ||
    combined.includes("matcha") ||
    combined.includes("donut") ||
    combined.includes("doughnut")
  ) {
    return makeMeta("coffee", "#D97706", "Cafe");
  }

  // ── 7. Fast Food Brands & Dine-In Restaurants ────────────────────────────
  // Popular fast food chains
  if (
    combined.includes("mcdonald") ||
    combined.includes("wendy") ||
    combined.includes("burger king") ||
    combined.includes("subway") ||
    combined.includes("chipotle") ||
    combined.includes("taco bell") ||
    combined.includes("kfc") ||
    combined.includes("domino") ||
    combined.includes("pizza hut") ||
    combined.includes("popeyes") ||
    combined.includes("five guys") ||
    combined.includes("chick-fil-a") ||
    combined.includes("dairy queen") ||
    combined.includes("shake shack")
  ) {
    return makeMeta("food", "#E11D48", "Fast Food");
  }

  // Dine-in restaurants / local eateries / bars / bistros (User requirement)
  if (
    combined.includes("restaurant") ||
    combined.includes("bistro") ||
    combined.includes("grill") ||
    combined.includes("kitchen") ||
    combined.includes("diner") ||
    combined.includes("pub") ||
    combined.includes("bar") ||
    combined.includes("brewery") ||
    combined.includes("tavern") ||
    combined.includes("lounge") ||
    combined.includes("cantina") ||
    combined.includes("trattoria") ||
    combined.includes("sushi") ||
    combined.includes("pizza") ||
    combined.includes("tacos") ||
    combined.includes("steak") ||
    combined.includes("steakhouse") ||
    combined.includes("pasta") ||
    combined.includes("noodle") ||
    combined.includes("ramen") ||
    combined.includes("pho") ||
    combined.includes("thai") ||
    combined.includes("bbq") ||
    combined.includes("eatery") ||
    combined.includes("brasserie") ||
    combined.includes("izakaya") ||
    combined.includes("curry") ||
    combined.includes("shwarma") ||
    combined.includes("shawarma") ||
    cat.includes("food") ||
    cat.includes("dining") ||
    cat.includes("restaurant")
  ) {
    return makeMeta("silverware-fork-knife", "#F97316", "Dine In");
  }

  // ── 8. Groceries & Supermarkets ──────────────────────────────────────────
  if (
    combined.includes("whole foods") ||
    combined.includes("trader joe") ||
    combined.includes("kroger") ||
    combined.includes("loblaws") ||
    combined.includes("no frills") ||
    combined.includes("metro") ||
    combined.includes("safeway") ||
    combined.includes("publix") ||
    combined.includes("aldi") ||
    combined.includes("farm boy") ||
    combined.includes("sobeys") ||
    combined.includes("food basics") ||
    combined.includes("superstore") ||
    combined.includes("grocery") ||
    combined.includes("supermarket") ||
    combined.includes("market") ||
    cat.includes("grocer")
  ) {
    return makeMeta("cart-outline", "#10B981", "Groceries");
  }

  // ── 9. Rides, Fuel & Travel ──────────────────────────────────────────────
  if (combined.includes("uber") || combined.includes("lyft")) {
    return makeMeta("car", "#38BDF8", "Rideshare");
  }
  if (
    combined.includes("shell") ||
    combined.includes("chevron") ||
    combined.includes("exxon") ||
    combined.includes("mobil") ||
    combined.includes("bp ") ||
    combined.includes("petro-canada") ||
    combined.includes("petro canada") ||
    combined.includes("petro") ||
    combined.includes("esso") ||
    combined.includes("sunoco") ||
    combined.includes("circle k") ||
    combined.includes("gas") ||
    combined.includes("fuel") ||
    combined.includes("oil")
  ) {
    return makeMeta("gas-station", "#F59E0B", "Fuel / Gas");
  }
  if (
    combined.includes("delta") ||
    combined.includes("united airlines") ||
    combined.includes("american airlines") ||
    combined.includes("air canada") ||
    combined.includes("westjet") ||
    combined.includes("southwest") ||
    combined.includes("flight") ||
    combined.includes("airline") ||
    combined.includes("airport") ||
    cat.includes("travel")
  ) {
    return makeMeta("airplane", "#0EA5E9", "Flight / Travel");
  }
  if (
    combined.includes("transit") ||
    combined.includes("metro") ||
    combined.includes("subway") ||
    combined.includes("presto") ||
    combined.includes("mta") ||
    combined.includes("train") ||
    combined.includes("bus") ||
    cat.includes("transport")
  ) {
    return makeMeta("bus", "#06B6D4", "Transit");
  }

  // ── 10. Utilities & Telecom ──────────────────────────────────────────────
  if (
    combined.includes("verizon") ||
    combined.includes("at&t") ||
    combined.includes("t-mobile") ||
    combined.includes("bell") ||
    combined.includes("rogers") ||
    combined.includes("telus") ||
    combined.includes("comcast") ||
    combined.includes("spectrum") ||
    combined.includes("fido") ||
    combined.includes("koodo") ||
    combined.includes("virgin mobile") ||
    combined.includes("mobile") ||
    combined.includes("cell")
  ) {
    return makeMeta("cellphone", "#8B5CF6", "Mobile / Telco");
  }
  if (
    combined.includes("electric") ||
    combined.includes("hydro") ||
    combined.includes("water") ||
    combined.includes("power") ||
    combined.includes("enbridge") ||
    combined.includes("utility") ||
    cat.includes("utilit")
  ) {
    return makeMeta("lightning-bolt", "#F59E0B", "Utilities");
  }

  // ── 11. Fitness, Health & Pharmacy ───────────────────────────────────────
  if (
    combined.includes("gym") ||
    combined.includes("fitness") ||
    combined.includes("goodlife") ||
    combined.includes("equinox") ||
    combined.includes("planet fitness") ||
    combined.includes("anytime fitness") ||
    combined.includes("crossfit") ||
    combined.includes("workout")
  ) {
    return makeMeta("dumbbell", "#A855F7", "Fitness");
  }
  if (
    combined.includes("cvs") ||
    combined.includes("walgreens") ||
    combined.includes("shoppers drug") ||
    combined.includes("shoppers") ||
    combined.includes("rexall") ||
    combined.includes("pharmacy") ||
    combined.includes("doctor") ||
    combined.includes("dental") ||
    combined.includes("clinic") ||
    cat.includes("health") ||
    cat.includes("medical")
  ) {
    return makeMeta("pill", "#14B8A6", "Health & Pharmacy");
  }

  // ── 12. General Shopping & Apparel ───────────────────────────────────────
  if (
    combined.includes("zara") ||
    combined.includes("h&m") ||
    combined.includes("uniqlo") ||
    combined.includes("nike") ||
    combined.includes("adidas") ||
    combined.includes("lululemon") ||
    combined.includes("gap") ||
    combined.includes("clothing") ||
    combined.includes("apparel")
  ) {
    return makeMeta("tshirt-crew", "#EC4899", "Clothing");
  }
  if (cat.includes("shop") || combined.includes("boutique") || combined.includes("store")) {
    return makeMeta("shopping", "#EC4899", "Shopping");
  }

  // ── 13. Entertainment & News ─────────────────────────────────────────────
  if (combined.includes("cinema") || combined.includes("theatre") || combined.includes("amc") || combined.includes("cineplex") || cat.includes("entertain")) {
    return makeMeta("movie-open", "#F43F5E", "Entertainment");
  }
  if (combined.includes("nytimes") || combined.includes("wsj") || combined.includes("economist") || combined.includes("news")) {
    return makeMeta("newspaper", "#64748B", "News");
  }

  // ── Default / Fallback ───────────────────────────────────────────────────
  return makeMeta("credit-card-outline", "#64748B", "General");
}

export default getTxIconMeta;
