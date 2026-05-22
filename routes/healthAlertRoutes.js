const express = require("express");

const router = express.Router();

const WHO_DON_RSS_URL = "https://www.who.int/feeds/entity/csr/don/en/rss.xml";

const stripTags = (value = "") => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();

const tagValue = (item, tag) => {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
};

router.get("/", async (req, res) => {
  try {
    const response = await fetch(WHO_DON_RSS_URL);
    if (!response.ok) throw new Error("WHO feed unavailable");

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const alerts = items.slice(0, 8).map((item) => ({
      title: tagValue(item, "title"),
      link: tagValue(item, "link"),
      publishedAt: tagValue(item, "pubDate"),
      summary: tagValue(item, "description"),
      source: "WHO Disease Outbreak News"
    }));

    res.json({
      source: "WHO Disease Outbreak News",
      sourceUrl: WHO_DON_RSS_URL,
      alerts
    });
  } catch (error) {
    res.json({
      source: "WHO Disease Outbreak News",
      sourceUrl: WHO_DON_RSS_URL,
      alerts: [],
      message: "Disease alerts are temporarily unavailable. Please check WHO Disease Outbreak News."
    });
  }
});

module.exports = router;
