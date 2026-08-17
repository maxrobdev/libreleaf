export const BRIEF_COUNTRIES = ["GB", "US", "CA", "AU", "NZ", "IE", "GLOBAL"] as const;
export type BriefCountry = typeof BRIEF_COUNTRIES[number];

export const BRIEF_TOPICS = ["top", "world", "business", "technology", "science"] as const;
export type BriefTopic = typeof BRIEF_TOPICS[number];
export const BRIEF_MAX_SELECTED_FEEDS = 4;

export type BriefFeed = {
  id: string;
  countries: BriefCountry[];
  topic: BriefTopic;
  name: string;
  language: string;
  feedUrl: string;
  homepage: string;
  articleHosts: string[];
  termsUrl: string;
};

const BBC_TERMS = "https://www.bbc.co.uk/usingthebbc/terms-of-use/";
const GUARDIAN_TERMS = "https://www.theguardian.com/help/terms-of-service";
const NPR_TERMS = "https://www.npr.org/about-npr/179876898/terms-of-use";
const GLOBAL_NEWS_TERMS = "https://globalnews.ca/terms-conditions/";
const SBS_TERMS = "https://www.sbs.com.au/terms";
const RNZ_TERMS = "https://www.rnz.co.nz/about/website-terms-of-use";
const RTE_TERMS = "https://www.rte.ie/terms/";
const UN_TERMS = "https://www.un.org/en/about-us/terms-of-use";

const ENGLISH_FEEDS: Array<Omit<BriefFeed, "language">> = [
  { id: "bbc-top", countries: ["GB"], topic: "top", name: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/rss.xml", homepage: "https://www.bbc.co.uk/news", articleHosts: ["bbc.co.uk", "bbc.com"], termsUrl: BBC_TERMS },
  { id: "bbc-world", countries: ["GB", "GLOBAL"], topic: "world", name: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", homepage: "https://www.bbc.co.uk/news/world", articleHosts: ["bbc.co.uk", "bbc.com"], termsUrl: BBC_TERMS },
  { id: "bbc-business", countries: ["GB", "GLOBAL"], topic: "business", name: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml", homepage: "https://www.bbc.co.uk/news/business", articleHosts: ["bbc.co.uk", "bbc.com"], termsUrl: BBC_TERMS },
  { id: "bbc-technology", countries: ["GB", "GLOBAL"], topic: "technology", name: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml", homepage: "https://www.bbc.co.uk/news/technology", articleHosts: ["bbc.co.uk", "bbc.com"], termsUrl: BBC_TERMS },
  { id: "bbc-science", countries: ["GB", "GLOBAL"], topic: "science", name: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", homepage: "https://www.bbc.co.uk/news/science_and_environment", articleHosts: ["bbc.co.uk", "bbc.com"], termsUrl: BBC_TERMS },

  { id: "guardian-top", countries: ["GB"], topic: "top", name: "The Guardian", feedUrl: "https://www.theguardian.com/uk-news/rss", homepage: "https://www.theguardian.com/uk-news", articleHosts: ["theguardian.com"], termsUrl: GUARDIAN_TERMS },
  { id: "guardian-world", countries: ["GB", "GLOBAL"], topic: "world", name: "The Guardian", feedUrl: "https://www.theguardian.com/world/rss", homepage: "https://www.theguardian.com/world", articleHosts: ["theguardian.com"], termsUrl: GUARDIAN_TERMS },
  { id: "guardian-business", countries: ["GB", "GLOBAL"], topic: "business", name: "The Guardian", feedUrl: "https://www.theguardian.com/uk/business/rss", homepage: "https://www.theguardian.com/uk/business", articleHosts: ["theguardian.com"], termsUrl: GUARDIAN_TERMS },
  { id: "guardian-technology", countries: ["GB", "GLOBAL"], topic: "technology", name: "The Guardian", feedUrl: "https://www.theguardian.com/uk/technology/rss", homepage: "https://www.theguardian.com/uk/technology", articleHosts: ["theguardian.com"], termsUrl: GUARDIAN_TERMS },
  { id: "guardian-science", countries: ["GB", "GLOBAL"], topic: "science", name: "The Guardian", feedUrl: "https://www.theguardian.com/science/rss", homepage: "https://www.theguardian.com/science", articleHosts: ["theguardian.com"], termsUrl: GUARDIAN_TERMS },

  { id: "npr-top", countries: ["US"], topic: "top", name: "NPR", feedUrl: "https://feeds.npr.org/1001/rss.xml", homepage: "https://www.npr.org/sections/news/", articleHosts: ["npr.org"], termsUrl: NPR_TERMS },
  { id: "npr-world", countries: ["US", "GLOBAL"], topic: "world", name: "NPR", feedUrl: "https://feeds.npr.org/1004/rss.xml", homepage: "https://www.npr.org/sections/world/", articleHosts: ["npr.org"], termsUrl: NPR_TERMS },
  { id: "npr-business", countries: ["US", "GLOBAL"], topic: "business", name: "NPR", feedUrl: "https://feeds.npr.org/1006/rss.xml", homepage: "https://www.npr.org/sections/business/", articleHosts: ["npr.org"], termsUrl: NPR_TERMS },
  { id: "npr-technology", countries: ["US", "GLOBAL"], topic: "technology", name: "NPR", feedUrl: "https://feeds.npr.org/1019/rss.xml", homepage: "https://www.npr.org/sections/technology/", articleHosts: ["npr.org"], termsUrl: NPR_TERMS },
  { id: "npr-science", countries: ["US", "GLOBAL"], topic: "science", name: "NPR", feedUrl: "https://feeds.npr.org/1007/rss.xml", homepage: "https://www.npr.org/sections/science/", articleHosts: ["npr.org"], termsUrl: NPR_TERMS },

  { id: "global-news-ca-top", countries: ["CA"], topic: "top", name: "Global News Canada", feedUrl: "https://globalnews.ca/canada/feed/", homepage: "https://globalnews.ca/canada/", articleHosts: ["globalnews.ca"], termsUrl: GLOBAL_NEWS_TERMS },
  { id: "global-news-ca-world", countries: ["CA"], topic: "world", name: "Global News Canada", feedUrl: "https://globalnews.ca/world/feed/", homepage: "https://globalnews.ca/world/", articleHosts: ["globalnews.ca"], termsUrl: GLOBAL_NEWS_TERMS },
  { id: "global-news-ca-business", countries: ["CA"], topic: "business", name: "Global News Canada", feedUrl: "https://globalnews.ca/money/feed/", homepage: "https://globalnews.ca/money/", articleHosts: ["globalnews.ca"], termsUrl: GLOBAL_NEWS_TERMS },
  { id: "global-news-ca-technology", countries: ["CA"], topic: "technology", name: "Global News Canada", feedUrl: "https://globalnews.ca/tag/technology/feed/", homepage: "https://globalnews.ca/tag/technology/", articleHosts: ["globalnews.ca"], termsUrl: GLOBAL_NEWS_TERMS },

  { id: "sbs-top", countries: ["AU"], topic: "top", name: "SBS News", feedUrl: "https://www.sbs.com.au/news/feed", homepage: "https://www.sbs.com.au/news", articleHosts: ["sbs.com.au"], termsUrl: SBS_TERMS },
  { id: "sbs-world", countries: ["AU"], topic: "world", name: "SBS News", feedUrl: "https://www.sbs.com.au/news/topic/world/feed", homepage: "https://www.sbs.com.au/news/topic/world", articleHosts: ["sbs.com.au"], termsUrl: SBS_TERMS },

  { id: "rnz-top", countries: ["NZ"], topic: "top", name: "RNZ", feedUrl: "https://www.rnz.co.nz/rss/national.xml", homepage: "https://www.rnz.co.nz/news/national", articleHosts: ["rnz.co.nz"], termsUrl: RNZ_TERMS },
  { id: "rnz-world", countries: ["NZ"], topic: "world", name: "RNZ", feedUrl: "https://www.rnz.co.nz/rss/world.xml", homepage: "https://www.rnz.co.nz/news/world", articleHosts: ["rnz.co.nz"], termsUrl: RNZ_TERMS },
  { id: "rnz-business", countries: ["NZ"], topic: "business", name: "RNZ", feedUrl: "https://www.rnz.co.nz/rss/business.xml", homepage: "https://www.rnz.co.nz/news/business", articleHosts: ["rnz.co.nz"], termsUrl: RNZ_TERMS },
  { id: "rnz-technology", countries: ["NZ"], topic: "technology", name: "RNZ", feedUrl: "https://www.rnz.co.nz/rss/media-technology.xml", homepage: "https://www.rnz.co.nz/news/media-technology", articleHosts: ["rnz.co.nz"], termsUrl: RNZ_TERMS },
  { id: "rnz-science", countries: ["NZ"], topic: "science", name: "RNZ", feedUrl: "https://www.rnz.co.nz/rss/environment.xml", homepage: "https://www.rnz.co.nz/news/environment", articleHosts: ["rnz.co.nz"], termsUrl: RNZ_TERMS },

  { id: "rte-top", countries: ["IE"], topic: "top", name: "RTÉ News", feedUrl: "https://www.rte.ie/feeds/rss/?index=/news/", homepage: "https://www.rte.ie/news/", articleHosts: ["rte.ie"], termsUrl: RTE_TERMS },
  { id: "rte-world", countries: ["IE"], topic: "world", name: "RTÉ News", feedUrl: "https://www.rte.ie/feeds/rss/?index=/news/world/", homepage: "https://www.rte.ie/news/world/", articleHosts: ["rte.ie"], termsUrl: RTE_TERMS },
  { id: "rte-business", countries: ["IE"], topic: "business", name: "RTÉ News", feedUrl: "https://www.rte.ie/feeds/rss/?index=/news/business/", homepage: "https://www.rte.ie/news/business/", articleHosts: ["rte.ie"], termsUrl: RTE_TERMS },
  { id: "rte-technology", countries: ["IE"], topic: "technology", name: "RTÉ News", feedUrl: "https://www.rte.ie/feeds/rss/?index=/news/technology/", homepage: "https://www.rte.ie/news/technology/", articleHosts: ["rte.ie"], termsUrl: RTE_TERMS },

  { id: "un-top", countries: ["GLOBAL"], topic: "top", name: "UN News", feedUrl: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", homepage: "https://news.un.org/en/", articleHosts: ["news.un.org"], termsUrl: UN_TERMS },
  { id: "bbc-global-top", countries: ["GLOBAL"], topic: "top", name: "BBC World News", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", homepage: "https://www.bbc.co.uk/news/world", articleHosts: ["bbc.co.uk", "bbc.com"], termsUrl: BBC_TERMS },
];

export const BRIEF_FEEDS: readonly BriefFeed[] = ENGLISH_FEEDS.map((feed) => ({
  ...feed,
  language: "English",
}));

export const BRIEF_COUNTRY_LABELS: Record<BriefCountry, string> = {
  GB: "United Kingdom",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  IE: "Ireland",
  GLOBAL: "Global",
};

export const BRIEF_TOPIC_LABELS: Record<BriefTopic, string> = {
  top: "Top stories",
  world: "World",
  business: "Business",
  technology: "Technology",
  science: "Science & environment",
};

export function feedsFor(country: BriefCountry, topic: BriefTopic, registry: readonly BriefFeed[] = BRIEF_FEEDS) {
  return registry.filter((feed) => feed.countries.includes(country) && feed.topic === topic);
}

export function topicsForCountry(country: BriefCountry, registry: readonly BriefFeed[] = BRIEF_FEEDS): BriefTopic[] {
  return BRIEF_TOPICS.filter((topic) => feedsFor(country, topic, registry).length > 0);
}
