const express = require("express");

const router = express.Router();

const DEFAULT_FEEDS = [
  {
    name: "MedlinePlus Health Updates",
    url: "https://medlineplus.gov/feeds/whatsnew.xml"
  },
  {
    name: "SAMHSA Behavioral Health News",
    url: "https://www.samhsa.gov/newsroom/press-announcements/rss"
  }
];

const fallbackAlerts = [
  {
    title: "Check trusted health updates",
    link: "https://medlineplus.gov/",
    publishedAt: new Date().toUTCString(),
    summary: "Live health news could not be loaded right now. Open MedlinePlus for trusted health and wellness information.",
    source: "LifeBuddy fallback"
  },
  {
    title: "Keep daily habits steady",
    link: "https://medlineplus.gov/healthyliving.html",
    publishedAt: new Date().toUTCString(),
    summary: "Continue tracking sleep, water, exercise, medicine, food, stress, and alcohol safety while news updates are unavailable.",
    source: "LifeBuddy fallback"
  }
];

const decodeEntities = (value = "") =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");

const stripTags = (value = "") => decodeEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const tagValue = (item, tag) => {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
};

const parseFeed = (xml, source) => {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  return items.slice(0, 6).map((item) => {
    const linkMatch = item.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    return {
      title: tagValue(item, "title") || "Health update",
      link: tagValue(item, "link") || stripTags(linkMatch?.[1] || source.url),
      publishedAt: tagValue(item, "pubDate") || tagValue(item, "updated") || tagValue(item, "published") || "",
      summary: tagValue(item, "description") || tagValue(item, "summary") || "Open the source to read the full trusted health update.",
      source: source.name
    };
  });
};

router.get("/", async (req, res) => {
  const feeds = process.env.HEALTH_NEWS_FEEDS
    ? process.env.HEALTH_NEWS_FEEDS.split(",").map((url, index) => ({ name: `Health Feed ${index + 1}`, url: url.trim() })).filter((feed) => feed.url)
    : DEFAULT_FEEDS;

  const alerts = [];
  const failedSources = [];

  try {
    for (const source of feeds) {
      try {
        const response = await fetch(source.url, {
          headers: { "User-Agent": "LifeBuddy Health Companion/1.0" }
        });
        if (!response.ok) throw new Error(`${source.name} unavailable`);
        const xml = await response.text();
        alerts.push(...parseFeed(xml, source));
      } catch (error) {
        failedSources.push(source.name);
      }
    }

    res.json({
      source: "Trusted Health News",
      sourceUrl: feeds.map((feed) => feed.url).join(", "),
      alerts: alerts.length ? alerts.slice(0, 10) : fallbackAlerts,
      message: alerts.length
        ? failedSources.length
          ? `Loaded trusted health updates. Some sources failed: ${failedSources.join(", ")}.`
          : "Trusted health updates loaded."
        : "Live health news feeds are unavailable right now. Showing fallback wellness guidance.",
      fallback: !alerts.length
    });
  } catch (error) {
    res.json({
      source: "Trusted Health News",
      sourceUrl: feeds.map((feed) => feed.url).join(", "),
      alerts: fallbackAlerts,
      message: "Live health news is temporarily unavailable. Showing safe fallback wellness guidance.",
      fallback: true
    });
  }
});

module.exports = router;
